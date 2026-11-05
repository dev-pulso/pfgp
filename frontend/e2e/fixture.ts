import type { Dashboard, Contracts, PatientDrillDown } from "../src/api/schema";

// Datos sintéticos exclusivos de pruebas; jamás se importan desde src/.
export function fixture(
  inicio = "2026-10-01",
  final = "2026-10-20",
  idContrato = 100,
): Dashboard {
  const names = [
    "Hospitalización",
    "UCI adultos",
    "Cirugía",
    "Urgencias",
    "Apoyo diagnóstico",
    "EVENTOS",
  ];
  return {
    metadata: {
      idContrato,
      codigoContrato: `TEST-PFGP-${idContrato}`,
      nombreContrato:
        idContrato === 100
          ? "Contrato sintético de validación"
          : `Contrato adicional ${idContrato}`,
      fechaInicio: inicio,
      fechaFinal: final,
      diasCorteAnalizados: 20,
      avanceTemporalMesPct: 66.67,
      revision: idContrato.toString(16).padStart(64, "0"),
    },
    kpisGlobales: {
      presupuestoTotalLimite: 150000000,
      totalFacturadoContrato: 107169161 + (idContrato - 100) * 1000000,
      totalRecuperadoCopagos: 2150000,
      tasaRecuperacionPct: 2.01,
      ejecucionGlobalPct: 71.45,
      burnRateGlobal: 1.07,
      proyeccionFacturacion30Dias: 160753741.5,
      indicePresionInsumosGlobalPct: 28.4,
      totalEpisodiosAtendidos: 24,
    },
    auditoriaCalidadDatos: {
      totalServiciosAnalizados: 1284,
      agrupadoresConCaracteresSucios: 2,
      serviciosConIdDuplicado: 14,
      montoInfladoPorDuplicidad: 2847500,
      serviciosFacturadosEnCero: 8,
      lucroCesantePorServiciosEnCero: 1235000,
      gastoHuerfanoAgrupadorEventos: 4280000,
    },
    agrupadores: names.map((nombre, i) => ({
      idAgrupador: i + 1,
      nombre,
      limitePresupuestal: i === 5 ? 0 : 30000000,
      totalFacturado: ((90 - i * 11) / 100) * 30000000,
      porcentajeEjecutado: 90 - i * 11,
      burnRateRatio: i === 5 ? null : (90 - i * 11) / 66.67,
      proyeccionCierre30Dias: 32000000,
      eventosContratados: 25,
      iteracionesReportadasAPI: i === 2 ? 6 : 4,
      iteracionesRealesJSON: 4,
      discrepanciaConteoEventos: i === 2 ? 2 : 0,
      cumplimientoFrecuenciaPct: 16,
      cmeContratado: i === 5 ? null : 5000000,
      cmeRealPromedio: 6750000 - i * 800000,
      estadoAlerta: i < 3 ? "RIESGO_SOBRECOSTO" : "CONTROLADO",
    })),
    episodios: Array.from({ length: 24 }, (_, i) => ({
      consecutivoIngreso: i + 1,
      paciente: `Episodio ${String(i + 1).padStart(4, "0")}`,
      agrupador: names[i % 6],
      fechaIngreso: "",
      diasEstancia: ((i * 3) % 22) + 1,
      totalFacturadoCabecera: i === 0 ? 28750000 : 560000 + i * 326000,
      sumaServiciosDetalle: i === 0 ? 29000000 : 560000 + i * 326000,
      discrepanciaIntegridad: i === 0 ? 250000 : 0,
      montoDuplicadoDetectado: i === 0 ? 100000 : 0,
      cmeContratado: 5000000,
      ratioSeveridadCME: i === 0 ? 5.75 : (560000 + i * 326000) / 5000000,
      costoDiarioEstancia: 200000,
      gastoInsumos: 110000,
      indicePresionInsumosPct: 20,
    })),
    paretoCostos: Array.from({ length: 20 }, (_, i) => ({
      nombre: `Servicio sintético ${i + 1}`,
      tipo: i % 2 ? "PROCEDIMIENTO/CUPS" : "INSUMO/MEDICAMENTO",
      cantidad: 10 + i,
      valorTotal: 12000000 / (i + 1),
    })),
  };
}

export function catalogFixture(
  inicio = "2026-10-01",
  final = "2026-10-20",
  size = 2,
): Contracts {
  return {
    inicio,
    final,
    centroId: 99,
    totalContratos: size,
    contratos: Array.from({ length: size }, (_, index) => {
      const report = fixture(inicio, final, 100 + index);
      return {
        idContrato: report.metadata.idContrato,
        codigoContrato: report.metadata.codigoContrato,
        nombreContrato: report.metadata.nombreContrato,
        totalFacturadoContrato: report.kpisGlobales.totalFacturadoContrato,
        presupuestoTotalLimite: report.kpisGlobales.presupuestoTotalLimite,
        totalRecuperado: report.kpisGlobales.totalRecuperadoCopagos,
        cantidadAgrupadores: report.agrupadores.length,
      };
    }),
  };
}

export function drillDownFixture(
  inicio = "2026-10-01",
  final = "2026-10-20",
  idContrato = 100,
  ordinal = 1,
): PatientDrillDown {
  const report = fixture(inicio, final, idContrato);
  return {
    inicio,
    final,
    centroId: 99,
    idContrato,
    revision: report.metadata.revision,
    episodio: report.episodios[ordinal - 1],
    auditoriaEpisodio: { serviciosDuplicados: 1, montoDuplicado: 100000, serviciosEnCero: 1 },
    servicios: Array.from({ length: 26 }, (_, index) => ({
      id: String(index === 2 ? 1 : index),
      codigo: index % 2 === 0 ? "MEDICAMENTOS" : `CUPS-${100 + index}`,
      nombre: `Servicio sintético ${index + 1}`,
      tipo: index % 2 === 0 ? "INSUMO/MEDICAMENTO" : "PROCEDIMIENTO/CUPS",
      cantidad: 1,
      valorProducto: index === 0 ? 26600000 : 100000,
      valorTotal: index === 0 ? 26600000 : index === 25 ? 0 : 100000,
      es_duplicado: index === 2,
      es_cero: index === 25,
    })),
  };
}
