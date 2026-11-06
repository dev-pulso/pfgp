import { afterEach, describe, expect, it, vi } from "vitest";
import { contractConfigurationSchema, contractOptionsSchema, createContractConfiguration, fetchContractOptions } from "./contracts";

const input = () => ({
  centroId: 99 as const, contratoId: 760, valor: "1200.1234", fechaInicio: "2026-10-01", fechaFin: "2026-10-31",
  keyAgrupadorServicio: 0, agrupadores: [{ agrupadorId: 2, limite: "900.4321", cantidadEventosContratados: "10.33" }],
});
const options = () => ({ centroId: 99, contratos: [{ id: 760, codigo: "8022", nombre: "Contrato sintético", configurado: false }], tipos: [{ id: 0, agrupadorIds: [2] }], agrupadores: [{ id: 2, nombre: "Hospitalización" }] });
const created = () => ({ ...input(), configuracionId: 11, codigoContrato: "8022", nombreContrato: "Contrato sintético" });
function mockResponse(body: unknown, status = 200) {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
afterEach(() => vi.unstubAllGlobals());

describe("Contrato de configuración PFGP", () => {
  it("normaliza coma y ceros sin perder decimales y permite presupuesto distinto de límites", () => {
    const value = input(); value.valor = "0001200,1234"; value.agrupadores[0].cantidadEventosContratados = "10,30";
    const parsed = contractConfigurationSchema.parse(value);
    expect(parsed.valor).toBe("1200.1234"); expect(parsed.agrupadores[0].cantidadEventosContratados).toBe("10.3");
    expect(parsed.keyAgrupadorServicio).toBe(0);
  });
  it.each([
    { valor: "0" }, { valor: "-1" }, { valor: "1.00001" }, { valor: "922337203685477.5808" },
    { contratoId: 2147483648 }, { keyAgrupadorServicio: -1 }, { fechaInicio: "1752-12-31" },
    { fechaInicio: "2026-02-30" }, { fechaFin: "2026-09-30" }, { centroId: 98 }, { agrupadores: [] },
    { agrupadores: [{ agrupadorId: 1, limite: "1", cantidadEventosContratados: "1" }] },
    { agrupadores: [{ agrupadorId: 2, limite: "1", cantidadEventosContratados: "0" }] },
    { agrupadores: [{ agrupadorId: 2, limite: "1", cantidadEventosContratados: "1.001" }] },
    { agrupadores: [{ agrupadorId: 2, limite: "1", cantidadEventosContratados: "10000000000000000" }] },
  ])("rechaza un payload incompatible %j", (changes) => {
    expect(contractConfigurationSchema.safeParse({ ...input(), ...changes }).success).toBe(false);
  });
  it("admite máximos SQL exactos y exige agrupadores únicos hasta 100", () => {
    const value = input(); value.valor = "922337203685477.5807";
    value.agrupadores[0].cantidadEventosContratados = "9999999999999999.99";
    expect(contractConfigurationSchema.parse(value).valor).toBe(value.valor);
    expect(contractConfigurationSchema.safeParse({ ...value, agrupadores: [...value.agrupadores, ...value.agrupadores] }).success).toBe(false);
    expect(contractConfigurationSchema.safeParse({ ...value, agrupadores: Array.from({ length: 101 }, (_, i) => ({ ...value.agrupadores[0], agrupadorId: i + 2 })) }).success).toBe(false);
  });
  it("rechaza opciones ambiguas y centro diferente", () => {
    const value = options(); value.contratos.push(value.contratos[0]);
    expect(contractOptionsSchema.safeParse(value).success).toBe(false);
    expect(contractOptionsSchema.safeParse({ ...options(), centroId: 98 }).success).toBe(false);
  });
  it("consulta opciones del endpoint dedicado sin exigir header de pacientes", async () => {
    const fetch = mockResponse(options());
    expect(await fetchContractOptions()).toEqual(options());
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/v1/pfgp-contracts/opciones?centroId=99"), expect.objectContaining({ credentials: "omit", cache: "no-store" }));
  });
  it("envía strings exactos una vez y valida la respuesta 201", async () => {
    const fetch = mockResponse({ ...created(), valor: "1200.1234", agrupadores: [{ agrupadorId: 2, limite: "900.4321", cantidadEventosContratados: "10.330" }] }, 201);
    // Three decimal places for event quantities are incompatible even if the last digit is zero.
    await expect(createContractConfiguration(input())).rejects.toMatchObject({ kind: "unconfirmed" });
    expect(fetch).toHaveBeenCalledTimes(1);
    mockResponse(created(), 201);
    const result = await createContractConfiguration(input());
    expect(result.configuracionId).toBe(11);
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith(expect.stringContaining("/api/v1/pfgp-contracts"), expect.objectContaining({ method: "POST", body: JSON.stringify(input()), credentials: "omit" }));
  });
  it("compara respuestas normalizadas por valor exacto y no por formato", async () => {
    const value = input(); value.valor = "1200"; value.agrupadores[0].cantidadEventosContratados = "10";
    mockResponse({ ...created(), valor: "1200.0000", agrupadores: [{ ...value.agrupadores[0], cantidadEventosContratados: "10.00" }] }, 201);
    expect((await createContractConfiguration(value)).valor).toBe("1200");
  });
  it.each([
    [503, "CONTRACT_REGISTRATION_UNAVAILABLE", "unavailable"],
    [403, "CONTRACT_WRITE_FORBIDDEN", "forbidden"],
    [409, "CONTRACT_ALREADY_CONFIGURED", "already_configured"],
    [422, "INVALID_GROUP_REFERENCE", "validation"],
    [502, "CONTRACT_WRITE_UNCONFIRMED", "unconfirmed"],
  ])("distingue error %s %s sin repetir escritura", async (status, code, kind) => {
    const fetch = mockResponse({ detail: { code, message: "SECRET_PROVIDER_MESSAGE" } }, status);
    await expect(createContractConfiguration(input())).rejects.toMatchObject({ kind });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("resultado de red, eco discordante y 200 en escritura requieren comprobación", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Network")));
    await expect(createContractConfiguration(input())).rejects.toMatchObject({ kind: "unconfirmed" });
    mockResponse({ ...created(), contratoId: 999 }, 201);
    await expect(createContractConfiguration(input())).rejects.toMatchObject({ kind: "unconfirmed" });
    mockResponse(created(), 200);
    await expect(createContractConfiguration(input())).rejects.toMatchObject({ kind: "unconfirmed" });
  });
});
