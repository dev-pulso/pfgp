import type { Dashboard, Contracts, PatientDrillDown, SimulationRequest } from "../src/api/schema";

// Datos sintéticos exclusivos de pruebas; jamás se importan desde src/.
export function fixture(inicio = "2026-10-01", final = "2026-10-20", idContrato = 100): Dashboard {
  const names = ["Hospitalización", "UCI adultos", "Cirugía", "Urgencias", "Apoyo diagnóstico", "EVENTOS"];
  const groupId = (index: number) => index === 5 ? 1 : index + 2;
  const billed = 107169161 + (idContrato - 100) * 1000000;
  const days = Math.round((Date.parse(final) - Date.parse(inicio)) / 86400000) + 1;
  const sameMonth = inicio.slice(0, 7) === final.slice(0, 7);
  const monthDays = new Date(Date.UTC(Number(final.slice(0, 4)), Number(final.slice(5, 7)), 0)).getUTCDate();
  const values = Array.from({ length: 24 }, (_, i) => i === 0 ? 28750000 : Math.floor((billed - 28750000) * i / 276));
  values[23] += billed - values.reduce((a, b) => a + b, 0);
  const episodes = values.map((value, i) => ({
    consecutivoIngreso: i + 1, paciente: `Episodio ${String(i + 1).padStart(4, "0")}`,
    idAgrupador: groupId(i % 6), agrupador: names[i % 6], fechaIngreso: "" as const,
    diasEstancia: ((i * 3) % 22) + 1, totalFacturadoCabecera: value,
    totalRecuperado: i === 0 ? 250000 : 0,
    sumaServiciosDetalle: value + (i === 0 ? 250000 : i === 1 ? 50000 : 0),
    discrepanciaIntegridad: i === 0 ? 250000 : i === 1 ? 50000 : 0,
    discrepanciaResidual: i === 1 ? 50000 : 0,
    importeEntidadServicios: value + (i === 1 ? 50000 : 0), importePacienteServicios: i === 0 ? 250000 : 0,
    montoDuplicadoDetectado: i === 0 ? 100000 : 0, cmeContratado: 5000000,
    ratioSeveridadCME: value / 5000000, costoDiarioEstancia: 200000,
    gastoInsumos: 110000, indicePresionInsumosPct: 20,
  }));
  const quantile = (values: number[], p: number) => {
    const sorted = [...values].sort((a, b) => a - b), at = (sorted.length - 1) * p;
    return sorted[Math.floor(at)] + (sorted[Math.ceil(at)] - sorted[Math.floor(at)]) * (at % 1);
  };
  const groups = names.map((nombre, i) => {
    const cohort = episodes.filter((episode) => episode.idAgrupador === groupId(i));
    const total = cohort.reduce((sum, episode) => sum + episode.totalFacturadoCabecera, 0);
    const limit = i === 5 ? 0 : 30000000;
    return {
      idAgrupador: groupId(i), nombre, limitePresupuestal: limit, totalFacturado: total,
      porcentajeEjecutado: limit ? total / limit * 100 : 0,
      burnRateRatio: limit ? total / limit / (days / 30) : null,
      proyeccionCierre30Dias: total / days * 30, eventosContratados: i === 5 ? 0 : 6,
      iteracionesReportadasAPI: i === 2 ? 6 : 4, iteracionesRealesJSON: 4,
      discrepanciaConteoEventos: i === 2 ? 2 : 0, cumplimientoFrecuenciaPct: i === 5 ? null : 4 / 6 * 100,
      cmeContratado: i === 5 ? null : 5000000, cmeRealPromedio: total / 4,
      estadoAlerta: limit && total > limit ? "DESBORDADO_CRITICO" : "CONTROLADO",
      efectoVolumen: i === 5 ? null : -10000000, efectoValor: i === 5 ? null : total - 20000000,
      diferenciaPresupuestoImplicito: i === 5 ? null : 0,
      medianaFacturacion: quantile(cohort.map((episode) => episode.totalFacturadoCabecera), .5),
      p90Facturacion: quantile(cohort.map((episode) => episode.totalFacturadoCabecera), .9), cantidadObservaciones: cohort.length,
    };
  });
  const ordered = [...values].sort((a, b) => b - a);
  const paretoItems = Array.from({ length: 20 }, (_, i) => ({
    nombre: `Servicio sintético ${i + 1}`, tipo: i % 2 ? "PROCEDIMIENTO/CUPS" : "INSUMO/MEDICAMENTO",
    cantidad: 10 + i, valorTotal: 12000000 / (i + 1),
  }));
  const gross = billed + 300000;
  return {
    metadata: {
      centroId: 99, consultaRecibidaEn: "2026-11-05T20:30:00Z",
      idContrato, codigoContrato: `TEST-PFGP-${idContrato}`,
      nombreContrato: idContrato === 100 ? "Contrato sintético de validación" : `Contrato adicional ${idContrato}`,
      fechaInicio: inicio, fechaFinal: final, diasCorteAnalizados: days, avanceTemporalMesPct: days / 30 * 100,
      revision: idContrato.toString(16).padStart(64, "0"),
    },
    kpisGlobales: {
      presupuestoTotalLimite: 150000000, totalFacturadoContrato: billed, totalRecuperadoCopagos: 250000,
      tasaRecuperacionPct: 250000 / billed * 100, ejecucionGlobalPct: billed / 150000000 * 100,
      burnRateGlobal: billed / 150000000 / (days / 30), proyeccionFacturacion30Dias: billed / days * 30,
      indicePresionInsumosGlobalPct: 28.4, totalEpisodiosAtendidos: 24,
    },
    resumenFinanciero: {
      presupuestoContractualReportado: 200000000, sumaLimitesAgrupadores: 150000000, diferenciaPresupuestos: 50000000,
      coberturaLimitesPct: 75, ejecucionContractualPct: billed / 200000000 * 100, participacionEventosPct: groups[5].totalFacturado / billed * 100,
    },
    exposicion: {
      estado: "disponible", registrosAcostado: 3, totalAcostado: 12000000,
      totalCombinado: billed + 12000000, ejecucionCombinadaPct: (billed + 12000000) / 200000000 * 100,
      disponibilidadCalculada: 200000000 - billed - 12000000, disponibilidadReportada: 200000000 - billed - 12000000,
      diferenciaDisponibilidad: 0, ingresosCompartidos: 0, supuestoMismoCorte: true,
    },
    conciliacion: {
      episodiosEvaluables: 24, episodiosConciliados: 23, episodiosConDiferencia: 1, episodiosNoEvaluables: 0,
      porcentajeConciliadoPct: 23 / 24 * 100, montoAbsolutoSinExplicar: 50000,
    },
    conciliacionNiveles: {
      contratoAgrupadores: { cabecera: billed, sumaComponentes: billed, diferencia: 0, estado: "conciliado" },
      contratoEpisodios: { cabecera: billed, sumaComponentes: billed, diferencia: 0, estado: "conciliado" },
      agrupadores: groups.map((group) => ({
        idAgrupador: group.idAgrupador, nombre: group.nombre, cantidadEpisodios: group.iteracionesRealesJSON,
        cabecera: group.totalFacturado, sumaComponentes: group.totalFacturado, diferencia: 0, estado: "conciliado" as const,
      })),
      agrupadoresConciliados: groups.length, agrupadoresConDiferencia: 0, agrupadoresNoEvaluables: 0,
      montoAbsolutoDiferenciasAgrupadores: 0,
    },
    referenciasTemporales: {
      dias30: { diasReferencia: 30, facturacionNormalizada: billed / days * 30, avanceReferenciaPct: days / 30 * 100 },
      calendario: sameMonth ? { diasReferencia: monthDays, facturacionNormalizada: billed / days * monthDays, avanceReferenciaPct: days / monthDays * 100 } : null,
      motivoCalendario: sameMonth ? null : "El rango abarca más de un mes calendario.",
    },
    concentracion: {
      totalFacturadoEpisodios: billed, cantidadEpisodios: 24, cantidadTop10: 10,
      top10Pct: ordered.slice(0, 10).reduce((a, b) => a + b, 0) / billed * 100,
      cantidadTopDecil: 3, topDecilPct: ordered.slice(0, 3).reduce((a, b) => a + b, 0) / billed * 100,
    },
    paretoUniverso: {
      totalServicios: 1284, valorTotal: gross, porcentajesDisponibles: true,
      restoTop10: gross - paretoItems.slice(0, 10).reduce((sum, item) => sum + item.valorTotal, 0),
    },
    auditoriaCalidadDatos: {
      totalServiciosAnalizados: 1284, agrupadoresConCaracteresSucios: 2, serviciosConIdDuplicado: 14,
      montoInfladoPorDuplicidad: 2847500, serviciosFacturadosEnCero: 8, lucroCesantePorServiciosEnCero: 1235000,
      gastoHuerfanoAgrupadorEventos: groups[5].totalFacturado,
    },
    agrupadores: groups, episodios: episodes, paretoCostos: paretoItems,
  };
}

