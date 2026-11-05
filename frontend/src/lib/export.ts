import type { Dashboard } from "../api/schema";

export function csv(rows: (string | number | null)[][]) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => {
            let text = value == null ? "" : String(value);
            if (
              typeof value === "string" &&
              /^[\s\u0000-\u001f]*[=+@-]/.test(text)
            )
              text = `'${text}`;
            return `"${text.replace(/"/g, '""')}"`;
          })
          .join(";"),
      )
      .join("\r\n")
  );
}
export function downloadCsv(
  rows: (string | number | null)[][],
  filename: string,
) {
  const url = URL.createObjectURL(
    new Blob([csv(rows)], { type: "text/csv;charset=utf-8;" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportSummary(data: Dashboard) {
  downloadCsv(
    [
      [
        "Centro",
        "Inicio",
        "Final",
        "Código contrato",
        "Agrupador",
        "Límite COP",
        "Facturado COP",
        "Ejecución %",
        "Burn rate",
        "Iteraciones API",
        "Iteraciones JSON",
        "Diferencia conteo",
      ],
      ...data.agrupadores.map((g) => [
        99,
        data.metadata.fechaInicio,
        data.metadata.fechaFinal,
        data.metadata.codigoContrato,
        g.nombre,
        g.limitePresupuestal,
        g.totalFacturado,
        g.porcentajeEjecutado,
        g.burnRateRatio,
        g.iteracionesReportadasAPI,
        g.iteracionesRealesJSON,
        g.discrepanciaConteoEventos,
      ]),
    ],
    `pfgp-resumen-${data.metadata.fechaInicio}-${data.metadata.fechaFinal}.csv`,
  );
}
