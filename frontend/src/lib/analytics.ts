import type { Dashboard, Episode } from "../api/schema";

export function pareto(items: Dashboard["paretoCostos"]) {
  const sorted = [...items].sort((a, b) => b.valorTotal - a.valorTotal);
  const total = sorted.reduce((sum, item) => sum + item.valorTotal, 0);
  let cumulative = 0;
  return sorted.slice(0, 10).map((item) => {
    cumulative += item.valorTotal;
    return {
      ...item,
      cumulativePct:
        total > 0 && sorted.every((x) => x.valorTotal >= 0)
          ? (cumulative / total) * 100
          : null,
    };
  });
}

export function outlierIds(episodes: Episode[]) {
  const values = episodes
    .flatMap((e) =>
      e.totalFacturadoCabecera == null ? [] : [e.totalFacturadoCabecera],
    )
    .sort((a, b) => a - b);
  if (values.length < 4) return new Set<number>();
  const q = (p: number) => {
    const pos = (values.length - 1) * p,
      lower = Math.floor(pos);
    return (
      values[lower] + (values[Math.ceil(pos)] - values[lower]) * (pos - lower)
    );
  };
  const threshold = q(0.75) + 1.5 * (q(0.75) - q(0.25));
  return new Set(
    episodes
      .filter(
        (e) =>
          e.totalFacturadoCabecera != null &&
          e.totalFacturadoCabecera > threshold,
      )
      .map((e) => e.consecutivoIngreso),
  );
}

export function filterEpisodes(
  episodes: Episode[],
  search: string,
  onlyAlerts: boolean,
) {
  const normalize = (text: string) =>
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const query = normalize(search.trim());
  return episodes.filter(
    (e) =>
      normalize(`${e.paciente} ${e.agrupador}`).includes(query) &&
      (!onlyAlerts ||
        (e.discrepanciaIntegridad != null && e.discrepanciaIntegridad !== 0) ||
        (e.ratioSeveridadCME != null && e.ratioSeveridadCME > 1.5)),
  );
}
