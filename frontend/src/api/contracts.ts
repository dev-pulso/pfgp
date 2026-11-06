import { z } from "zod";
import { normalizeEvents, normalizeMoney } from "../lib/contractRegistration";
import { validRange } from "../lib/format";

const sqlId = z.number().int().positive().max(2147483647);
const serviceTypeId = z.number().int().nonnegative().max(2147483647);
const boundedDate = z.string().refine((value) =>
  validRange(value, value) && value >= "1753-01-01" && value <= "9999-12-31",
  "Selecciona una fecha válida entre 1753 y 9999.",
);
const exactValue = (normalize: (value: string) => string | null, message: string) =>
  z.string().max(100).transform((value, context) => {
    const normalized = normalize(value);
    if (normalized == null) {
      context.addIssue({ code: "custom", message });
      return z.NEVER;
    }
    return normalized;
  });
const moneyValue = exactValue(normalizeMoney, "Ingresa un importe positivo de hasta 922337203685477,5807 y máximo 4 decimales, sin separadores de miles.");
const eventValue = exactValue(normalizeEvents, "Ingresa una cantidad positiva de hasta 9999999999999999,99 y máximo 2 decimales.");
const configurationGroup = z.object({
  agrupadorId: sqlId.refine((id) => id !== 1, "EVENTOS no se configura como agrupador PFGP."),
  limite: moneyValue,
  cantidadEventosContratados: eventValue,
}).strict();
const configurationFields = {
  centroId: z.literal(99),
  contratoId: sqlId,
  valor: moneyValue,
  fechaInicio: boundedDate,
  fechaFin: boundedDate,
  keyAgrupadorServicio: serviceTypeId,
  agrupadores: z.array(configurationGroup).min(1, "Incluye al menos un agrupador.").max(100, "Puedes incluir hasta 100 agrupadores."),
};
function checkConfiguration(value: { fechaInicio: string; fechaFin: string; agrupadores: { agrupadorId: number }[] }, context: z.RefinementCtx) {
  if (value.fechaInicio > value.fechaFin) context.addIssue({ code: "custom", path: ["fechaFin"], message: "La fecha final debe ser igual o posterior al inicio." });
  if (new Set(value.agrupadores.map((group) => group.agrupadorId)).size !== value.agrupadores.length)
    context.addIssue({ code: "custom", path: ["agrupadores"], message: "Un agrupador no puede aparecer más de una vez." });
}
export const contractConfigurationSchema = z.object(configurationFields).strict().superRefine(checkConfiguration);
export type ContractConfiguration = z.infer<typeof contractConfigurationSchema>;

export const contractOptionsSchema = z.object({
  centroId: z.literal(99),
  contratos: z.array(z.object({ id: sqlId, codigo: z.string(), nombre: z.string(), configurado: z.boolean() })),
  tipos: z.array(z.object({ id: serviceTypeId, agrupadorIds: z.array(sqlId) })),
  agrupadores: z.array(z.object({ id: sqlId, nombre: z.string() })),
}).superRefine((value, context) => {
  for (const key of ["contratos", "tipos", "agrupadores"] as const) {
    if (new Set(value[key].map((entry) => entry.id)).size !== value[key].length)
      context.addIssue({ code: "custom", path: [key], message: "Identificadores repetidos en las opciones." });
  }
});
export type ContractOptions = z.infer<typeof contractOptionsSchema>;
export const createdConfigurationSchema = z.object({
  ...configurationFields,
  configuracionId: sqlId,
  codigoContrato: z.string(),
  nombreContrato: z.string(),
}).superRefine(checkConfiguration);
export type CreatedConfiguration = z.infer<typeof createdConfigurationSchema>;

export class ContractRegistrationError extends Error {
  constructor(public kind: "unavailable" | "forbidden" | "validation" | "already_configured" | "unconfirmed" | "connection" | "invalid_options", public code: string, message: string) {
    super(message);
  }
}
const uncertain = () => new ContractRegistrationError("unconfirmed", "CONTRACT_WRITE_UNCONFIRMED", "No se pudo confirmar el resultado de la escritura. Comprueba el estado del contrato antes de considerar otro envío.");

