import type { Dashboard, TemporalBasis } from "../api/schema";

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
export function summaryRows(data: Dashboard, basis: TemporalBasis) {
  const reference = data.referenciasTemporales[basis];
  const levels = data.conciliacionNiveles;
  const reconciledGroups = new Map(levels.agrupadores.map((g) => [g.idAgrupador, g]));
  const groups = data.agrupadores.length ? data.agrupadores : [null];
  return [
      [
        "Centro",
        "Inicio",
        "Final",
        "Código contrato",
        "Agrupador",
        "Límite COP",
        "Facturado COP",
        "Ejecución %",
        "Presupuesto contractual reportado COP",
        "Referencia temporal",
        "Días de referencia",
        "Facturación normalizada del contrato COP",
        "Ejecución contractual %",
        "Acostado COP",
        "Disponibilidad combinada COP",
        "Efecto volumen COP",
        "Efecto valor COP",
        "Diferencia presupuesto implícito COP",
        "Mediana facturación COP",
        "P90 facturación COP",
        "Observaciones",
        "Episodios conciliados %",
        "Diferencia absoluta sin explicar COP",
        "Concentración top 10 %",
        "Concentración decil superior %",
        "Periodicidad presupuesto",
        "Comparabilidad de acostado",
        "Iteraciones API",
        "Iteraciones JSON",
        "Diferencia conteo",
        "Recepción de respuesta UTC",
        "Revisión del informe",
        "Alcance del rango",
        "Episodios analizados",
        "Servicios analizados",
        "Cabecera contractual COP",
        "Suma cabeceras agrupadores COP",
        "Diferencia agrupadores menos contrato COP",
        "Estado contrato frente a agrupadores",
        "Suma cabeceras episodios COP",
        "Diferencia episodios menos contrato COP",
        "Estado contrato frente a episodios",
        "Suma episodios del agrupador COP",
        "Diferencia episodios menos agrupador COP",
        "Estado agrupador frente a episodios",
        "Agrupadores conciliados",
        "Agrupadores con diferencia",
        "Agrupadores no evaluables",
        "Suma absoluta diferencias de agrupadores COP",
      ],
      ...groups.map((g) => [
        data.metadata.centroId,
        data.metadata.fechaInicio,
        data.metadata.fechaFinal,
        data.metadata.codigoContrato,
        g?.nombre ?? "Sin agrupadores disponibles",
        g?.limitePresupuestal ?? null,
        g ? reconciledGroups.get(g.idAgrupador)?.cabecera ?? null : null,
        g && (g.limitePresupuestal ?? 0) > 0 && reconciledGroups.get(g.idAgrupador)?.cabecera != null ? g.porcentajeEjecutado : null,
        data.resumenFinanciero.presupuestoContractualReportado,
        basis === "dias30" ? "30 días" : "Mes calendario",
        reference?.diasReferencia ?? null,
        reference?.facturacionNormalizada ?? null,
        data.resumenFinanciero.ejecucionContractualPct,
        data.exposicion.totalAcostado,
        data.exposicion.disponibilidadCalculada,
        g?.efectoVolumen ?? null,
        g?.efectoValor ?? null,
        g?.diferenciaPresupuestoImplicito ?? null,
        g?.medianaFacturacion ?? null,
        g?.p90Facturacion ?? null,
        g?.cantidadObservaciones ?? null,
        data.conciliacion.porcentajeConciliadoPct,
        data.conciliacion.montoAbsolutoSinExplicar,
        data.concentracion.top10Pct,
        data.concentracion.topDecilPct,
        "Sin confirmar",
        "Mismo corte supuesto por consulta compartida",
        g?.iteracionesReportadasAPI ?? null,
        g?.iteracionesRealesJSON ?? null,
        g?.discrepanciaConteoEventos ?? null,
        data.metadata.consultaRecibidaEn,
        data.metadata.revision,
        "Rango solicitado; fechas efectivas del origen pendientes de confirmar",
        data.kpisGlobales.totalEpisodiosAtendidos,
        data.auditoriaCalidadDatos.totalServiciosAnalizados,
        levels.contratoAgrupadores.cabecera,
        levels.contratoAgrupadores.sumaComponentes,
        levels.contratoAgrupadores.diferencia,
        levels.contratoAgrupadores.estado,
        levels.contratoEpisodios.sumaComponentes,
        levels.contratoEpisodios.diferencia,
        levels.contratoEpisodios.estado,
        g ? reconciledGroups.get(g.idAgrupador)?.sumaComponentes ?? null : null,
        g ? reconciledGroups.get(g.idAgrupador)?.diferencia ?? null : null,
        g ? reconciledGroups.get(g.idAgrupador)?.estado ?? "no_evaluable" : "no_evaluable",
        levels.agrupadoresConciliados,
        levels.agrupadoresConDiferencia,
        levels.agrupadoresNoEvaluables,
        levels.montoAbsolutoDiferenciasAgrupadores,
      ]),
    ];
}

export function exportSummary(data: Dashboard, basis: TemporalBasis = "dias30") {
  downloadCsv(
    summaryRows(data, basis),
    `pfgp-resumen-${data.metadata.fechaInicio}-${data.metadata.fechaFinal}.csv`,
  );
}
