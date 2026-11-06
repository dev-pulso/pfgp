import { afterEach, expect, it, vi } from "vitest";
import { fetchDashboard, fetchContracts, fetchPatientDrillDown, fetchSimulation } from "./dashboard";
import { fixture, catalogFixture, drillDownFixture, simulationFixture } from "../../e2e/fixture";

const range = { inicio: "2026-10-01", final: "2026-10-20" };
afterEach(() => vi.unstubAllGlobals());
const mock = (
  value: unknown,
  headers: Record<string, string> = { "X-PFGP-Privacy": "aliases-v1" },
) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(value), { headers })),
  );

it("elimina propiedades no autorizadas antes de almacenar en Query", async () => {
  mock({ ...fixture(), interno: "NO_PUBLICAR" });
  const data = await fetchDashboard(range, 100);
  expect("interno" in data).toBe(false);
});
it("exige centro 99 y recepción con zona horaria en el informe", async () => {
  for (const changes of [{ centroId: 98 }, { consultaRecibidaEn: "2026-11-05T15:30:00" }, { consultaRecibidaEn: null }]) {
    const report = fixture();
    mock({ ...report, metadata: { ...report.metadata, ...changes } });
    await expect(fetchDashboard(range, 100)).rejects.toMatchObject({ kind: "invalid" });
  }
});
it("conserva diferencias por nivel y elimina propiedades ajenas a la auditoría", async () => {
  const report = fixture();
  const balance = report.conciliacionNiveles.agrupadores[0];
  mock({ ...report, conciliacionNiveles: { ...report.conciliacionNiveles,
    agrupadores: [{ ...balance, diferencia: -0.02, estado: "con_diferencia", pacienteReal: "NO_PUBLICAR" }],
  } });
  const parsed = await fetchDashboard(range, 100);
  expect(parsed.conciliacionNiveles.agrupadores[0].diferencia).toBe(-0.02);
  expect(parsed.conciliacionNiveles.agrupadores[0]).not.toHaveProperty("pacienteReal");
});
it("rechaza conciliaciones con estados desconocidos y valores no numéricos", async () => {
  const report = fixture();
  for (const changes of [{ estado: "aprobado" }, { diferencia: "0" }]) {
    mock({ ...report, conciliacionNiveles: { ...report.conciliacionNiveles,
      contratoAgrupadores: { ...report.conciliacionNiveles.contratoAgrupadores, ...changes },
    } });
    await expect(fetchDashboard(range, 100)).rejects.toMatchObject({ kind: "invalid" });
  }
});
it("rechaza un nombre personal incluso si llega el encabezado de privacidad", async () => {
  const data = fixture();
  data.episodios[0].paciente = "NOMBRE_SINTETICO_PRIVADO";
  mock(data);
  await expect(fetchDashboard(range, 100)).rejects.toMatchObject({
    kind: "invalid",
  });
});
it("no confunde un informe de otro período con el solicitado", async () => {
  mock(fixture("2026-09-01", "2026-09-20"));
  await expect(fetchDashboard(range, 100)).rejects.toMatchObject({
    kind: "invalid",
  });
});
it("conserva AbortSignal para cancelar el transporte", async () => {
  const controller = new AbortController();
  mock(fixture());
  await fetchDashboard(range, 100, controller.signal);
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining("centroId=99"),
    expect.objectContaining({
      signal: controller.signal,
      cache: "no-store",
      credentials: "omit",
    }),
  );
});

it("muestra una instrucción de autenticación sin revelar el mensaje remoto", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ detail: "TEXTO_PRIVADO_NO_MOSTRAR" }), {
          status: 503,
        }),
    ),
  );
  await expect(fetchDashboard(range, 100)).rejects.toMatchObject({
    kind: "auth",
    message: expect.stringContaining("EKLIPSE_TOKEN"),
  });
});

it("rechaza un informe de otro contrato y envía la selección a la API", async () => {
  mock(fixture());
  await expect(fetchDashboard(range, 101)).rejects.toMatchObject({
    kind: "invalid",
  });
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining("idContrato=101"),
    expect.anything(),
  );
});

