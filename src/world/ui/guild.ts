import { ACTION_NAMES, ACTION_ORDER, CHEST_TIERS, CLASSES, CLASS_ORDER, COMMUNITY_SHARE, EFFECT, GUILDS, GUILD_ORDER, MILESTONE_SHARE, NIGHT_WATCH, STANCES, STANCE_NAMES } from "../data";
import { chestTier, clockOf, currentSeason, guildFor } from "../engine";
import { duration, num } from "../i18n";
import { MARKS } from "../art/icons";
import { bossArt, chestArt, guildCrest } from "../art/world-art";
import { bossOf, seasonEnd } from "../season";
import type { ActionId, ClassId, GuildId } from "../types";
import { art, h } from "./dom";
import { bar, card, choiceButton, hint, segmented, sentences, tr, type View } from "./parts";

// Plan D, the guild: this week's shared boss, the player's guild, class and
// plan, and the season chests.

export function guildView(v: View): HTMLElement[] {
  const season = currentSeason(v.world);
  return [boss(v, season), membership(v, season), plan(v, season), chests(v, season)];
}

function boss(v: View, season: number): HTMLElement {
  const spec = bossOf(season);
  // The trial world keeps its own clock; the real one follows the wall clock.
  const now = v.kind === "sim" ? clockOf(v.world) : Date.now();
  const left = Math.max(0, seasonEnd(season) - now);
  const head = h(
    "div",
    { class: "boss-head" },
    art(bossArt(spec.id), "boss-pic"),
    h(
      "div",
      { class: "boss-title" },
      h("span", { class: "season" }, `${tr(v, "guild.season", { n: season })} · ${tr(v, "guild.endsIn", { time: duration(v.lang, left) })}`),
      h("strong", null, spec.name[v.lang]),
      h("span", null, spec.title[v.lang]),
    ),
  );
  const body = h("div", { class: "boss-body" });
  if (v.boss.state === "loading") body.append(hint(tr(v, "guild.loading")));
  else if (v.boss.state === "error") body.append(hint(tr(v, "guild.unknown"), "hint warn"));
  else {
    const read = v.boss.boss;
    const hp = h("div", { class: "hp" }, bar((read.left ?? spec.hp) / spec.hp, "hp-bar"), h("span", null, tr(v, "guild.hp", { left: read.left ?? spec.hp, hp: spec.hp })));
    hp.style.setProperty("--boss", spec.color);
    body.append(hp);
    if (read.defeated) body.append(h("p", { class: "defeated" }, art(MARKS.check, "mark"), tr(v, "guild.defeated")));
    const source = (label: string, value: number | null, note?: string, full = false) =>
      h(
        "li",
        { class: full ? "full" : null },
        h("span", null, label),
        h("strong", null, value === null ? "—" : num(v.lang, value)),
        note ? h("small", null, note) : null,
      );
    const communityFull = read.community !== null && read.community >= read.communityCap;
    const milestonesFull = read.milestones !== null && read.milestones >= read.milestoneCap;
    body.append(
      h(
        "ul",
        { class: "sources" },
        source(tr(v, "guild.fromHamster"), read.hamster, tr(v, "guild.settledWork")),
        read.simulated
          ? null
          : source(
              tr(v, "guild.fromCommunity"),
              read.community,
              communityFull ? tr(v, "guild.full", { pct: COMMUNITY_SHARE * 100 }) : tr(v, "guild.actions", { n: read.communityCount, cap: read.communityCap }),
              communityFull,
            ),
        read.simulated
          ? null
          : source(
              tr(v, "guild.fromMilestones"),
              read.milestones,
              milestonesFull ? tr(v, "guild.full", { pct: MILESTONE_SHARE * 100 }) : tr(v, "guild.milestones", { n: read.milestoneCount, cap: read.milestoneCap }),
              milestonesFull,
            ),
      ),
    );
    if (read.simulated) body.append(hint(tr(v, "guild.simBoss")));
    else if (!read.complete) body.append(hint(tr(v, "guild.partial"), "hint warn"));
  }
  // The trial boss explains itself above; the shared rules are for the real one.
  const shared = v.kind === "sim" ? null : hint(sentences(v, tr(v, "guild.shared"), tr(v, "guild.caps", { community: COMMUNITY_SHARE * 100, milestones: MILESTONE_SHARE * 100 })));
  return card("guild-boss", tr(v, "guild.boss"), head, body, shared);
}

function crestCard(v: View, id: GuildId, season: number, label: string): HTMLElement {
  const spec = GUILDS[id];
  const item = h(
    "li",
    { class: "guild-pick" },
    art(guildCrest(id), "crest-pic"),
    h("strong", null, spec.name[v.lang]),
    h("span", null, spec.perk[v.lang]),
    choiceButton(v, label, { t: "guild", guild: id, season }, { small: true }),
  );
  item.style.setProperty("--guild", spec.color);
  return item;
}

