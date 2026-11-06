const decimal = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });
const money = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const preciseMoney = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });
export const amount = (n: number | null | undefined) =>
  n == null ? "No disponible" : `$ ${money.format(n)}`;
export const residualAmount = (n: number | null | undefined) =>
  n == null ? "No disponible" : `$ ${preciseMoney.format(n)}`;
export const percent = (n: number | null | undefined) =>
  n == null ? "No disponible" : `${decimal.format(n)} %`;
export const count = (n: number | null | undefined) =>
  n == null ? "—" : decimal.format(n);
export const ratio = (n: number | null | undefined) =>
  n == null
    ? "—"
    : `${n.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`;
export const shortMoney = (n: number) =>
  Math.abs(n) >= 1e6
    ? `$ ${decimal.format(n / 1e6)} M`
    : Math.abs(n) >= 1e3
      ? `$ ${decimal.format(n / 1e3)} mil`
      : `$ ${decimal.format(n)}`;
export const shortDate = (date: string) =>
  new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
export const receivedAtBogota = (timestamp: string | null | undefined) => {
  if (!timestamp) return "No disponible";
  const received = new Date(timestamp);
  if (Number.isNaN(received.getTime())) return "No disponible";
  return `${new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "America/Bogota",
  }).format(received)} (Bogotá, UTC−5)`;
};
export function currentRange(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) => parts.find((p) => p.type === type)!.value;
  const final = `${value("year")}-${value("month")}-${value("day")}`;
  return { inicio: `${final.slice(0, 7)}-01`, final };
}
export function validRange(inicio: string, final: string) {
  const valid = (d: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(d) &&
    !Number.isNaN(Date.parse(d)) &&
    new Date(d).toISOString().slice(0, 10) === d;
  return valid(inicio) && valid(final) && inicio <= final;
}
