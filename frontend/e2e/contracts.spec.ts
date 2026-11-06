import { expect, test, type Page } from "@playwright/test";

// Datos sintéticos del formulario de configuración; nunca se importan desde src/.
const optionsFixture = () => ({
  centroId: 99,
  contratos: [
    { id: 9001, codigo: "TEST-PFGP-9001", nombre: "Contrato por configurar", configurado: false },
    { id: 9002, codigo: "TEST-PFGP-9002", nombre: "Contrato ya configurado", configurado: true },
  ],
  tipos: [{ id: 7, agrupadorIds: [2, 3] }, { id: 8, agrupadorIds: [4] }],
  agrupadores: [
    { id: 2, nombre: "Hospitalización" },
    { id: 3, nombre: "Cirugía" },
    { id: 4, nombre: "UCI" },
  ],
});

const expectedRequest = {
  centroId: 99,
  contratoId: 9001,
  valor: "1200000.1234",
  fechaInicio: "2026-10-01",
  fechaFin: "2026-10-31",
  keyAgrupadorServicio: 7,
  agrupadores: [
    { agrupadorId: 2, limite: "600000.4321", cantidadEventosContratados: "10.33" },
    { agrupadorId: 3, limite: "400000", cantidadEventosContratados: "4" },
  ],
};

async function mockRegistration(
  page: Page,
  result: "success" | "conflict" | "unconfirmed" | "disabled" = "success",
) {
  const state = {
    gets: 0,
    writes: [] as unknown[],
    configured: false,
    failOptions: false,
  };
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    expect(url.pathname.startsWith("/api/v1/pfgp-contracts")).toBe(true);
    if (request.method() === "GET") {
      expect(url.pathname).toBe("/api/v1/pfgp-contracts/opciones");
      expect(url.searchParams.get("centroId")).toBe("99");
      state.gets++;
      if (state.failOptions || result === "disabled") {
        await route.fulfill({
          status: result === "disabled" ? 503 : 502,
          json: { detail: { code: result === "disabled" ? "CONTRACT_REGISTRATION_UNAVAILABLE" : "CONTRACT_OPTIONS_UNAVAILABLE", message: "PROVIDER_INTERNAL_DO_NOT_SHOW" } },
        });
        return;
      }
      const options = optionsFixture();
      options.contratos[0].configurado = state.configured;
      await route.fulfill({ json: options });
      return;
    }
    expect(request.method()).toBe("POST");
    expect(url.pathname).toBe("/api/v1/pfgp-contracts");
    const body = request.postDataJSON();
    state.writes.push(body);
    expect(body.centroId).toBe(99);
    if (result === "success") {
      state.configured = true;
      await route.fulfill({
        status: 201,
        json: { ...body, configuracionId: 7001, codigoContrato: "TEST-PFGP-9001", nombreContrato: "Contrato por configurar" },
      });
    } else {
      await route.fulfill({
        status: result === "conflict" ? 409 : 502,
        json: { detail: { code: result === "conflict" ? "CONTRACT_ALREADY_CONFIGURED" : "CONTRACT_WRITE_UNCONFIRMED", message: "PROVIDER_INTERNAL_DO_NOT_SHOW" } },
      });
    }
  });
  return state;
}

async function fillConfiguration(page: Page) {
  await page.getByLabel(/^Contrato existente/).selectOption("9001");
  await page.getByLabel(/^Valor del contrato/).fill(expectedRequest.valor);
  await page.getByLabel(/^Vigencia registrada: inicio/).fill(expectedRequest.fechaInicio);
  await page.getByLabel(/^Vigencia registrada: fin/).fill(expectedRequest.fechaFin);
  await page.getByLabel(/^Tipo de agrupación/).selectOption("7");
  for (const [name, group] of [["Hospitalización", expectedRequest.agrupadores[0]], ["Cirugía", expectedRequest.agrupadores[1]]] as const) {
    await page.getByRole("checkbox", { name: `Incluir agrupador ${name}`, exact: true }).check();
    await page.getByLabel(new RegExp(`^Límite de ${name}`)).fill(group.limite);
    await page.getByLabel(new RegExp(`^Eventos contratados de ${name}`)).fill(group.cantidadEventosContratados);
  }
}

