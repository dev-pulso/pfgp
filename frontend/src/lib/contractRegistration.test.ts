import { describe, expect, it } from "vitest";
import { budgetComparison, exactDecimal, normalizeEvents, normalizeMoney } from "./contractRegistration";
import { routeForHash } from "../hooks/useAppRoute";

describe("Decimales exactos del formulario", () => {
  it("conserva la precisión en límites grandes y sumas con decimales", () => {
    expect(normalizeMoney("922337203685477,5807")).toBe("922337203685477.5807");
    expect(normalizeMoney("922337203685477.5808")).toBeNull();
    expect(budgetComparison("922337203685477.5807", ["922337203685477.5806", "0.0001"])).toEqual({ total: "922337203685477.5807", difference: "0" });
    expect(budgetComparison("0.1", ["0.2"])).toEqual({ total: "0.2", difference: "-0.1" });
  });
  it("no interpreta separadores de miles ni cantidades vacías como importes", () => {
    for (const value of ["", "1,000.10", "1.000,10", "1 000", "0", "1e2", "1,2,3"])
      expect(normalizeMoney(value)).toBeNull();
    expect(normalizeEvents("10,33")).toBe("10.33");
    expect(normalizeEvents("10.333")).toBeNull();
    expect(budgetComparison("100", [""])).toBeNull();
  });
  it("formatea importes exactos y diferencias con signo", () => {
    expect(exactDecimal("922337203685477.5807")).toBe("$ 922.337.203.685.477,5807");
    expect(exactDecimal("-0.0001")).toBe("$ -0,0001");
    expect(exactDecimal("10.33", false)).toBe("10,33");
  });
});

describe("Ruta del formulario", () => {
  it("reconoce el enlace directo y conserva las anclas existentes", () => {
    expect(routeForHash("#/contratos/nuevo")).toBe("new-contract");
    expect(routeForHash("#/contratos/nuevo/")).toBe("new-contract");
    for (const hash of ["", "#contratos", "#analisis", "#auditoria", "#/otra-ruta"])
      expect(routeForHash(hash)).toBe("dashboard");
  });
});
