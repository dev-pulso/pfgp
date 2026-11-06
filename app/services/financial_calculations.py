"""Decimal calculations shared by reports and scenarios; never public identities."""
from calendar import monthrange
from datetime import date
from decimal import Decimal, InvalidOperation
from math import ceil

ZERO = Decimal(0)
TOLERANCE = Decimal("0.01")


def decimal(value):
    if value is None or isinstance(value, bool):
        return None
    try:
        result = Decimal(str(value))
        return result if result.is_finite() else None
    except (InvalidOperation, ValueError):
        return None


def legacy(value):
    """Zero defaults only for the pre-existing response fields."""
    return decimal(value) or ZERO


def complete_sum(values):
    values = list(values)
    return None if any(v is None for v in values) else sum(values, ZERO)


def legacy_rows(record, key):
    """Keep legacy iteration safe; audit functions inspect the original list."""
    value = record.get(key)
    return value if isinstance(value, list) else []


def balance(header, components):
    difference = components - header if header is not None and components is not None else None
    return {
        "cabecera": header,
        "sumaComponentes": components,
        "diferencia": difference,
        "estado": "no_evaluable" if difference is None else "con_diferencia" if abs(difference) > TOLERANCE else "conciliado",
    }


def hierarchy_reconciliation(contract):
    """Reconcile net headers independently from gross service/recovery checks."""
    raw_groups = contract.get("agrupadores")
    groups_available = isinstance(raw_groups, list)
    groups = raw_groups if groups_available else []
    group_headers, episode_totals, rows = [], [], []
    for group in groups:
        header = decimal(group.get("totalFacturado"))
        raw_episodes = group.get("iteracciones")
        episodes_available = isinstance(raw_episodes, list)
        episodes = raw_episodes if episodes_available else []
        total = complete_sum(decimal(e.get("totalFacturado")) for e in episodes) if episodes_available else None
        group_headers.append(header)
        episode_totals.append(total)
        rows.append({
            **balance(header, total), "idAgrupador": group["id"],
            "nombre": str(group.get("nombre", "")).strip(), "cantidadEpisodios": len(episodes),
        })
    unavailable = sum(row["estado"] == "no_evaluable" for row in rows)
    differences = [row for row in rows if row["estado"] == "con_diferencia"]
    header = decimal(contract.get("totalFacturado"))
    return {
        "contratoAgrupadores": balance(header, complete_sum(group_headers) if groups_available else None),
        "contratoEpisodios": balance(header, complete_sum(episode_totals) if groups_available else None),
        "agrupadores": rows,
        "agrupadoresConciliados": sum(row["estado"] == "conciliado" for row in rows),
        "agrupadoresConDiferencia": len(differences),
        "agrupadoresNoEvaluables": unavailable,
        # An incomplete universe must not appear to have an exact total.
        "montoAbsolutoDiferenciasAgrupadores": sum((abs(row["diferencia"]) for row in differences), ZERO) if groups_available and not unavailable else None,
    }


def percentage(numerator, denominator):
    if numerator is None or denominator is None or denominator <= 0:
        return None
    return round(numerator / denominator * 100, 2)


def portion(service, key):
    quantity, unit = decimal(service.get("cantidad")), decimal(service.get(key))
    return None if quantity is None or unit is None else quantity * unit


def json_numbers(value):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, dict):
        return {k: json_numbers(v) for k, v in value.items()}
    if isinstance(value, list):
        return [json_numbers(v) for v in value]
    return value


def quantile(values, probability):
    if not values:
        return None
    ordered = sorted(values)
    position = Decimal(len(ordered) - 1) * Decimal(str(probability))
    low = int(position)
    high = min(low + 1, len(ordered) - 1)
    return ordered[low] + (ordered[high] - ordered[low]) * (position - low)


