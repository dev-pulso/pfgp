import { describe, expect, it } from "vitest";
import { currentRange, validRange, amount, residualAmount } from "./format";
import { csv, summaryRows } from "./export";
import { fixture } from "../../e2e/fixture";
import { outlierIds, pareto, filterEpisodes } from "./analytics";
import type { Episode } from "../api/schema";

describe("Interpretación de datos", () => {
  it("usa Bogotá y no el día UTC para el rango inicial", () => {
    expect(currentRange(new Date("2026-11-01T02:00:00Z"))).toEqual({
      inicio: "2026-10-01",
      final: "2026-10-31",
    });
  });
  it("rechaza fechas inexistentes e inversión", () => {
    expect(validRange("2026-02-30", "2026-03-01")).toBe(false);
    expect(validRange("2026-10-20", "2026-10-01")).toBe(false);
    expect(validRange("2026-10-01", "2026-10-20")).toBe(true);
  });
  it("distingue cero de nulo en COP", () => {
    expect(amount(107169161)).toBe("$ 107.169.161");
    expect(amount(0)).toBe("$ 0");
    expect(amount(null)).toBe("No disponible");
    expect(residualAmount(0.02)).toBe("$ 0,02");
    expect(residualAmount(-0.02)).toBe("$ -0,02");
    expect(residualAmount(null)).toBe("No disponible");
  });
  it("neutraliza fórmulas de Excel sin perder números negativos", () => {
    const result = csv([["=SUM(A1)", "\t@malicioso", 'a"b', -4, null]]);
    expect(result).toContain("'=SUM(A1)");
    expect(result).toContain("'\t@malicioso");
    expect(result).toContain('"a""b"');
    expect(result).toContain('"-4";""');
  });
  it("usa el universo completo aunque la lista recibida esté limitada", () => {
    const values = Array.from({ length: 20 }, (_, i) => ({
      nombre: `${i}`,
      tipo: "PRUEBA",
      cantidad: 1,
      valorTotal: 10,
    }));
    const result = pareto(values, { totalServicios: 100, valorTotal: 1000, porcentajesDisponibles: true, restoTop10: 900 });
    expect(result).toHaveLength(10);
    expect(result.at(-1)?.cumulativePct).toBe(10);
    expect(
      pareto([{ ...values[0], valorTotal: 0 }], { totalServicios: 1, valorTotal: 0, porcentajesDisponibles: false, restoTop10: 0 })[0].cumulativePct,
    ).toBeNull();
  });
  it("no representa porcentajes Pareto para importes negativos", () => {
    expect(
      pareto([
        { nombre: "Ajuste", tipo: "PRUEBA", cantidad: 1, valorTotal: -10 },
      ], { totalServicios: 1, valorTotal: -10, porcentajesDisponibles: false, restoTop10: 0 })[0].cumulativePct,
    ).toBeNull();
  });
  it("aplica IQR con mínimo de 4 y conserva identificadores de fila", () => {
    const values = [10, 11, 12, 13, 200].map(
      (v, i) =>
        ({ totalFacturadoCabecera: v, consecutivoIngreso: i + 1, idAgrupador: 2 }) as Episode,
    );
    expect([...outlierIds(values)]).toEqual([5]);
    expect(outlierIds(values.slice(2)).size).toBe(0);
  });
  it("busca sin tildes y detecta discrepancias con ambos signos", () => {
    const rows = [
      {
        paciente: "Episodio 0001",
        agrupador: "Cirugía",
        discrepanciaResidual: -10,
        ratioSeveridadCME: 1,
      } as Episode,
    ];
    expect(filterEpisodes(rows, "cirugia", true)).toHaveLength(1);
    expect(filterEpisodes(rows, "urgencias", false)).toHaveLength(0);
  });

  it("evalúa atípicos por agrupador sin mezclar escalas de facturación", () => {
    const rows = [10, 11, 12, 13, 200, 1000, 1100, 1200, 1300, 1400].map((value, i) =>
      ({ totalFacturadoCabecera: value, consecutivoIngreso: i + 1, idAgrupador: i < 5 ? 2 : 3 }) as Episode);
    expect([...outlierIds(rows)]).toEqual([5]);
  });

  it("no alerta una diferencia bruta explicada por recuperación", () => {
    const row = { paciente: "Episodio 0001", agrupador: "UCI", discrepanciaIntegridad: 20, discrepanciaResidual: 0.01, ratioSeveridadCME: 1 } as Episode;
    expect(filterEpisodes([row], "", true)).toEqual([]);
    expect(filterEpisodes([{ ...row, discrepanciaResidual: -0.02 }], "", true)).toHaveLength(1);
  });

  it("exporta bases explícitas y métricas agregadas sin identidades", () => {
    const report = fixture();
    const rows = summaryRows(report, "calendario");
    expect(rows[0]).toContain("Presupuesto contractual reportado COP");
    const basisIndex = rows[0].indexOf("Referencia temporal");
    expect(rows[1][basisIndex]).toBe("Mes calendario");
    expect(rows[1]).toContain(report.resumenFinanciero.presupuestoContractualReportado);
    expect(csv(rows)).not.toContain("Episodio 0001");
    expect(rows.every((row) => row.length === rows[0].length)).toBe(true);
    const executionIndex = rows[0].indexOf("Ejecución %");
    const invalidBudget = { ...report, agrupadores: report.agrupadores.map((g) => ({ ...g, limitePresupuestal: -1 })) };
    expect(summaryRows(invalidBudget, "dias30").slice(1).every((row) => row[executionIndex] === null)).toBe(true);
  });

  it("exporta trazabilidad y discrepancias sin compensar agrupadores", () => {
    const report = fixture();
    const levels = report.conciliacionNiveles;
    levels.agrupadores[0] = { ...levels.agrupadores[0], diferencia: 0.02, estado: "con_diferencia" };
    levels.agrupadores[1] = { ...levels.agrupadores[1], diferencia: -0.02, estado: "con_diferencia" };
    levels.agrupadoresConDiferencia = 2;
    levels.agrupadoresConciliados -= 2;
    levels.montoAbsolutoDiferenciasAgrupadores = 0.04;
    const rows = summaryRows(report, "dias30");
    const column = (name: string, row = 1) => rows[row][rows[0].indexOf(name)];
    expect(column("Centro")).toBe(99);
    expect(column("Recepción de respuesta UTC")).toBe("2026-11-05T20:30:00Z");
    expect(column("Revisión del informe")).toBe(report.metadata.revision);
    expect(column("Servicios analizados")).toBe(1284);
    expect(column("Diferencia episodios menos agrupador COP")).toBe(0.02);
    expect(column("Diferencia episodios menos agrupador COP", 2)).toBe(-0.02);
    expect(column("Suma absoluta diferencias de agrupadores COP")).toBe(0.04);
    expect(column("Estado contrato frente a agrupadores")).toBe("conciliado");
    expect(csv(rows)).not.toContain("Episodio 0001");
  });

  it("conserva el contexto contractual al exportar un informe sin agrupadores", () => {
    const report = fixture();
    report.agrupadores = [];
    report.conciliacionNiveles.agrupadores = [];
    report.conciliacionNiveles.contratoAgrupadores = { cabecera: 100, sumaComponentes: null, diferencia: null, estado: "no_evaluable" };
    const rows = summaryRows(report, "dias30");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveLength(rows[0].length);
    expect(rows[1][rows[0].indexOf("Cabecera contractual COP")]).toBe(100);
    expect(rows[1][rows[0].indexOf("Diferencia agrupadores menos contrato COP")]).toBeNull();
    expect(rows[1][rows[0].indexOf("Estado contrato frente a agrupadores")]).toBe("no_evaluable");
    expect(rows[1][rows[0].indexOf("Límite COP")]).toBeNull();
  });

  it("no exporta como cero una cabecera ausente aunque el campo legacy sea cero", () => {
    const report = fixture();
    report.agrupadores[0].totalFacturado = 0;
    report.agrupadores[0].porcentajeEjecutado = 0;
    report.conciliacionNiveles.agrupadores[0] = {
      ...report.conciliacionNiveles.agrupadores[0], cabecera: null, diferencia: null, estado: "no_evaluable",
    };
    const rows = summaryRows(report, "dias30");
    expect(rows[1][rows[0].indexOf("Facturado COP")]).toBeNull();
    expect(rows[1][rows[0].indexOf("Ejecución %")]).toBeNull();
    expect(rows[1][rows[0].indexOf("Estado agrupador frente a episodios")]).toBe("no_evaluable");
  });
});
