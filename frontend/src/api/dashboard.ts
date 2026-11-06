import {
  dashboardSchema,
  contractsSchema,
  simulationSchema,
  patientDrillDownSchema,
  type DateRange,
  type SimulationRequest,
  type DrillDownRequest,
} from "./schema";

export class DashboardError extends Error {
  constructor(
    public kind:
      "empty" | "connection" | "privacy" | "invalid" | "multiple" | "auth" | "stale" | "scenario",
    message: string,
  ) {
    super(message);
  }
}

async function requestJson(path: string, options: RequestInit) {
  const base = (
    import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"
  ).replace(/\/$/, "");
  const signal = options.signal;
  let response: Response;
  try {
    response = await fetch(
      `${base}/api/v1/pfgp-analytics/${path}`,
      {
        cache: "no-store",
        credentials: "omit",
        headers: { Accept: "application/json" },
        ...options,
      },
    );
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new DashboardError(
      "connection",
      "No pudimos conectar con el backend. Comprueba que esté iniciado en el puerto 8000.",
    );
  }
  if (response.status === 404)
    throw new DashboardError(
      "empty",
      path.startsWith("episodio/")
        ? "El episodio ya no está disponible en este corte. Cierra el detalle y actualiza el informe."
        : "El contrato o período ya no está disponible. Vuelve al listado y actualiza la consulta.",
    );
  let errorCode: unknown;
  if (response.status === 409 || response.status === 422) {
    try {
      const payload = await response.clone().json();
      errorCode = payload?.detail?.code;
    } catch { /* Never display provider error bodies. */ }
  }
  if (response.status === 422 && errorCode === "SCENARIO_NOT_CALCULABLE")
    throw new DashboardError(
      "scenario",
      "El escenario no es calculable: faltan importes válidos o el traslado supera la facturación del agrupador. Revisa la conciliación del corte.",
    );
  if (response.status === 409) {
    const stale = errorCode === "STALE_REPORT" ||
      (errorCode !== "DUPLICATE_CONTRACTS" && path.startsWith("episodio/"));
    throw new DashboardError(
      stale ? "stale" : "multiple",
      stale
        ? "El corte cambió. Pulsa Actualizar corte antes de abrir el detalle o simular."
        : "El origen devolvió identificadores de contrato repetidos. Revisa la integridad del catálogo.",
    );
  }
  if (response.status === 503)
    throw new DashboardError(
      "auth",
      "Eklipse requiere un token válido. Configura o renueva EKLIPSE_TOKEN en el .env del backend y reinícialo. No lo introduzcas en el frontend.",
    );
  if (!response.ok)
    throw new DashboardError(
      "connection",
      response.status === 422
        ? "El rango de fechas no es válido. Revisa el inicio y el final."
        : "No se pudo consultar Eklipse. Revisa la conexión y la configuración del backend, y vuelve a intentar.",
    );
  // No interpretar cuerpos provenientes del backend anterior con identidades reales.
  if (response.headers.get("X-PFGP-Privacy") !== "aliases-v1") {
    throw new DashboardError(
      "privacy",
      "Actualiza y reinicia el backend para activar los alias de episodios antes de abrir el informe.",
    );
  }
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new DashboardError(
      "invalid",
      "La respuesta recibida no es un informe válido.",
    );
  }
}

function fetchReport(
  endpoint: "dashboard" | "contratos",
  range: DateRange,
  signal?: AbortSignal,
  idContrato?: number,
) {
  const params = new URLSearchParams({ ...range, centroId: "99" });
  if (idContrato != null) params.set("idContrato", String(idContrato));
  return requestJson(`${endpoint}?${params}`, { signal });
}

export async function fetchPatientDrillDown(
  request: DrillDownRequest,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({
    inicio: request.inicio,
    final: request.final,
    centroId: String(request.centroId),
    idContrato: String(request.idContrato),
    revision: request.revision,
  });
  const parsed = patientDrillDownSchema.safeParse(
    await requestJson(`episodio/${request.consecutivoIngreso}?${params}`, { signal }),
  );
  if (
    !parsed.success ||
    parsed.data.idContrato !== request.idContrato ||
    parsed.data.episodio.consecutivoIngreso !== request.consecutivoIngreso ||
    parsed.data.inicio !== request.inicio ||
    parsed.data.final !== request.final ||
    parsed.data.revision !== request.revision
  ) {
    throw new DashboardError(
      "invalid",
      "El detalle no coincide con el episodio, contrato o corte solicitado. Actualiza el informe.",
    );
  }
  return parsed.data;
}

export async function fetchSimulation(
  request: SimulationRequest,
  signal?: AbortSignal,
) {
  const parsed = simulationSchema.safeParse(
    await requestJson("simulador-exclusiones", {
      method: "POST",
      signal,
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }),
  );
  if (!parsed.success ||
      parsed.data.idContrato !== request.idContrato ||
      parsed.data.inicio !== request.inicio ||
      parsed.data.final !== request.final ||
      parsed.data.centroId !== request.centroId ||
      parsed.data.revision !== request.revision) {
    throw new DashboardError(
      "invalid",
      "La respuesta del simulador no tiene el formato esperado. Revisa el backend.",
    );
  }
  return parsed.data;
}

export async function fetchDashboard(
  range: DateRange,
  idContrato: number,
  signal?: AbortSignal,
) {
  const parsed = dashboardSchema.safeParse(
    await fetchReport("dashboard", range, signal, idContrato),
  );
  if (
    !parsed.success ||
    parsed.data.metadata.idContrato !== idContrato ||
    parsed.data.metadata.fechaInicio !== range.inicio ||
    parsed.data.metadata.fechaFinal !== range.final
  ) {
    throw new DashboardError(
      "invalid",
      "El informe no coincide con el contrato, formato o fechas solicitadas. Revisa el backend.",
    );
  }
  return parsed.data;
}

export async function fetchContracts(range: DateRange, signal?: AbortSignal) {
  const parsed = contractsSchema.safeParse(
    await fetchReport("contratos", range, signal),
  );
  if (
    !parsed.success ||
    parsed.data.inicio !== range.inicio ||
    parsed.data.final !== range.final
  ) {
    throw new DashboardError(
      "invalid",
      "El catálogo no coincide con el formato o período solicitado. Revisa el backend.",
    );
  }
  return parsed.data;
}
