// SQK and SQB amounts: 18 decimals, kept as bigint wei and shown with commas.

export const DECIMALS = 18;
const ONE = 10n ** BigInt(DECIMALS);

/** Parses what a player typed ("1,250.5") into wei, or null if it isn't an amount. */
export function parseAmount(text: string): bigint | null {
  const clean = text.replace(/[,\s，_]/g, "").replace(/。/g, ".");
  const match = /^(\d{0,30})(?:\.(\d{0,18}))?$/.exec(clean);
  if (!match || (match[1] === "" && !match[2])) return null;
  const whole = BigInt(match[1] || "0");
  const fraction = BigInt((match[2] ?? "").padEnd(DECIMALS, "0") || "0");
  return whole * ONE + fraction;
}

const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** "1,234.56": at most `places` decimals, cut (never rounded up), trailing zeros dropped. */
export function formatAmount(wei: bigint, places = 2): string {
  const negative = wei < 0n;
  const abs = negative ? -wei : wei;
  const whole = abs / ONE;
  const fraction = (abs % ONE).toString().padStart(DECIMALS, "0").slice(0, places).replace(/0+$/, "");
  if (!fraction && whole === 0n && abs > 0n && places > 0) return `${negative ? "-" : ""}<0.${"0".repeat(places - 1)}1`;
  const text = group(whole.toString()) + (fraction ? `.${fraction}` : "");
  return negative ? `-${text}` : text;
}

/** An amount for an input field: no commas, every decimal kept. */
export function inputAmount(wei: bigint): string {
  const whole = wei / ONE;
  const fraction = (wei % ONE).toString().padStart(DECIMALS, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/** Whole tokens, floored, as a number (for damage and other game numbers). */
export const wholeTokens = (wei: bigint) => Number(wei / ONE);
