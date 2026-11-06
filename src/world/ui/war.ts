import { bannerArt, FLAG_COLORS, guildCrest } from "../art/world-art";
import { formatAmount } from "../chain/amount";
import type { GuildRow, ShopOverview } from "../chain/game";
import { GUILDS, GUILD_ORDER } from "../data";
import { guildFor } from "../engine";
import { num } from "../i18n";
import type { GuildId } from "../types";
import { art, h, type Child } from "./dom";
import { addressLink, amountField, busyLine, chainButton, chainNotice, ctr, displayName, nameProblem, submitAmount, tokenAmount, type ChainView } from "./chain-parts";
import { card, hint, tr, type View } from "./parts";

// The guild war on Sepolia: the player's guild for each season as WorldShop
// records it, SQB supplies for this week's boss, the supplies leaderboard,
// player-founded guilds and founding one. The four built-in guilds are ids 1
// to 4 on-chain; a founded guild plays like the built-in guild of its perk.

const BUILT_IN = GUILD_ORDER.length;

/** The built-in guild whose perks a guild on Sepolia gives in the world. */
export function localGuildOf(row: Pick<GuildRow, "id" | "perk">): GuildId {
  return row.id <= BUILT_IN ? GUILD_ORDER[row.id - 1] : GUILD_ORDER[row.perk % BUILT_IN];
}

/** A built-in guild's id on Sepolia. */
export const chainGuildId = (id: GuildId) => GUILD_ORDER.indexOf(id) + 1;

export function guildName(v: View, row: GuildRow): string {
  return row.id <= BUILT_IN ? GUILDS[GUILD_ORDER[row.id - 1]].name[v.lang] : displayName(row.name) || `#${row.id}`;
}

function guildPic(row: GuildRow, cls: string): HTMLElement {
  const pic = art(row.id <= BUILT_IN ? guildCrest(GUILD_ORDER[row.id - 1]) : bannerArt(row.flag, row.perk), cls);
  pic.style.setProperty("--guild", GUILDS[localGuildOf(row)].color);
  return pic;
}

/** The first season, this one or the next, the player could still join a guild with this perk. 0 if neither. */
export function joinableSeason(v: View, o: ShopOverview, perk: GuildId): number {
  const options: [number, number][] = [
    [o.season, o.guildThisSeason],
    [o.season + 1, o.guildNextSeason],
  ];
  for (const [season, onChain] of options) {
    if (season < 1 || onChain) continue;
    const local = guildFor(v.world, season);
    // The world's guild for a season is final; on-chain the player can only take one that plays the same.
    if (local && local !== perk) continue;
    return season;
  }
  return 0;
}

const MARK = "\u0000";

/** A sentence with a link (or any node) where its `{addr}` was. */
function withNode(text: string, node: Node): Child[] {
  const at = text.indexOf(MARK);
  return at < 0 ? [text, " ", node] : [text.slice(0, at), node, text.slice(at + MARK.length)];
}

const reading = (v: View, c: ChainView) => hint(ctr(v, c.s.readFailed ? "wallet.readFailed" : "wallet.reading"));

