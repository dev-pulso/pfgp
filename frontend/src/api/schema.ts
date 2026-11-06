import { z } from "zod";

const number = z.number().finite();
const metric = number.nullable();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const text = z.string().max(1000);
const receivedAt = z.string().datetime({ offset: true });
const balance = z.object({
  cabecera: metric,
  sumaComponentes: metric,
  diferencia: metric,
  estado: z.enum(["conciliado", "con_diferencia", "no_evaluable"]),
});

export type TemporalBasis = "dias30" | "calendario";
const financialSummary = z.object({
  presupuestoContractualReportado: metric,
  sumaLimitesAgrupadores: metric,
  diferenciaPresupuestos: metric,
  coberturaLimitesPct: metric,
  ejecucionContractualPct: metric,
  participacionEventosPct: metric,
});
const exposure = z.object({
  estado: z.enum(["disponible", "no_disponible", "solapamiento"]),
  registrosAcostado: metric,
  totalAcostado: metric,
  totalCombinado: metric,
  ejecucionCombinadaPct: metric,
  disponibilidadCalculada: metric,
  disponibilidadReportada: metric,
  diferenciaDisponibilidad: metric,
  ingresosCompartidos: number,
  supuestoMismoCorte: z.literal(true),
});
const timeReference = z.object({
  diasReferencia: number,
  facturacionNormalizada: metric,
  avanceReferenciaPct: metric,
});

