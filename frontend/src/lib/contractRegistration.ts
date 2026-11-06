const moneyScale = 4;
const moneyMax = 9223372036854775807n;
const eventMax = 999999999999999999n;

export function normalizePositiveDecimal(raw: string, scale: number, maxUnits: bigint): string | null {
  const value = raw.trim().replace(",", ".");
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${scale}})?$`).test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  // Reject oversized input before parsing a potentially unbounded BigInt.
  if (whole.replace(/^0+/, "").length > 20) return null;
  const units = BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, "0"));
  if (units <= 0n || units > maxUnits) return null;
  return decimalFromUnits(units, scale);
}

export const normalizeMoney = (value: string) => normalizePositiveDecimal(value, moneyScale, moneyMax);
export const normalizeEvents = (value: string) => normalizePositiveDecimal(value, 2, eventMax);

function decimalFromUnits(units: bigint, scale: number): string {
  const sign = units < 0n ? "-" : "";
  const absolute = units < 0n ? -units : units;
  const factor = 10n ** BigInt(scale);
  const fraction = (absolute % factor).toString().padStart(scale, "0").replace(/0+$/, "");
  return `${sign}${absolute / factor}${fraction ? `.${fraction}` : ""}`;
}

function moneyUnits(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, "0"));
}

export function budgetComparison(value: string, limits: string[]) {
  const budget = normalizeMoney(value);
  const normalized = limits.map(normalizeMoney);
  if (!budget || normalized.some((limit) => limit == null)) return null;
  const total = normalized.reduce((sum, limit) => sum + moneyUnits(limit!), 0n);
  return {
    total: decimalFromUnits(total, 4),
    difference: decimalFromUnits(moneyUnits(budget) - total, 4),
  };
}

export function exactDecimal(value: string, currency = true): string {
  const [whole, fraction] = value.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${currency ? "$ " : ""}${grouped}${fraction ? `,${fraction}` : ""}`;
}