/** Replaces the world-only "Join a guild" card while the World is on Sepolia. */
export function warMember(v: View): HTMLElement {
  const c = v.chain!;
  const o = c.s.overview;
  const guilds = c.s.guilds;
  if (!o || !guilds) return card("guild-member war", ctr(v, "war.title"), reading(v, c));
  const season = o.season;
  const byId = new Map(guilds.map((g) => [g.id, g]));
  const parts: Child[] = [hint(ctr(v, "war.lead")), chainNotice(v)];
  if (season < 1) return card("guild-member war", ctr(v, "war.title"), ...parts, hint(ctr(v, "err.SeasonNotStarted")));

  const now = byId.get(o.guildThisSeason);
  const localNow = guildFor(v.world, season);
  if (now) {
    const local = localGuildOf(now);
    const badge = h(
      "div",
      { class: "member" },
      guildPic(now, "crest-pic big"),
      h(
        "div",
        null,
        h("strong", null, ctr(v, "war.member", { guild: guildName(v, now) })),
        h("span", null, `${tr(v, "guild.perk")}: ${GUILDS[local].perk[v.lang]}`),
        h("span", { class: "muted small" }, ctr(v, "war.members", { n: num(v.lang, now.members) })),
      ),
    );
    badge.style.setProperty("--guild", GUILDS[local].color);
    parts.push(badge);
    if (localNow && localNow !== local) parts.push(hint(ctr(v, "war.mismatch", { chain: guildName(v, now), local: GUILDS[localNow].name[v.lang] }), "hint warn"));
    parts.push(supplies(v, c, o, now));
  } else if (localNow) {
    parts.push(register(v, c, localNow, season, "war.registerNote"));
  } else {
    parts.push(hint(ctr(v, "war.pick", { n: season })), picks(v, c, season, false));
  }

  const next = byId.get(o.guildNextSeason);
  const localNext = guildFor(v.world, season + 1);
  if (next) parts.push(h("p", { class: "next-guild" }, guildPic(next, "crest-pic small"), ctr(v, "war.next", { guild: guildName(v, next) })));
  else if (localNext) parts.push(register(v, c, localNext, season + 1, "war.registerNext"));
  else if (now) parts.push(h("h3", null, tr(v, "guild.joinNext")), picks(v, c, season + 1, true));
  parts.push(busyLine(v, ["joinGuild"]));
  return card("guild-member war", ctr(v, "war.title"), ...parts);
}

function register(v: View, c: ChainView, local: GuildId, season: number, key: "war.registerNote" | "war.registerNext"): HTMLElement {
  return h(
    "div",
    { class: "register" },
    art(guildCrest(local), "crest-pic"),
    h("p", null, ctr(v, key, { guild: GUILDS[local].name[v.lang] })),
    chainButton(v, ctr(v, "war.register"), () => c.joinGuild(chainGuildId(local), season), { primary: true, small: true }),
  );
}

function picks(v: View, c: ChainView, season: number, compact: boolean): HTMLElement {
  return h(
    "ul",
    { class: compact ? "guild-picks compact" : "guild-picks" },
    ...GUILD_ORDER.map((id) => {
      const spec = GUILDS[id];
      const item = h(
        "li",
        { class: "guild-pick" },
        art(guildCrest(id), "crest-pic"),
        h("strong", null, spec.name[v.lang]),
        h("span", null, spec.perk[v.lang]),
        chainButton(v, tr(v, "guild.joinFor", { n: season }), () => c.joinGuild(chainGuildId(id), season), { small: true }),
      );
      item.style.setProperty("--guild", spec.color);
      return item;
    }),
  );
}

function supplies(v: View, c: ChainView, o: ShopOverview, guild: GuildRow): HTMLElement {
  const field = amountField(v, "supply", ctr(v, "war.amount"), o.sqbBalance);
  const blocked = c.s.busy ? ctr(v, "err.busy") : o.sqbBalance > 0n ? null : ctr(v, "err.ERC20InsufficientBalance");
  return h(
    "div",
    { class: "supply" },
    h("h3", null, ctr(v, "war.supply")),
    hint(ctr(v, "war.supplyNote", { guild: guildName(v, guild) }), "hint small"),
    h("div", { class: "supply-row" }, field.field, chainButton(v, ctr(v, "war.supply"), () => submitAmount(v, field.read(), o.sqbBalance, (amount) => c.supply(amount)), { primary: true, blocked })),
    h("p", { class: "muted small" }, `${ctr(v, "war.inWallet", { n: formatAmount(o.sqbBalance, 2) })} · ${ctr(v, "war.supplied", { n: formatAmount(o.suppliedThisSeason, 2) })}`),
    busyLine(v, ["supply"]),
  );
}

const bySupply = (a: GuildRow, b: GuildRow) => (b.supply > a.supply ? 1 : b.supply < a.supply ? -1 : b.members - a.members || a.id - b.id);