function membership(v: View, season: number): HTMLElement {
  const now = guildFor(v.world, season);
  const next = guildFor(v.world, season + 1);
  const parts: HTMLElement[] = [];
  if (now) {
    const spec = GUILDS[now];
    const badge = h(
      "div",
      { class: "member" },
      art(guildCrest(now), "crest-pic big"),
      h("div", null, h("strong", null, tr(v, "guild.member", { guild: spec.name[v.lang], n: season })), h("span", null, `${tr(v, "guild.perk")}: ${spec.perk[v.lang]}`)),
    );
    badge.style.setProperty("--guild", spec.color);
    parts.push(badge);
  } else {
    parts.push(hint(tr(v, "guild.notMember")), h("ul", { class: "guild-picks" }, ...GUILD_ORDER.map((id) => crestCard(v, id, season, tr(v, "guild.joinFor", { n: season })))));
  }
  if (next) {
    parts.push(h("p", { class: "next-guild" }, art(guildCrest(next), "crest-pic small"), tr(v, "guild.next", { guild: GUILDS[next].name[v.lang] })));
  } else if (now) {
    parts.push(h("h3", null, tr(v, "guild.joinNext")), h("ul", { class: "guild-picks compact" }, ...GUILD_ORDER.map((id) => crestCard(v, id, season + 1, tr(v, "guild.joinFor", { n: season + 1 })))));
  }
  return card("guild-member", tr(v, "guild.join"), ...parts);
}

function plan(v: View, season: number): HTMLElement {
  const state = v.world.guild;
  const cls = CLASSES[state.cls];
  const classes = segmented<ClassId>(tr(v, "guild.class"), state.cls, CLASS_ORDER.map((id) => [id, CLASSES[id].name[v.lang]]), (id) => v.act({ t: "class", cls: id }));
  const actions = segmented<ActionId>(tr(v, "guild.action"), state.action, ACTION_ORDER.map((id) => [id, ACTION_NAMES[id][v.lang]]), (id) => v.act({ t: "action", action: id }));
  const observatory = (v.world.buildings.observatory ?? 0) > 0;
  const moods = bossOf(season).moods;
  const table = h(
    "table",
    { class: "effects" },
    h("thead", null, h("tr", null, h("th", null, tr(v, "guild.mood")), h("th", null, ACTION_NAMES[state.action][v.lang]), observatory ? h("th", null, tr(v, "guild.chance")) : null)),
    h(
      "tbody",
      null,
      ...STANCES.map((stance) =>
        h(
          "tr",
          null,
          h("td", null, STANCE_NAMES[stance][v.lang]),
          h("td", { class: EFFECT[state.action][stance] >= 150 ? "good" : EFFECT[state.action][stance] < 100 ? "poor" : "" }, `${EFFECT[state.action][stance]}%`),
          observatory ? h("td", null, `${moods[stance]}%`) : null,
        ),
      ),
    ),
  );
  return card(
    "guild-plan",
    tr(v, "guild.plan"),
    h("div", { class: "field" }, h("span", { class: "label" }, tr(v, "guild.class")), classes, h("p", { class: "hint" }, cls.skill[v.lang])),
    h("div", { class: "field" }, h("span", { class: "label" }, tr(v, "guild.action")), actions),
    table,
    hint(observatory ? tr(v, "guild.actionNote") : sentences(v, tr(v, "guild.actionNote"), tr(v, "guild.moodsLocked"))),
  );
}

function chests(v: View, season: number): HTMLElement {
  const state = v.world.guild;
  const mine = state.contribution[season] ?? 0;
  const tier = chestTier(mine, false);
  const next = CHEST_TIERS.find((t) => t.min > mine);
  const progress = h(
    "div",
    { class: "chest-now" },
    art(chestArt(tier?.id ?? null), "chest-pic"),
    h(
      "div",
      null,
      h("span", { class: "label" }, tr(v, "guild.contribution")),
      h("strong", { class: "big-number" }, num(v.lang, mine)),
      h("span", null, tier ? tr(v, "guild.chestNow", { chest: tier.name[v.lang] }) : tr(v, "guild.chestNone")),
      next ? bar(mine / next.min, "chest-bar") : null,
      h("span", { class: "muted" }, next ? tr(v, "guild.chestNext", { n: next.min - mine, chest: next.name[v.lang] }) : tr(v, "guild.chestTop")),
    ),
  );
  const ready: HTMLElement[] = [];
  for (const [key, value] of Object.entries(state.contribution)) {
    const s = Number(key);
    if (s >= season || state.chests.includes(s)) continue;
    const beaten = v.defeated(s);
    const won = chestTier(value, beaten === true);
    if (!won) continue;
    // Wait for the boss result: a defeated boss makes the chest one tier better.
    const waiting = beaten === null ? tr(v, "guild.waitBoss", { n: s }) : null;
    ready.push(
      h(
        "li",
        { class: "chest-ready" },
        art(chestArt(won.id), "chest-pic small"),
        h("span", null, `${won.name[v.lang]} · ${tr(v, "guild.season", { n: s })}`, waiting ? h("small", { class: "muted" }, waiting) : null),
        choiceButton(v, tr(v, "guild.open", { n: s }), { t: "chest", season: s, bossDefeated: beaten === true }, { primary: true, small: true, blocked: waiting }),
      ),
    );
  }
  return card(
    "guild-chest",
    tr(v, "guild.chest"),
    progress,
    hint(sentences(v, tr(v, "guild.watch", { n: NIGHT_WATCH }), tr(v, "guild.chestOpensAfter"))),
    ready.length ? h("ul", { class: "chests-ready" }, ...ready) : null,
    hint(tr(v, "guild.noLeaderboard"), "hint small"),
  );
}
