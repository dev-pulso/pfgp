import { z } from "zod";

const number = z.number().finite();
const metric = number.nullable();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const text = z.string().max(1000);

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
});
const episode = z.object({
  consecutivoIngreso: z.number().int().positive(),
  paciente: z.string().regex(/^Episodio \d{4,}$/),
  agrupador: text,
  fechaIngreso: z.literal(""),
  diasEstancia: metric,
  totalFacturadoCabecera: metric,
  sumaServiciosDetalle: metric,
  discrepanciaIntegridad: metric,
  montoDuplicadoDetectado: metric,
  cmeContratado: metric,
  ratioSeveridadCME: metric,
  costoDiarioEstancia: metric,
  gastoInsumos: metric,
  indicePresionInsumosPct: metric,
});
export const dashboardSchema = z.object({
  metadata: z.object({
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
  centroId: number;
  idContrato: number;
  excluirTerapiaVAC: boolean;
  excluirLaparoscopiaAvanzada: boolean;
  excluirMallasSling: boolean;
};

export const simulationSchema = z.object({
  totalFacturadoOriginal: number,
  totalFacturadoSimuladoPGP: number,
  totalTrasladadoAEvento: number,
  alivioFinancieroPct: number,
  agrupadoresRecalculados: z.array(
    z.object({
      idAgrupador: z.number().int(),
      nombre: text,
      limite: number,
      facturadoOriginal: number,
      montoExcluidoEvento: number,
      facturadoSimuladoPGP: number,
      ejecucionOriginalPct: number,
      ejecucionSimuladaPct: number,
    }),
  ),
});