it("valida el catálogo y no almacena episodios que lleguen de más", async () => {
  mock({ ...catalogFixture(), episodios: [{ paciente: "NO_PUBLICAR" }] });
  const catalog = await fetchContracts(range);
  expect(catalog.contratos).toHaveLength(2);
  expect("episodios" in catalog).toBe(false);
});

it("rechaza IDs duplicados o conteos incompletos del catálogo", async () => {
  const catalog = catalogFixture();
  catalog.contratos[1].idContrato = catalog.contratos[0].idContrato;
  mock(catalog);
  await expect(fetchContracts(range)).rejects.toMatchObject({
    kind: "invalid",
  });
  mock({ ...catalogFixture(), totalContratos: 3 });
  await expect(fetchContracts(range)).rejects.toMatchObject({
    kind: "invalid",
  });
});

it("consulta el alias dentro del contrato y corte y elimina propiedades extra", async () => {
  const data = drillDownFixture();
  mock({ ...data, nombreReal: "NO_PUBLICAR", servicios: data.servicios.map((s) => ({ ...s, ingresoReal: 12345678 })) });
  const controller = new AbortController();
  const result = await fetchPatientDrillDown({
    ...range, centroId: 99, idContrato: 100, consecutivoIngreso: 1, revision: data.revision,
  }, controller.signal);
  expect(result.servicios).toHaveLength(26);
  expect("nombreReal" in result).toBe(false);
  expect("ingresoReal" in result.servicios[0]).toBe(false);
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining("episodio/1?inicio=2026-10-01&final=2026-10-20&centroId=99&idContrato=100&revision="),
    expect.objectContaining({ signal: controller.signal, credentials: "omit", cache: "no-store" }),
  );
});

it("rechaza un detalle de otro contrato, episodio, corte o identidad", async () => {
  const data = drillDownFixture();
  const request = { ...range, centroId: 99, idContrato: 100, consecutivoIngreso: 1, revision: data.revision };
  for (const changes of [
    { idContrato: 101 }, { final: "2026-10-21" }, { revision: "f".repeat(64) },
    { episodio: { ...data.episodio, consecutivoIngreso: 2 } },
    { episodio: { ...data.episodio, paciente: "NOMBRE_PRIVADO" } },
  ]) {
    mock({ ...data, ...changes });
    await expect(fetchPatientDrillDown(request)).rejects.toMatchObject({ kind: "invalid" });
  }
});

const simulationRequest = {
  ...range, centroId: 99, idContrato: 100, revision: "a".repeat(64),
  excluirTerapiaVAC: false, excluirLaparoscopiaAvanzada: false, excluirMallasSling: false,
};

it("vincula la simulación al contrato, rango y revisión enviados", async () => {
  const result = { ...simulationFixture(), ...range, centroId: 99, idContrato: 100, revision: simulationRequest.revision };
  mock(result);
  await expect(fetchSimulation(simulationRequest)).resolves.toMatchObject({ revision: simulationRequest.revision });
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining("simulador-exclusiones"), expect.objectContaining({
    method: "POST", body: JSON.stringify(simulationRequest),
  }));
  for (const changes of [{ idContrato: 101 }, { final: "2026-10-21" }, { revision: "b".repeat(64) }, { centroId: 98 }]) {
    mock({ ...result, ...changes });
    await expect(fetchSimulation(simulationRequest)).rejects.toMatchObject({ kind: "invalid" });
  }
});

it.each([
  [409, "STALE_REPORT", "stale"],
  [409, "DUPLICATE_CONTRACTS", "multiple"],
  [422, "SCENARIO_NOT_CALCULABLE", "scenario"],
])("distingue error %s %s sin exponer el mensaje remoto", async (status, code, kind) => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: { code, message: "PRIVADO" } }), { status })));
  await expect(fetchSimulation(simulationRequest)).rejects.toMatchObject({ kind });
  try { await fetchSimulation(simulationRequest); } catch (error) { expect(String(error)).not.toContain("PRIVADO"); }
});
