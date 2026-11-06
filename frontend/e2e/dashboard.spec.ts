import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import type { Dashboard } from "../src/api/schema";
import { fixture, catalogFixture, drillDownFixture, simulationFixture } from "./fixture";

async function mock(
  page: Page,
  options: {
    status?: number;
    privacy?: boolean;
    empty?: boolean;
    delay?: number;
    contracts?: number;
    transform?: (report: Dashboard) => void;
  } = {},
) {
  let requests = 0;
  await page.route("**/api/v1/**", async (route) => {
    requests++;
    const url = new URL(route.request().url());
    expect(url.searchParams.get("centroId")).toBe("99");
    if (options.delay) await new Promise((r) => setTimeout(r, options.delay));
    const report = fixture(
      url.searchParams.get("inicio")!,
      url.searchParams.get("final")!,
      Number(url.searchParams.get("idContrato") ?? 100),
    );
    if (options.empty) {
      report.episodios = [];
      report.agrupadores = [];
      report.paretoCostos = [];
      report.concentracion = { totalFacturadoEpisodios: 0, cantidadEpisodios: 0, cantidadTop10: 0, top10Pct: null, cantidadTopDecil: 0, topDecilPct: null };
      report.paretoUniverso = { totalServicios: 0, valorTotal: 0, porcentajesDisponibles: false, restoTop10: 0 };
      report.conciliacion = { episodiosEvaluables: 0, episodiosConciliados: 0, episodiosConDiferencia: 0, episodiosNoEvaluables: 0, porcentajeConciliadoPct: null, montoAbsolutoSinExplicar: 0 };
      const emptyBalance = { cabecera: report.kpisGlobales.totalFacturadoContrato, sumaComponentes: 0,
        diferencia: -report.kpisGlobales.totalFacturadoContrato!, estado: "con_diferencia" as const };
      report.conciliacionNiveles = { contratoAgrupadores: emptyBalance, contratoEpisodios: emptyBalance,
        agrupadores: [], agrupadoresConciliados: 0, agrupadoresConDiferencia: 0, agrupadoresNoEvaluables: 0,
        montoAbsolutoDiferenciasAgrupadores: 0 };
    }
    options.transform?.(report);
    await route.fulfill({
      status: options.status ?? 200,
      contentType: "application/json",
      headers:
        options.privacy === false
          ? {}
          : {
              "X-PFGP-Privacy": "aliases-v1",
              "Access-Control-Expose-Headers": "X-PFGP-Privacy",
            },
      body: JSON.stringify(
        options.status
          ? { detail: "ERROR_PRIVADO_NO_MOSTRAR" }
          : url.pathname.endsWith("/contratos")
            ? catalogFixture(
                url.searchParams.get("inicio")!,
                url.searchParams.get("final")!,
                options.contracts ?? 2,
              )
            : url.pathname.includes("/episodio/")
              ? drillDownFixture(
                  url.searchParams.get("inicio")!,
                  url.searchParams.get("final")!,
                  Number(url.searchParams.get("idContrato")),
                  Number(url.pathname.split("/").at(-1)),
                )
              : report,
      ),
    });
  });
  return () => requests;
}

async function openContract(page: Page, id = 100) {
  await page
    .getByRole("button", { name: `Ver contrato TEST-PFGP-${id}`, exact: true })
    .click();
  await expect(page.locator(".contract-code")).toHaveText(
    `CONTRATO TEST-PFGP-${id}`,
  );
}