def financial_summary(contract):
    raw_groups = contract.get("agrupadores")
    groups = legacy_rows(contract, "agrupadores")
    budget = decimal(contract.get("totalContratado"))
    billed = decimal(contract.get("totalFacturado"))
    limits = complete_sum(decimal(g.get("limite")) for g in groups) if isinstance(raw_groups, list) else None
    events = complete_sum(decimal(g.get("totalFacturado")) for g in groups if g.get("id") == 1) if isinstance(raw_groups, list) else None
    return {
        "presupuestoContractualReportado": budget,
        "sumaLimitesAgrupadores": limits,
        "diferenciaPresupuestos": budget - limits if budget is not None and limits is not None else None,
        "coberturaLimitesPct": percentage(limits, budget),
        "ejecucionContractualPct": percentage(billed, budget),
        "participacionEventosPct": percentage(events, billed),
    }


def exposure(contract, bed):
    reported = decimal(contract.get("totalDisponibilidad"))
    result = {
        "estado": "no_disponible", "registrosAcostado": None,
        "totalAcostado": None, "totalCombinado": None,
        "ejecucionCombinadaPct": None, "disponibilidadCalculada": None,
        "disponibilidadReportada": reported, "diferenciaDisponibilidad": None,
        "ingresosCompartidos": 0, "supuestoMismoCorte": True,
    }
    if bed is None:
        return result
    rows = bed.get("iteracciones")
    result["registrosAcostado"] = len(rows) if isinstance(rows, list) else None
    result["totalAcostado"] = decimal(bed.get("totalFacturado"))
    if not isinstance(rows, list):
        return result
    raw_groups = contract.get("agrupadores")
    if not isinstance(raw_groups, list) or any(not isinstance(g.get("iteracciones"), list) for g in raw_groups):
        return result
    billed_rows = [e for g in raw_groups for e in g["iteracciones"]]
    # Missing identifiers make the overlap check inconclusive.
    if any(e.get("consecutivoIngreso") is None for e in billed_rows + rows):
        return result
    ids = {str(e["consecutivoIngreso"]) for e in billed_rows}
    shared = ids.intersection(str(e["consecutivoIngreso"]) for e in rows)
    result["ingresosCompartidos"] = len(shared)
    if shared:
        result["estado"] = "solapamiento"
        return result
    billed, budget = decimal(contract.get("totalFacturado")), decimal(contract.get("totalContratado"))
    if billed is None or result["totalAcostado"] is None:
        return result
    total = billed + result["totalAcostado"]
    available = budget - total if budget is not None else None
    result.update(
        estado="disponible", totalCombinado=total,
        ejecucionCombinadaPct=percentage(total, budget), disponibilidadCalculada=available,
        diferenciaDisponibilidad=available - reported if available is not None and reported is not None else None,
    )
    return result


def temporal_references(inicio, final, billed):
    start, end = date.fromisoformat(inicio), date.fromisoformat(final)
    days = max(1, (end - start).days + 1)
    def reference(base):
        return {"diasReferencia": base,
                "facturacionNormalizada": billed / days * base if billed is not None else None,
                "avanceReferenciaPct": round(Decimal(days) / base * 100, 2)}
    same_month = (start.year, start.month) == (end.year, end.month)
    return {
        "dias30": reference(30),
        "calendario": reference(monthrange(start.year, start.month)[1]) if same_month else None,
        "motivoCalendario": None if same_month else "El rango abarca más de un mes calendario.",
    }


def concentration(values):
    total = complete_sum(values)
    count = len(values)
    valid = total is not None and total > 0 and all(v >= 0 for v in values)
    ordered = sorted((v for v in values if v is not None), reverse=True)
    top10, decile = min(10, count), ceil(count / 10)
    return {
        "totalFacturadoEpisodios": total, "cantidadEpisodios": count,
        "cantidadTop10": top10, "top10Pct": percentage(sum(ordered[:top10], ZERO), total) if valid else None,
        "cantidadTopDecil": decile, "topDecilPct": percentage(sum(ordered[:decile], ZERO), total) if valid else None,
    }