const group = z.object({
  idAgrupador: z.number().int(),
  nombre: text,
  limitePresupuestal: metric,
  totalFacturado: metric,
  porcentajeEjecutado: metric,
  burnRateRatio: metric,
  proyeccionCierre30Dias: metric,
  eventosContratados: metric,
  iteracionesReportadasAPI: number,
  iteracionesRealesJSON: number,
  discrepanciaConteoEventos: number,
  cumplimientoFrecuenciaPct: metric,
  cmeContratado: metric,
  cmeRealPromedio: metric,
  estadoAlerta: text,
  efectoVolumen: metric,
  efectoValor: metric,
  diferenciaPresupuestoImplicito: metric,
  medianaFacturacion: metric,
  p90Facturacion: metric,
  cantidadObservaciones: number,
});
const episode = z.object({
  consecutivoIngreso: z.number().int().positive(),
  paciente: z.string().regex(/^Episodio \d{4,}$/),
  agrupador: text,
  idAgrupador: z.number().int(),
  fechaIngreso: z.literal(""),
  diasEstancia: metric,
  totalFacturadoCabecera: metric,
  sumaServiciosDetalle: metric,
  discrepanciaIntegridad: metric,
  totalRecuperado: metric,
  discrepanciaResidual: metric,
  importeEntidadServicios: metric,
  importePacienteServicios: metric,
  montoDuplicadoDetectado: metric,
  cmeContratado: metric,
  ratioSeveridadCME: metric,
  costoDiarioEstancia: metric,
  gastoInsumos: metric,
  indicePresionInsumosPct: metric,
});
export const dashboardSchema = z.object({
  resumenFinanciero: financialSummary,
  exposicion: exposure,
  conciliacionNiveles: z.object({
    contratoAgrupadores: balance,
    contratoEpisodios: balance,
    agrupadores: z.array(balance.extend({
      idAgrupador: z.number().int(),
      nombre: text,
      cantidadEpisodios: z.number().int().nonnegative(),
    })),
    agrupadoresConciliados: z.number().int().nonnegative(),
    agrupadoresConDiferencia: z.number().int().nonnegative(),
    agrupadoresNoEvaluables: z.number().int().nonnegative(),
    montoAbsolutoDiferenciasAgrupadores: metric,
  }),
  conciliacion: z.object({
    episodiosEvaluables: number,
    episodiosConciliados: number,
    episodiosConDiferencia: number,
    episodiosNoEvaluables: number,
    porcentajeConciliadoPct: metric,
    montoAbsolutoSinExplicar: metric,
  }),
  referenciasTemporales: z.object({
    dias30: timeReference,
    calendario: timeReference.nullable(),
    motivoCalendario: text.nullable(),
  }),
  concentracion: z.object({
    totalFacturadoEpisodios: metric,
    cantidadEpisodios: number,
    cantidadTop10: number,
    top10Pct: metric,
    cantidadTopDecil: number,
    topDecilPct: metric,
  }),
  paretoUniverso: z.object({
    totalServicios: number,
    valorTotal: number,
    porcentajesDisponibles: z.boolean(),
    restoTop10: number,
  }),
  metadata: z.object({
    centroId: z.literal(99),
    consultaRecibidaEn: receivedAt,
    idContrato: z.number().int(),
    codigoContrato: text,
    nombreContrato: text,
    fechaInicio: date,
    fechaFinal: date,
    diasCorteAnalizados: number,
    avanceTemporalMesPct: metric,
    revision: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  kpisGlobales: z.object({
    presupuestoTotalLimite: metric,
    totalFacturadoContrato: metric,
    totalRecuperadoCopagos: metric,
    tasaRecuperacionPct: metric,
    ejecucionGlobalPct: metric,
    burnRateGlobal: metric,
    proyeccionFacturacion30Dias: metric,
    indicePresionInsumosGlobalPct: metric,
    totalEpisodiosAtendidos: number,
  }),
  auditoriaCalidadDatos: z.object({
    totalServiciosAnalizados: number,
    agrupadoresConCaracteresSucios: number,
    serviciosConIdDuplicado: number,
    montoInfladoPorDuplicidad: metric,
    serviciosFacturadosEnCero: number,
    lucroCesantePorServiciosEnCero: metric,
    gastoHuerfanoAgrupadorEventos: metric,
  }),
  agrupadores: z.array(group),
  episodios: z.array(episode),
  paretoCostos: z.array(
    z.object({
      nombre: text,
      tipo: text,
      cantidad: number,
      valorTotal: number,
    }),
  ),
});
export type Dashboard = z.infer<typeof dashboardSchema>;
export type Episode = Dashboard["episodios"][number];
export type Group = Dashboard["agrupadores"][number];
export type DateRange = { inicio: string; final: string };

export const patientDrillDownSchema = z.object({
  inicio: date,
  final: date,
  centroId: z.literal(99),
  idContrato: z.number().int().positive(),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  episodio: episode,
  auditoriaEpisodio: z.object({
    serviciosDuplicados: z.number().int().nonnegative(),
    montoDuplicado: number,
    serviciosEnCero: z.number().int().nonnegative(),
  }),
  servicios: z.array(z.object({
    id: text,
    codigo: text,
    nombre: text,
    tipo: z.enum(["PROCEDIMIENTO/CUPS", "INSUMO/MEDICAMENTO"]),
    cantidad: number,
    valorProducto: number,
    valorTotal: number,
    importeEntidad: metric,
    importePaciente: metric,
    es_duplicado: z.boolean(),
    es_cero: z.boolean(),
  })),
});
export type PatientDrillDown = z.infer<typeof patientDrillDownSchema>;
export type DrillDownRequest = DateRange & {
  centroId: number;
  idContrato: number;
  consecutivoIngreso: number;
  revision: string;
};

export const contractsSchema = z
  .object({
    consultaRecibidaEn: receivedAt,
    inicio: date,
    final: date,
    centroId: z.literal(99),
    totalContratos: z.number().int().nonnegative(),
    contratos: z.array(
      z.object({
        idContrato: z.number().int().positive(),
        codigoContrato: text,
        nombreContrato: text,
        totalFacturadoContrato: metric,
        presupuestoTotalLimite: metric,
        totalRecuperado: metric,
        cantidadAgrupadores: z.number().int().nonnegative(),
        resumenFinanciero: financialSummary,
        exposicion: exposure,
      }),
    ),
  })
  .refine(
    (value) =>
      value.totalContratos === value.contratos.length &&
      new Set(value.contratos.map((c) => c.idContrato)).size ===
        value.contratos.length,
  );
export type Contracts = z.infer<typeof contractsSchema>;

export type SimulationRequest = DateRange & {
  revision: string;
  centroId: number;
  idContrato: number;
  excluirTerapiaVAC: boolean;
  excluirLaparoscopiaAvanzada: boolean;
  excluirMallasSling: boolean;
};

export const simulationSchema = z.object({
  inicio: date,
  final: date,
  centroId: z.literal(99),
  idContrato: z.number().int().positive(),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  totalFacturadoOriginal: number,
  totalFacturadoSimuladoPGP: number,
  totalTrasladadoAEvento: number,
  totalTrasladadoPaciente: number,
  totalTrasladadoBruto: number,
  alivioFinancieroPct: number,
  agrupadoresRecalculados: z.array(
    z.object({
      idAgrupador: z.number().int(),
      nombre: text,
      limite: metric,
      facturadoOriginal: number,
      montoExcluidoEvento: number,
      montoExcluidoPaciente: number,
      montoExcluidoBruto: number,
      facturadoSimuladoPGP: number,
      ejecucionOriginalPct: metric,
      ejecucionSimuladaPct: metric,
    }),
  ),
});