/** This season's supplies by guild, most first. */
export function warBoard(v: View): HTMLElement | null {
  const c = v.chain!;
  const o = c.s.overview;
  const guilds = c.s.guilds;
  if (!o || !guilds || o.season < 1) return null;
  const ranked = guilds.filter((g) => g.id <= BUILT_IN || g.members > 0 || g.supply > 0n).sort(bySupply);
  const shown = ranked.slice(0, 10);
  const mine = ranked.find((g) => g.id === o.guildThisSeason);
  if (mine && !shown.includes(mine)) shown.push(mine);
  const rows = shown.map((g) => {
    const yours = g.id === o.guildThisSeason;
    const damage = Number((g.supply * 10n) / 10n ** 18n);
    return h(
      "li",
      { class: yours ? "board-row yours" : "board-row" },
      h("span", { class: "rank" }, String(ranked.indexOf(g) + 1)),
      guildPic(g, "crest-pic small"),
      h(
        "span",
        { class: "board-name" },
        h("strong", null, guildName(v, g)),
        h("span", { class: "muted small" }, [ctr(v, "war.members", { n: num(v.lang, g.members) }), yours ? ctr(v, "war.yours") : null].filter(Boolean).join(" · ")),
      ),
      h("span", { class: "board-supply" }, tokenAmount("SQB", g.supply, 0), h("span", { class: "muted small" }, ctr(v, "war.damage", { n: num(v.lang, damage) }))),
    );
  });
  const empty = !ranked.some((g) => g.supply > 0n);
  return card("war-board", ctr(v, "war.board", { n: o.season }), empty ? hint(ctr(v, "war.boardEmpty")) : null, h("ol", { class: "board" }, ...rows));
}

/** Guilds players founded, newest first, with a way to join them. */
export function playerGuilds(v: View): HTMLElement | null {
  const c = v.chain!;
  const o = c.s.overview;
  const guilds = c.s.guilds;
  if (!o || !guilds) return null;
  const list = guilds
    .filter((g) => g.id > BUILT_IN)
    .sort((a, b) => b.id - a.id)
    .slice(0, 30);
  const items = list.map((g) => {
    const local = localGuildOf(g);
    const season = joinableSeason(v, o, local);
    const item = h(
      "li",
      { class: "player-guild" },
      guildPic(g, "crest-pic"),
      h(
        "div",
        { class: "player-guild-text" },
        h("strong", null, guildName(v, g)),
        h("span", { class: "small" }, ctr(v, "war.perkOf", { guild: GUILDS[local].name[v.lang] }), " · ", GUILDS[local].perk[v.lang]),
        h("span", { class: "muted small" }, ...withNode(ctr(v, "war.founder", { n: g.foundedSeason, addr: MARK }), addressLink(v, g.founder)), ` · ${ctr(v, "war.members", { n: num(v.lang, g.members) })}`),
      ),
      season && !(o.guildThisSeason === g.id || o.guildNextSeason === g.id)
        ? chainButton(v, ctr(v, "war.join", { n: season }), () => c.joinGuild(g.id, season), { small: true })
        : null,
    );
    item.style.setProperty("--guild", GUILDS[local].color);
    return item;
  });
  return card("war-players", ctr(v, "war.players"), items.length ? h("ul", { class: "player-guilds" }, ...items) : hint(ctr(v, "war.playersNone")));
}