export function catalogFixture(inicio = "2026-10-01", final = "2026-10-20", size = 2): Contracts {
  return {
    inicio, final, centroId: 99, totalContratos: size,
    consultaRecibidaEn: "2026-11-05T20:30:00Z",
    contratos: Array.from({ length: size }, (_, index) => {
      const report = fixture(inicio, final, 100 + index);
      return {
        idContrato: report.metadata.idContrato, codigoContrato: report.metadata.codigoContrato,
        nombreContrato: report.metadata.nombreContrato, totalFacturadoContrato: report.kpisGlobales.totalFacturadoContrato,
        presupuestoTotalLimite: report.kpisGlobales.presupuestoTotalLimite, totalRecuperado: report.kpisGlobales.totalRecuperadoCopagos,
        cantidadAgrupadores: report.agrupadores.length, resumenFinanciero: report.resumenFinanciero, exposicion: report.exposicion,
      };
    }),
  };
}

export function drillDownFixture(inicio = "2026-10-01", final = "2026-10-20", idContrato = 100, ordinal = 1): PatientDrillDown {
  const report = fixture(inicio, final, idContrato);
  return {
    inicio, final, centroId: 99, idContrato, revision: report.metadata.revision,
    episodio: report.episodios[ordinal - 1],
    auditoriaEpisodio: { serviciosDuplicados: 1, montoDuplicado: 100000, serviciosEnCero: 1 },
    servicios: Array.from({ length: 26 }, (_, index) => ({
      id: String(index === 2 ? 1 : index), codigo: index % 2 === 0 ? "MEDICAMENTOS" : `CUPS-${100 + index}`,
      nombre: `Servicio sintético ${index + 1}`, tipo: index % 2 === 0 ? "INSUMO/MEDICAMENTO" : "PROCEDIMIENTO/CUPS",
      cantidad: 1, valorProducto: index === 0 ? 26600000 : 100000,
      valorTotal: index === 0 ? 26600000 : index === 25 ? 0 : 100000,
      importeEntidad: index === 0 ? 26350000 : index === 25 ? 0 : 100000,
      importePaciente: index === 0 ? 250000 : 0, es_duplicado: index === 2, es_cero: index === 25,
    })),
  };
}