test("catálogo completo, búsqueda, paginación y selección independiente", async ({
  page,
}) => {
  const calls = await mock(page, { contracts: 18 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "18 contratos disponibles" }),
  ).toBeVisible();
  await expect(page.locator(".contracts-table tbody tr")).toHaveCount(8);
  await expect(page.locator(".kpi-grid")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Página siguiente de contratos" })
    .click();
  await page
    .getByRole("button", { name: "Página siguiente de contratos" })
    .click();
  await expect(page.locator(".contracts-table tbody tr")).toHaveCount(2);
  await page
    .getByRole("searchbox", { name: "Buscar contrato por nombre, código o ID" })
    .fill("TEST-PFGP-117");
  await expect(page.locator(".contracts-table tbody tr")).toHaveCount(1);
  expect(calls()).toBe(1);
  await openContract(page, 117);
  await expect(
    page.locator(".kpi-grid").getByText("$ 124.169.161", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Volver a contratos" }).click();
  await expect(
    page.getByRole("searchbox", {
      name: "Buscar contrato por nombre, código o ID",
    }),
  ).toHaveValue("TEST-PFGP-117");
  await page
    .getByRole("searchbox", { name: "Buscar contrato por nombre, código o ID" })
    .fill("TEST-PFGP-100");
  await openContract(page, 100);
  await expect(
    page.locator(".kpi-grid").getByText("$ 107.169.161", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".kpi-grid").getByText("$ 124.169.161", { exact: true }),
  ).toHaveCount(0);
  expect(calls()).toBe(3);
});

test("catálogo vacío y móvil accesible con botón de apertura", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mock(page, { contracts: 0 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "No hay contratos en este período" }),
  ).toBeVisible();
  await page.unroute("**/api/v1/**");
  await mock(page, { contracts: 12 });
  await page.getByRole("button", { name: "Actualizar listado" }).click();
  await expect(
    page.getByRole("heading", { name: "12 contratos disponibles" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("catalog-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.screenshot({
    path: testInfo.outputPath("catalog-desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
});

test("consulta, filtros, exportación y una sola extracción al explorar", async ({
  page,
}) => {
  const calls = await mock(page);
  await page.goto("/");
  await openContract(page);
  await expect(
    page.getByRole("heading", { name: "Contrato sintético de validación" }),
  ).toBeVisible();
  await expect(
    page.locator(".kpi-grid").getByText("$ 107.169.161", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("searchbox", { name: "Buscar episodio o agrupador" })
    .fill("cirugia");
  await expect(page.locator(".episode-table tbody tr")).toHaveCount(4);
  await page
    .getByRole("searchbox", { name: "Buscar episodio o agrupador" })
    .fill("");
  await page.getByRole("button", { name: "Página siguiente" }).click();
  await expect(page.getByText("Página 2 de 3")).toBeVisible();
  expect(calls()).toBe(2);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar resumen" }).click();
  expect((await download).suggestedFilename()).toContain("pfgp-resumen");
  await page.getByLabel("Fecha inicial", { exact: true }).fill("2026-10-01");
  await page.getByLabel("Fecha final", { exact: true }).fill("2026-10-20");
  await page.getByRole("button", { name: "Aplicar período" }).click();
  await expect.poll(calls).toBe(3);
  await openContract(page);
  await page.getByRole("button", { name: "Actualizar corte" }).click();
  await expect.poll(calls).toBe(5);
});

test("drill-down accesible y sin identidades", async ({ page }) => {
  await mock(page);
  await page.goto("/");
  await openContract(page);
  await page
    .getByRole("button", { name: "Ver detalle de Episodio 0001", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".drilldown-metrics > div").filter({ has: page.getByText("Facturación de cabecera", { exact: true }) })).toContainText("$ 28.750.000");
  await expect(dialog.getByText("5,75×", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cerrar detalle" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Ver detalle de Episodio 0001",
      exact: true,
    }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Revisar episodios" }).click();
  await expect(
    page.getByRole("checkbox", { name: "Solo con alertas" }),
  ).toBeChecked();
});

test("servicios drill-down: filtros, búsqueda, paginación, teclado y responsive", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const calls = await mock(page);
  await page.goto("/");
  await openContract(page);
  const opener = page.getByRole("button", { name: "Abrir servicios de Episodio 0001", exact: true });
  await opener.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Episodio 0001", exact: true })).toBeVisible();
  await expect(dialog.locator("tbody tr")).toHaveCount(20);
  await expect(dialog.getByRole("status")).toHaveText("26 de 26 servicios");
  await dialog.getByRole("button", { name: "Página siguiente de servicios" }).click();
  await expect(dialog.locator("tbody tr")).toHaveCount(6);
  await dialog.getByRole("button", { name: "CUPS", exact: true }).click();
  await expect(dialog.locator("tbody tr")).toHaveCount(13);
  await expect(dialog.getByRole("button", { name: "CUPS", exact: true })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "Medicamentos / Insumos", exact: true }).click();
  await expect(dialog.locator("tbody tr")).toHaveCount(13);
  await dialog.getByRole("button", { name: "Con alertas", exact: true }).click();
  await expect(dialog.locator("tbody tr")).toHaveCount(2);
  await expect(dialog.locator("tbody").getByText("ID repetido", { exact: true })).toHaveCount(1);
  await expect(dialog.locator("tbody").getByText("Valor $0", { exact: true })).toHaveCount(1);
  const search = dialog.getByRole("searchbox", { name: "Buscar servicio por nombre, código o ID" });
  await search.fill("cups-125");
  await expect(dialog.locator("tbody tr")).toHaveCount(1);
  await search.fill("SIN_COINCIDENCIAS");
  await expect(dialog.getByRole("heading", { name: "No hay servicios que coincidan" })).toBeVisible();
  await search.fill("");
  await dialog.getByRole("button", { name: "Todos (26)", exact: true }).click();
  await expect(dialog.locator("tbody tr")).toHaveCount(20);
  expect(calls()).toBe(3);

  for (const size of [
    { name: "desktop", width: 1440, height: 1100 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "mobile-dark", width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    if (size.name === "mobile-dark") {
      await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
    }
    await dialog.locator(".drilldown-body").evaluate((element) => element.scrollTo(0, 0));
    expect(await dialog.evaluate((element) => element.getBoundingClientRect().right <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include("dialog").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`drilldown-${size.name}.png`), animations: "disabled" });
  }
  await dialog.getByRole("button", { name: "Cerrar detalle" }).focus();
  await page.keyboard.press("Shift+Tab");
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await opener.click();
  await expect(dialog.getByRole("button", { name: "Todos (26)", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(search).toHaveValue("");
});

test("servicios drill-down: error, reintento, vacío, cancelación y corte cambiado", async ({ page }) => {
  await mock(page);
  let mode: "error" | "empty" | "slow" | "normal" | "stale" = "error";
  let requests = 0;
  await page.route("**/api/v1/pfgp-analytics/episodio/**", async (route) => {
    requests++;
    const current = mode;
    const url = new URL(route.request().url());
    const data = drillDownFixture(
      url.searchParams.get("inicio")!, url.searchParams.get("final")!,
      Number(url.searchParams.get("idContrato")), Number(url.pathname.split("/").at(-1)),
    );
    if (current === "slow") {
      data.servicios[0].nombre = "NO_MOSTRAR_EPISODIO_ANTERIOR";
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
    if (current === "empty") data.servicios = [];
    await route.fulfill({
      status: current === "error" ? 502 : current === "stale" ? 409 : 200,
      contentType: "application/json",
      headers: { "X-PFGP-Privacy": "aliases-v1", "Access-Control-Expose-Headers": "X-PFGP-Privacy" },
      body: JSON.stringify(current === "error" || current === "stale" ? { detail: "ERROR_REMOTO_PRIVADO" } : data),
    });
  });
  await page.goto("/");
  await openContract(page, 101);
  const opener = page.getByRole("button", { name: "Ver detalle de Episodio 0001", exact: true });
  await opener.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("alert")).toContainText("No se pudo consultar Eklipse");
  await expect(dialog.getByText("ERROR_REMOTO_PRIVADO")).toHaveCount(0);
  mode = "empty";
  await dialog.getByRole("button", { name: "Reintentar detalle" }).click();
  await expect(dialog.getByRole("heading", { name: "Este episodio no tiene servicios reportados" })).toBeVisible();
  await dialog.getByRole("button", { name: "Cerrar detalle" }).click();
  mode = "slow";
  await opener.click();
  await expect(dialog.getByRole("status")).toContainText("Cargando trazabilidad");
  await expect.poll(() => requests).toBe(3);
  await page.keyboard.press("Escape");
  mode = "normal";
  await page.getByRole("button", { name: "Abrir servicios de Episodio 0024", exact: true }).click();
  await expect(dialog.locator("tbody tr")).toHaveCount(20);
  await page.waitForTimeout(800);
  await expect(dialog.getByRole("heading", { name: "Episodio 0024", exact: true })).toBeVisible();
  await expect(dialog.getByText("NO_MOSTRAR_EPISODIO_ANTERIOR")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Cerrar detalle" }).click();
  mode = "stale";
  await opener.click();
  await expect(dialog.getByRole("alert")).toContainText("Actualizar corte");
  await expect(dialog.getByRole("button", { name: "Reintentar detalle" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Cerrar y revisar corte" }).click();
  await expect(dialog).toHaveCount(0);
});

test("rechaza backend sin contrato de privacidad", async ({ page }) => {
  await mock(page, { privacy: false });
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("Actualiza y reinicia");
  await expect(
    page.getByRole("heading", { name: "Contrato sintético de validación" }),
  ).toHaveCount(0);
});

test("error seguro y estado vacío sin datos de reemplazo", async ({ page }) => {
  await mock(page, { status: 502 });
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText(
    "No se pudo consultar Eklipse",
  );
  await expect(page.getByText("ERROR_PRIVADO_NO_MOSTRAR")).toHaveCount(0);
  await page.unroute("**/api/v1/**");
  await mock(page, { status: 404 });
  await page.getByRole("button", { name: "Volver a consultar" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Este período aún no tiene datos",
  );
  await page.unroute("**/api/v1/**");
  await mock(page, { status: 503 });
  await page.getByRole("button", { name: "Volver a consultar" }).click();
  await expect(page.getByRole("alert")).toContainText("EKLIPSE_TOKEN");
  await expect(page.getByText("ERROR_PRIVADO_NO_MOSTRAR")).toHaveCount(0);
});

test("skeleton y cancelación al cambiar rápidamente de período", async ({
  page,
}) => {
  await mock(page, { delay: 800 });
  await page.goto("/");
  await expect(
    page.getByRole("status", { name: "Consultando informe" }),
  ).toBeVisible();
  await page.getByLabel("Fecha inicial", { exact: true }).fill("2026-09-01");
  await page.getByLabel("Fecha final", { exact: true }).fill("2026-09-30");
  await page.getByRole("button", { name: "Aplicar período" }).click();
  await openContract(page);
  await expect(page.locator(".contract-identity p")).toContainText("sept");
  await expect(
    page.getByRole("status", { name: "Consultando informe" }),
  ).toHaveCount(0);
});

test("colecciones vacías no dibujan datos ficticios", async ({ page }) => {
  await mock(page, { empty: true });
  await page.goto("/");
  await openContract(page);
  await expect(
    page.getByText("No hay observaciones suficientes para este gráfico."),
  ).toHaveCount(6);
  await expect(
    page.getByRole("heading", { name: "No hay episodios que coincidan" }),
  ).toBeVisible();
});

test("simulador: selección, peticiones simultáneas, error, reintento y cambio de contrato", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mock(page);
  let fail = false;
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/v1/pfgp-analytics/simulador-exclusiones", async (route) => {
    expect(route.request().method()).toBe("POST");
    const body = route.request().postDataJSON();
    requests.push(body);
    await new Promise((resolve) => setTimeout(resolve, requests.length === 1 ? 600 : 50));
    await route.fulfill({
      status: fail ? 502 : 200,
      contentType: "application/json",
      headers: { "X-PFGP-Privacy": "aliases-v1", "Access-Control-Expose-Headers": "X-PFGP-Privacy" },
      body: JSON.stringify(fail ? { detail: "ERROR_PRIVADO_NO_MOSTRAR" } : simulationFixture(body)),
    });
  });
  await page.goto("/");
  await openContract(page, 101);
  const simulator = page.locator("#simulador");
  await expect(simulator.getByRole("button", { name: "Simular escenario" })).toBeVisible();
  expect(requests).toHaveLength(0);
  await simulator.getByRole("switch", { name: "Excluir Terapia VAC", exact: true }).check();
  await expect.poll(() => requests.length).toBe(1);
  await expect(simulator.getByRole("status")).toContainText("Calculando");
  await simulator.getByRole("switch", { name: "Excluir Laparoscopia avanzada", exact: true }).check();
  await expect(simulator.locator(".simulator-relief")).toContainText("$ 300.000");
  await page.waitForTimeout(700);
  await expect(simulator.locator(".simulator-relief")).toContainText("$ 300.000");
  expect(requests[1]).toMatchObject({ centroId: 99, idContrato: 101, excluirTerapiaVAC: true, excluirLaparoscopiaAvanzada: true, excluirMallasSling: false });
  expect(requests[1].revision).toBe(fixture("2026-10-01", "2026-10-20", 101).metadata.revision);
  expect(requests[1].inicio).toBe(await page.getByLabel("Fecha inicial", { exact: true }).inputValue());
  await expect(simulator.getByText("En rango", { exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).include("#simulador").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await simulator.screenshot({ path: testInfo.outputPath("simulator-desktop-light.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Activar modo oscuro" }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).include("#simulador").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await simulator.screenshot({ path: testInfo.outputPath("simulator-mobile-dark.png") });
  fail = true;
  await simulator.getByRole("switch", { name: "Excluir Prótesis y slings urológicos", exact: true }).check();
  await expect(simulator.getByRole("alert")).toContainText("No se pudo consultar Eklipse");
  await expect(simulator.locator(".simulator-metrics")).toHaveCount(0);
  await expect(page.getByText("ERROR_PRIVADO_NO_MOSTRAR")).toHaveCount(0);
  fail = false;
  await simulator.getByRole("button", { name: "Reintentar simulación" }).click();
  await expect(simulator.locator(".simulator-relief")).toContainText("$ 350.000");
  for (const control of await simulator.getByRole("switch").all()) await control.uncheck();
  await expect(simulator.locator(".simulator-relief")).toContainText("$ 0");
  await page.getByRole("button", { name: "Volver a contratos" }).click();
  await openContract(page, 100);
  await expect(simulator.getByRole("button", { name: "Simular escenario" })).toBeVisible();
  await simulator.getByRole("button", { name: "Simular escenario" }).click();
  await expect.poll(() => requests.at(-1)?.idContrato).toBe(100);
});

for (const size of [
  { name: "desktop", width: 1440, height: 1100 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`gráficos, contraste y responsive ${size.name}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(size);
    await mock(page);
    await page.goto("/");
    await openContract(page);
    await expect(page.locator(".chart-card svg")).toHaveCount(6);
    await expect(
      page.getByRole("heading", { name: "Del contrato al episodio" }),
    ).toBeVisible();
    const overflow = await page.evaluate(() => ({
      width: innerWidth,
      actual: document.documentElement.scrollWidth,
      nodes: Array.from(document.querySelectorAll("body *"))
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.right > innerWidth + 1 && r.width > 0;
        })
        .slice(0, 22)
        .map((el) => ({
          tag: el.tagName,
          cls: el.className.toString(),
          right: el.getBoundingClientRect().right,
        })),
    }));
    expect(overflow.actual, JSON.stringify(overflow)).toBeLessThanOrEqual(
      overflow.width,
    );
    const light = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(light.violations).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath(`${size.name}-light.png`),
      fullPage: true,
      animations: "disabled",
    });
    await page.getByRole("button", { name: "Activar modo oscuro" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.evaluate(() =>
      Promise.all(
        document.getAnimations().map((a) => a.finished.catch(() => {})),
      ),
    );
    const dark = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(dark.violations).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath(`${size.name}-dark.png`),
      fullPage: true,
      animations: "disabled",
    });
  });
}

test("referencias temporales y CSV cambian sobre el mismo corte", async ({ page }) => {
  const calls = await mock(page);
  await page.goto("/");
  await page.getByLabel("Fecha inicial", { exact: true }).fill("2026-10-01");
  await page.getByLabel("Fecha final", { exact: true }).fill("2026-10-30");
  await page.getByRole("button", { name: "Aplicar período" }).click();
  await openContract(page);
  const before = calls();
  await expect(page.getByRole("radio", { name: "30 días", exact: true })).toBeChecked();
  const normalized = page.locator(".financial-context > div").filter({ has: page.getByRole("heading", { name: "Facturación normalizada · 30 días" }) });
  await expect(normalized).toContainText("$ 107.169.161");
  await page.getByRole("radio", { name: "Mes calendario", exact: true }).check();
  await expect(page.getByRole("heading", { name: "Facturación normalizada · mes calendario" })).toBeVisible();
  await expect(page.locator(".financial-context > div").filter({ has: page.getByRole("heading", { name: "Facturación normalizada · mes calendario" }) })).toContainText("$ 110.741.466");
  expect(calls()).toBe(before);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar resumen" }).click();
  const file = await (await download).path();
  const csv = await readFile(file!, "utf8");
  expect(csv).toContain('"Mes calendario";"31"');
  expect(csv).toContain('"200000000"');
  expect(csv).toContain("Presupuesto contractual reportado COP");
  expect(csv).toContain("Recepción de respuesta UTC");
  expect(csv).toContain('"2026-11-05T20:30:00Z"');
  expect(csv).toContain("Estado contrato frente a agrupadores");
  expect(csv).toContain("Estado agrupador frente a episodios");
  expect(csv).toContain("Suma absoluta diferencias de agrupadores COP");
  expect(csv).not.toContain("Episodio 0001");
  expect(calls()).toBe(before);
  await page.getByRole("radio", { name: "30 días", exact: true }).check();
  expect(calls()).toBe(before);
});

test("calendario no disponible entre meses y conciliación residual", async ({ page }) => {
  await mock(page);
  await page.goto("/");
  await page.getByLabel("Fecha inicial", { exact: true }).fill("2026-09-25");
  await page.getByLabel("Fecha final", { exact: true }).fill("2026-10-30");
  await page.getByRole("button", { name: "Aplicar período" }).click();
  await openContract(page);
  await expect(page.getByRole("radio", { name: "Mes calendario", exact: true })).toBeDisabled();
  await expect(page.getByRole("radio", { name: "30 días", exact: true })).toBeChecked();
  await expect(page.getByText("El rango abarca más de un mes calendario.")).toBeVisible();
  await expect(page.locator(".reconciliation-summary")).toContainText("23 conciliados de 24 evaluables");
  await expect(page.locator(".reconciliation-summary")).toContainText("$ 50.000");
  const search = page.getByRole("searchbox", { name: "Buscar episodio o agrupador" });
  await search.fill("Episodio 0001");
  await expect(page.locator(".episode-table tbody tr")).toContainText("Conciliado");
  await page.getByRole("button", { name: "Ver detalle de Episodio 0001", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Diferencia residual", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Recuperación reportada", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Conciliado", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await search.fill("Episodio 0002");
  await expect(page.locator(".episode-table tbody tr")).toContainText("Por conciliar");
  await expect(page.locator(".episode-table tbody tr")).toContainText("$ 50.000");
  await page.getByRole("checkbox", { name: "Solo con alertas" }).check();
  await expect(page.locator(".episode-table tbody tr")).toHaveCount(1);
});

test("simulador conserva base entidad y distingue corte cambiado de escenario inválido", async ({ page }) => {
  const calls = await mock(page);
  let mode: "normal" | "stale" | "scenario" = "normal";
  const bodies: Record<string, unknown>[] = [];
  await page.route("**/api/v1/pfgp-analytics/simulador-exclusiones", async (route) => {
    const body = route.request().postDataJSON();
    bodies.push(body);
    const status = mode === "stale" ? 409 : mode === "scenario" ? 422 : 200;
    await route.fulfill({
      status, contentType: "application/json", headers: { "X-PFGP-Privacy": "aliases-v1", "Access-Control-Expose-Headers": "X-PFGP-Privacy" },
      body: JSON.stringify(mode === "normal" ? simulationFixture(body) : { detail: {
        code: mode === "stale" ? "STALE_REPORT" : "SCENARIO_NOT_CALCULABLE", message: "ERROR_PRIVADO_NO_MOSTRAR",
      } }),
    });
  });
  await page.goto("/");
  await openContract(page);
  const simulator = page.locator("#simulador");
  await simulator.getByRole("switch", { name: "Excluir Terapia VAC", exact: true }).check();
  await expect(simulator.locator(".simulator-relief")).toContainText("$ 100.000");
  await expect(simulator.locator(".simulator-metrics")).toContainText("$ 10.000");
  await expect(simulator.locator(".simulator-metrics")).toContainText("$ 110.000");
  await expect(simulator.getByText("Original $ 1.200.000 = remanente $ 1.100.000 + traslado $ 100.000", { exact: true })).toBeVisible();
  expect(bodies[0].revision).toBe(fixture().metadata.revision);
  mode = "stale";
  await simulator.getByRole("switch", { name: "Excluir Laparoscopia avanzada", exact: true }).check();
  await expect(simulator.getByRole("alert")).toContainText("El corte cambió");
  await expect(simulator.locator(".simulator-metrics")).toHaveCount(0);
  const before = calls();
  await simulator.getByRole("button", { name: "Actualizar corte", exact: true }).click();
  await expect.poll(calls).toBe(before + 1);
  await expect(simulator.getByRole("button", { name: "Simular escenario" })).toBeVisible();
  mode = "scenario";
  await simulator.getByRole("button", { name: "Simular escenario" }).click();
  await expect(simulator.getByRole("alert")).toContainText("El escenario no es calculable");
  await expect(simulator.getByRole("alert")).not.toContainText("fechas");
  await expect(page.getByText("ERROR_PRIVADO_NO_MOSTRAR")).toHaveCount(0);
});

test("proveniencia conserva rango solicitado, recepción y centro al editar fechas y referencia", async ({ page }) => {
  const calls = await mock(page);
  await page.goto("/");
  await expect(page.locator(".query-provenance time")).toHaveAttribute("datetime", "2026-11-05T20:30:00Z");
  await page.getByLabel("Fecha inicial", { exact: true }).fill("2026-10-01");
  await page.getByLabel("Fecha final", { exact: true }).fill("2026-10-31");
  await page.getByRole("button", { name: "Aplicar período" }).click();
  await openContract(page);
  const context = page.locator(".query-provenance");
  await expect(context).toContainText("Rango solicitado");
  await expect(context).toContainText("Consulta recibida");
  await expect(context).toContainText("Centro");
  await expect(context).toContainText("99");
  await expect(context.locator("time")).toHaveAttribute("datetime", "2026-11-05T20:30:00Z");
  await expect(context.locator("time")).toContainText(/(?:15|3):30:00/);
  await expect(context.locator("time")).toContainText("Bogotá");
  const before = calls(), originalContext = await context.textContent();
  await page.getByLabel("Fecha inicial", { exact: true }).fill("2026-11-01");
  await page.getByLabel("Fecha final", { exact: true }).fill("2026-11-05");
  await expect(context).toHaveText(originalContext!);
  await page.getByRole("radio", { name: "Mes calendario", exact: true }).check();
  await expect(context).toHaveText(originalContext!);
  expect(calls()).toBe(before);
  await expect(page.locator(".executive-kpis")).toContainText("24 registros de episodio");
  await expect(page.locator(".executive-kpis")).toContainText("1.284 servicios");
  await expect(page.locator(".simulator-context")).toContainText("Contrato TEST-PFGP-100");
});

test("conciliación por niveles conserva diferencias opuestas aunque los episodios concilien", async ({ page }) => {
  await mock(page, { transform: (report) => {
    report.episodios.forEach((episode) => {
      episode.discrepanciaResidual = 0;
      episode.sumaServiciosDetalle = episode.totalFacturadoCabecera! + episode.totalRecuperado!;
      episode.importeEntidadServicios = episode.totalFacturadoCabecera;
    });
    report.conciliacion = { episodiosEvaluables: 24, episodiosConciliados: 24, episodiosConDiferencia: 0,
      episodiosNoEvaluables: 0, porcentajeConciliadoPct: 100, montoAbsolutoSinExplicar: 0 };
    for (const [index, difference] of [[0, 100], [1, -100]]) {
      const balance = report.conciliacionNiveles.agrupadores[index];
      balance.cabecera = balance.sumaComponentes! - difference;
      balance.diferencia = difference;
      balance.estado = "con_diferencia";
      report.agrupadores[index].totalFacturado = balance.cabecera;
    }
    report.conciliacionNiveles.agrupadoresConciliados = 4;
    report.conciliacionNiveles.agrupadoresConDiferencia = 2;
    report.conciliacionNiveles.montoAbsolutoDiferenciasAgrupadores = 200;
  } });
  await page.goto("/");
  await openContract(page);
  await expect(page.locator(".reconciliation-summary")).toContainText("100 %");
  const levels = page.locator(".level-reconciliation");
  await expect(levels.getByRole("heading", { name: "Conciliación entre niveles", exact: true })).toBeVisible();
  const contractTable = page.getByRole("region", { name: "Conciliación del contrato", exact: true });
  await expect(contractTable.getByRole("row").filter({ hasText: "Contrato → agrupadores" })).toContainText("Conciliado");
  await expect(contractTable.getByRole("row").filter({ hasText: "Contrato → episodios" })).toContainText("Conciliado");
  await expect(levels).toContainText("$ 200,00");
  await page.getByText("Ver conciliación monetaria por agrupador", { exact: true }).click();
  const groups = page.getByRole("region", { name: "Conciliación monetaria por agrupador", exact: true });
  const hospital = groups.getByRole("row").filter({ hasText: "Hospitalización" });
  const icu = groups.getByRole("row").filter({ hasText: "UCI adultos" });
  await expect(hospital).toContainText("Con diferencia");
  await expect(hospital).toContainText("$ 100,00");
  await expect(icu).toContainText("Con diferencia");
  await expect(icu).toContainText("100,00");
  expect(await icu.textContent()).toMatch(/[-−]/);
});

test("conciliación por niveles identifica bases ausentes sin presentar ceros conciliados", async ({ page }) => {
  await mock(page, { transform: (report) => {
    report.agrupadores[2].totalFacturado = null;
    report.conciliacionNiveles.agrupadores[2].cabecera = null;
    report.conciliacionNiveles.agrupadores[2].diferencia = null;
    report.conciliacionNiveles.agrupadores[2].estado = "no_evaluable";
    report.conciliacionNiveles.contratoAgrupadores.sumaComponentes = null;
    report.conciliacionNiveles.contratoAgrupadores.diferencia = null;
    report.conciliacionNiveles.contratoAgrupadores.estado = "no_evaluable";
    report.conciliacionNiveles.agrupadoresConciliados = 5;
    report.conciliacionNiveles.agrupadoresNoEvaluables = 1;
    report.conciliacionNiveles.montoAbsolutoDiferenciasAgrupadores = null;
  } });
  await page.goto("/");
  await openContract(page);
  const contractTable = page.getByRole("region", { name: "Conciliación del contrato", exact: true });
  const incomplete = contractTable.getByRole("row").filter({ hasText: "Contrato → agrupadores" });
  await expect(incomplete).toContainText("No evaluable");
  await expect(incomplete).not.toContainText("Conciliado");
  await expect(contractTable.getByRole("row").filter({ hasText: "Contrato → episodios" })).toContainText("Conciliado");
  await page.getByText("Ver conciliación monetaria por agrupador", { exact: true }).click();
  const row = page.getByRole("region", { name: "Conciliación monetaria por agrupador", exact: true }).getByRole("row").filter({ hasText: "Cirugía" });
  await expect(row).toContainText("No evaluable");
  await expect(row).not.toContainText("Conciliado");
  await expect(row.locator('abbr[title="No disponible"]')).toHaveCount(2);
});
