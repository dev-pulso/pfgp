import type { Dashboard, Episode } from "../api/schema";

export function pareto(items: Dashboard["paretoCostos"], universe: Dashboard["paretoUniverso"]) {
  const sorted = [...items].sort((a, b) => b.valorTotal - a.valorTotal);
  const total = universe.valorTotal;
  let cumulative = 0;
  return sorted.slice(0, 10).map((item) => {
    cumulative += item.valorTotal;
    return {
      ...item,
      cumulativePct:
        universe.porcentajesDisponibles && total > 0 && sorted.every((x) => x.valorTotal >= 0)
          ? (cumulative / total) * 100
          : null,
    };
  });
}

export function outlierIds(episodes: Episode[]) {
  const groups = new Map<number, Episode[]>();
  for (const episode of episodes) {
    const cohort = groups.get(episode.idAgrupador) ?? [];
    cohort.push(episode);
    groups.set(episode.idAgrupador, cohort);
  }
  const ids = new Set<number>();
  for (const cohort of groups.values()) {
    const values = cohort
      .flatMap((e) =>
        e.totalFacturadoCabecera == null ? [] : [e.totalFacturadoCabecera],
      )
      .sort((a, b) => a - b);
    if (values.length < 4) continue;
    const q = (p: number) => {
      const pos = (values.length - 1) * p,
        lower = Math.floor(pos);
      return (
        values[lower] + (values[Math.ceil(pos)] - values[lower]) * (pos - lower)
      );
    };
    const threshold = q(0.75) + 1.5 * (q(0.75) - q(0.25));
    cohort
      .filter(
        (e) =>
          e.totalFacturadoCabecera != null &&
          e.totalFacturadoCabecera > threshold,
      )
      .forEach((e) => ids.add(e.consecutivoIngreso));
  }
  return ids;
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
        (e.discrepanciaResidual != null && Math.abs(e.discrepanciaResidual) > 0.01) ||
        (e.ratioSeveridadCME != null && e.ratioSeveridadCME > 1.5)),
  );
}
