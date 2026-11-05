import { describe, expect, it } from "vitest";
import { currentRange, validRange, amount } from "./format";
import { csv } from "./export";
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
  });
  it("neutraliza fórmulas de Excel sin perder números negativos", () => {
    const result = csv([["=SUM(A1)", "\t@malicioso", 'a"b', -4, null]]);
    expect(result).toContain("'=SUM(A1)");
    expect(result).toContain("'\t@malicioso");
    expect(result).toContain('"a""b"');
    expect(result).toContain('"-4";""');
  });
  it("usa toda la lista como denominador, no solo el top 10", () => {
    const values = Array.from({ length: 20 }, (_, i) => ({
      nombre: `${i}`,
      tipo: "PRUEBA",
      cantidad: 1,
      valorTotal: 10,
    }));
    const result = pareto(values);
    expect(result).toHaveLength(10);
    expect(result.at(-1)?.cumulativePct).toBe(50);
    expect(
      pareto([{ ...values[0], valorTotal: 0 }])[0].cumulativePct,
    ).toBeNull();
  });
  it("no representa porcentajes Pareto para importes negativos", () => {
    expect(
      pareto([
        { nombre: "Ajuste", tipo: "PRUEBA", cantidad: 1, valorTotal: -10 },
      ])[0].cumulativePct,
    ).toBeNull();
  });
  it("aplica IQR con mínimo de 4 y conserva identificadores de fila", () => {
    const values = [10, 11, 12, 13, 200].map(
      (v, i) =>
        ({ totalFacturadoCabecera: v, consecutivoIngreso: i + 1 }) as Episode,
    );
    expect([...outlierIds(values)]).toEqual([5]);
    expect(outlierIds(values.slice(2)).size).toBe(0);
  });
  it("busca sin tildes y detecta discrepancias con ambos signos", () => {
    const rows = [
      {
        paciente: "Episodio 0001",
        agrupador: "Cirugía",
        discrepanciaIntegridad: -10,
        ratioSeveridadCME: 1,
      } as Episode,
    ];
    expect(filterEpisodes(rows, "cirugia", true)).toHaveLength(1);
    expect(filterEpisodes(rows, "urgencias", false)).toHaveLength(0);
  });
});