export function simulationFixture(request: SimulationRequest = {
  inicio: "2026-10-01", final: "2026-10-20", centroId: 99, idContrato: 100,
  revision: fixture().metadata.revision,
  excluirTerapiaVAC: false, excluirLaparoscopiaAvanzada: false, excluirMallasSling: false,
}) {
  const transferred = (request.excluirTerapiaVAC ? 100000 : 0) + (request.excluirLaparoscopiaAvanzada ? 200000 : 0) + (request.excluirMallasSling ? 50000 : 0);
  const patient = transferred / 10;
  return {
    inicio: request.inicio, final: request.final, centroId: request.centroId, idContrato: request.idContrato, revision: request.revision,
    totalFacturadoOriginal: 1200000, totalFacturadoSimuladoPGP: 1200000 - transferred, totalTrasladadoAEvento: transferred,
    totalTrasladadoPaciente: patient, totalTrasladadoBruto: transferred + patient, alivioFinancieroPct: transferred / 12000,
    agrupadoresRecalculados: [{
      idAgrupador: 2, nombre: "Cirugía", limite: 1000000, facturadoOriginal: 1200000, montoExcluidoEvento: transferred,
      montoExcluidoPaciente: patient, montoExcluidoBruto: transferred + patient, facturadoSimuladoPGP: 1200000 - transferred,
      ejecucionOriginalPct: 120, ejecucionSimuladaPct: (1200000 - transferred) / 10000,
      estadoOriginal: "DESBORDADO", estadoSimulado: transferred >= 200000 ? "EN_RANGO" : "DESBORDADO",
    }],
    topInsumosTrasladados: [],
  };
}