async function reviewConfiguration(page: Page) {
  await fillConfiguration(page);
  await page.getByRole("button", { name: "Revisar configuración", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Revisar configuración", exact: true })).toBeVisible();
}

test("registra un detalle existente con importes exactos después de revisar", async ({ page }) => {
  const state = await mockRegistration(page);
  await page.goto("/#/contratos/nuevo");
  await expect(page.getByRole("heading", { name: "Agregar contrato PFGP", exact: true })).toBeVisible();
  await expect(page.getByLabel(/^Contrato existente/).locator('option[value="9002"]')).toBeDisabled();
  await reviewConfiguration(page);
  expect(state.writes).toHaveLength(0);
  await page.getByRole("button", { name: "Guardar configuración", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Configuración registrada", exact: true })).toBeVisible();
  expect(state.writes).toEqual([expectedRequest]);
  await expect(page.getByText("Contrato TEST-PFGP-9001 · Contrato por configurar", { exact: true })).toBeVisible();
});

test("una escritura incierta requiere comprobar el estado sin repetir el POST", async ({ page }) => {
  const state = await mockRegistration(page, "unconfirmed");
  await page.goto("/#/contratos/nuevo");
  await reviewConfiguration(page);
  await page.getByRole("button", { name: "Guardar configuración", exact: true }).click();
  await expect(page.getByText("Resultado de escritura sin confirmar", { exact: true })).toBeVisible();
  expect(state.writes).toHaveLength(1);
  await expect(page.getByText("PROVIDER_INTERNAL_DO_NOT_SHOW")).toHaveCount(0);
  state.configured = true;
  const getsBeforeCheck = state.gets;
  await page.getByRole("button", { name: "Comprobar estado", exact: true }).click();
  await expect(page.getByText("El contrato figura configurado", { exact: true })).toBeVisible();
  expect(state.gets).toBe(getsBeforeCheck + 1);
  expect(state.writes).toHaveLength(1);
});

test("un fallo al comprobar el estado incierto no vuelve a habilitar el envío", async ({ page }) => {
  const state = await mockRegistration(page, "unconfirmed");
  await page.goto("/#/contratos/nuevo");
  await reviewConfiguration(page);
  await page.getByRole("button", { name: "Guardar configuración", exact: true }).click();
  await expect(page.getByText("Resultado de escritura sin confirmar", { exact: true })).toBeVisible();
  state.failOptions = true;
  await page.getByRole("button", { name: "Comprobar estado", exact: true }).click();
  await expect(page.getByText("No pudimos comprobar el estado. El envío sigue bloqueado.", { exact: true })).toBeVisible();
  await expect(page.getByText("Resultado de escritura sin confirmar", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Guardar configuración", exact: true })).toHaveCount(0);
  await expect(page.getByText("PROVIDER_INTERNAL_DO_NOT_SHOW")).toHaveCount(0);
  expect(state.writes).toHaveLength(1);
});

test("validación y cambio de tipo conservan solo agrupadores compatibles", async ({ page }) => {
  const state = await mockRegistration(page);
  await page.goto("/#/contratos/nuevo");
  await fillConfiguration(page);
  await page.getByLabel(/^Valor del contrato/).fill("0");
  await page.getByRole("button", { name: "Revisar configuración", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Revisar configuración", exact: true })).toHaveCount(0);
  expect(state.writes).toHaveLength(0);
  await page.getByLabel(/^Valor del contrato/).fill(expectedRequest.valor);
  await page.getByLabel(/^Tipo de agrupación/).selectOption("8");
  await expect(page.getByRole("checkbox", { name: "Incluir agrupador Hospitalización", exact: true })).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "Incluir agrupador Cirugía", exact: true })).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Incluir agrupador UCI", exact: true }).check();
  await page.getByLabel(/^Límite de UCI/).fill("750000,1234");
  await page.getByLabel(/^Eventos contratados de UCI/).fill("3,25");
  await page.getByRole("button", { name: "Revisar configuración", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Revisar configuración", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Guardar configuración", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Configuración registrada", exact: true })).toBeVisible();
  expect(state.writes).toEqual([{ ...expectedRequest, keyAgrupadorServicio: 8, agrupadores: [
    { agrupadorId: 4, limite: "750000.1234", cantidadEventosContratados: "3.25" },
  ] }]);
});

test("el conflicto de configuración existente no repite la escritura ni expone el error del proveedor", async ({ page }) => {
  const state = await mockRegistration(page, "conflict");
  await page.goto("/#/contratos/nuevo");
  await reviewConfiguration(page);
  await page.getByRole("button", { name: "Guardar configuración", exact: true }).click();
  await expect(page.getByText("El contrato ya tiene una configuración PFGP. Actualiza las opciones para comprobar su estado.", { exact: true })).toBeVisible();
  await expect(page.getByText("PROVIDER_INTERNAL_DO_NOT_SHOW")).toHaveCount(0);
  expect(state.writes).toHaveLength(1);
  await expect(page.getByRole("button", { name: "Guardar configuración", exact: true })).toBeDisabled();
  state.configured = true;
  await page.getByRole("button", { name: "Actualizar opciones", exact: true }).click();
  await expect(page.getByLabel(/^Contrato existente/).locator('option[value="9001"]')).toBeDisabled();
  expect(state.writes).toHaveLength(1);
});

test("endpoint deshabilitado informa indisponibilidad sin permitir guardar", async ({ page }) => {
  const state = await mockRegistration(page, "disabled");
  await page.goto("/#/contratos/nuevo");
  await expect(page.getByText("La configuración de contratos todavía no está disponible. La integración necesita un endpoint autorizado y habilitado en el origen.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Guardar configuración", exact: true })).toHaveCount(0);
  await expect(page.getByText("PROVIDER_INTERNAL_DO_NOT_SHOW")).toHaveCount(0);
  expect(state.writes).toHaveLength(0);
});