/** Founding a guild: a name, a flag and a perk, for a banner's price in SQK. */
export function foundGuild(v: View): HTMLElement | null {
  const c = v.chain!;
  const o = c.s.overview;
  const p = c.s.prices;
  if (!o || !p) return null;
  const left = Math.max(0, p.bannersPerSeason - o.bannersThisSeason);
  const flag = ((v.ui.flag % FLAG_COLORS.length) + FLAG_COLORS.length) % FLAG_COLORS.length;
  const perk = ((v.ui.perk % BUILT_IN) + BUILT_IN) % BUILT_IN;
  const perkGuild = GUILD_ORDER[perk];
  const joinSeason = joinableSeason(v, o, perkGuild);

  const key = "found-name";
  const input = h("input", { type: "text", class: "name-input", maxlength: 32, "aria-label": ctr(v, "found.name"), placeholder: ctr(v, "found.name"), name: key, autocomplete: "off" });
  input.value = v.ui.form[key] ?? "";
  const preview = h("strong", { class: "banner-name" }, displayName(input.value) || ctr(v, "found.name"));
  input.addEventListener("input", () => {
    v.ui.form[key] = input.value;
    preview.textContent = displayName(input.value) || ctr(v, "found.name");
  });

  const flags = h(
    "div",
    { class: "flag-picks", role: "group", "aria-label": ctr(v, "found.flag") },
    ...FLAG_COLORS.map(([fill, ink], i) => {
      const button = h("button", { type: "button", class: i === flag ? "swatch on" : "swatch", "aria-pressed": String(i === flag), "aria-label": `${ctr(v, "found.flag")} ${i + 1}`, title: `${ctr(v, "found.flag")} ${i + 1}` });
      button.style.setProperty("--fill", fill);
      button.style.setProperty("--ink", ink);
      button.addEventListener("click", () => {
        v.ui.flag = i;
        v.redraw();
      });
      return button;
    }),
  );
  const perks = h(
    "div",
    { class: "perk-picks", role: "group", "aria-label": ctr(v, "found.perk") },
    ...GUILD_ORDER.map((id, i) => {
      const spec = GUILDS[id];
      const button = h(
        "button",
        { type: "button", class: i === perk ? "perk-pick on" : "perk-pick", "aria-pressed": String(i === perk) },
        art(guildCrest(id, "crest tiny"), "crest-pic small"),
        h("span", null, h("strong", null, ctr(v, "war.perkOf", { guild: spec.name[v.lang] })), h("small", null, spec.perk[v.lang])),
      );
      button.style.setProperty("--guild", spec.color);
      button.addEventListener("click", () => {
        v.ui.perk = i;
        v.redraw();
      });
      return button;
    }),
  );

  const blocked = c.s.busy
    ? ctr(v, "err.busy")
    : o.season < 1
      ? ctr(v, "err.SeasonNotStarted")
      : left === 0
        ? ctr(v, "found.soldOut")
        : o.sqkBalance < p.bannerPrice
          ? ctr(v, "err.ERC20InsufficientBalance")
          : null;
  const go = chainButton(
    v,
    `${ctr(v, "found.go")} · ${formatAmount(p.bannerPrice, 0)} SQK`,
    () => {
      const name = input.value.trim();
      const problem = nameProblem(name);
      if (problem) v.toast(ctr(v, problem), "warn");
      else c.foundGuild(name, flag, perk, joinSeason);
    },
    { primary: true, blocked },
  );

  return card(
    "war-found",
    ctr(v, "found.title"),
    hint(ctr(v, "found.lead", { price: formatAmount(p.bannerPrice, 0), left, cap: p.bannersPerSeason })),
    h(
      "div",
      { class: "found-body" },
      h("div", { class: "banner-preview" }, art(bannerArt(flag, perk), "banner-pic"), preview),
      h(
        "div",
        { class: "found-fields" },
        h("label", { class: "field" }, h("span", { class: "label" }, ctr(v, "found.name")), input, h("span", { class: "muted small" }, ctr(v, "found.nameNote"))),
        h("div", { class: "field" }, h("span", { class: "label" }, ctr(v, "found.flag")), flags),
        h("div", { class: "field" }, h("span", { class: "label" }, ctr(v, "found.perk")), perks),
      ),
    ),
    hint(joinSeason === o.season ? ctr(v, "found.joinNow", { n: joinSeason }) : joinSeason ? ctr(v, "found.joinNext", { n: joinSeason }) : ctr(v, "found.noJoin"), "hint small"),
    go,
    busyLine(v, ["foundGuild"]),
  );
}