async function requestRegistration(path: string, options: RequestInit, writing = false) {
  const base = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8000").replace(/\/$/, "");
  let response: Response;
  try {
    response = await fetch(`${base}/api/v1/pfgp-contracts${path}`, {
      cache: "no-store", credentials: "omit", ...options,
      headers: { Accept: "application/json", ...(writing ? { "Content-Type": "application/json" } : {}) },
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (writing) throw uncertain();
    throw new ContractRegistrationError("connection", "CONNECTION_ERROR", "No pudimos consultar los contratos. Comprueba la conexión e inténtalo de nuevo.");
  }
  let body: unknown;
  try { body = await response.json(); } catch {
    if (writing) throw uncertain();
    throw new ContractRegistrationError("invalid_options", "INVALID_OPTIONS", "El origen no devolvió opciones válidas para configurar el contrato.");
  }
  if (!response.ok) {
    const parsed = z.object({ detail: z.object({ code: z.string() }) }).safeParse(body);
    const code = parsed.success ? parsed.data.detail.code : "UNKNOWN_ERROR";
    if (code === "CONTRACT_WRITE_UNCONFIRMED") throw uncertain();
    if (code === "CONTRACT_ALREADY_CONFIGURED") throw new ContractRegistrationError("already_configured", code, "El contrato ya tiene una configuración PFGP. Actualiza las opciones para comprobar su estado.");
    if (code === "CONTRACT_WRITE_FORBIDDEN" || code === "SOURCE_WRITE_FORBIDDEN") throw new ContractRegistrationError("forbidden", code, "La conexión no tiene autorización para configurar contratos PFGP.");
    if (code === "CONTRACT_REGISTRATION_UNAVAILABLE" || code === "SOURCE_AUTH_REQUIRED") throw new ContractRegistrationError("unavailable", code, "La configuración de contratos todavía no está disponible. La integración necesita un endpoint autorizado y habilitado en el origen.");
    if (response.status === 422) throw new ContractRegistrationError("validation", code, "El origen rechazó los datos. Revisa el contrato, la vigencia, el tipo y los agrupadores seleccionados; actualiza las opciones si cambiaron.");
    if (writing) throw uncertain();
    throw new ContractRegistrationError("connection", code, "No pudimos cargar las opciones. Vuelve a intentarlo.");
  }
  if (writing && response.status !== 201) throw uncertain();
  return body;
}

export async function fetchContractOptions(signal?: AbortSignal): Promise<ContractOptions> {
  const parsed = contractOptionsSchema.safeParse(await requestRegistration("/opciones?centroId=99", { signal }));
  if (!parsed.success) throw new ContractRegistrationError("invalid_options", "INVALID_OPTIONS", "Las opciones recibidas son incompatibles. Actualiza la consulta antes de continuar.");
  return parsed.data;
}

export async function createContractConfiguration(input: ContractConfiguration): Promise<CreatedConfiguration> {
  const request = contractConfigurationSchema.parse(input);
  const parsed = createdConfigurationSchema.safeParse(await requestRegistration("", { method: "POST", body: JSON.stringify(request) }, true));
  if (!parsed.success) throw uncertain();
  const result = parsed.data;
  const sameGroups = result.agrupadores.length === request.agrupadores.length && result.agrupadores.every((group) => {
    const sent = request.agrupadores.find((entry) => entry.agrupadorId === group.agrupadorId);
    return sent?.limite === group.limite && sent.cantidadEventosContratados === group.cantidadEventosContratados;
  });
  if (result.centroId !== request.centroId || result.contratoId !== request.contratoId || result.valor !== request.valor ||
      result.fechaInicio !== request.fechaInicio || result.fechaFin !== request.fechaFin ||
      result.keyAgrupadorServicio !== request.keyAgrupadorServicio || !sameGroups) throw uncertain();
  return result;
}
