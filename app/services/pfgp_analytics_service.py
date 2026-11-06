"""Financial report built from one source response with explicit monetary bases."""
from datetime import date, datetime, timezone
import hashlib
import hmac
import json
import re
import secrets
from app.adapters.eklipse_client import EklipseClient
from app.services.financial_calculations import (
    ZERO, TOLERANCE, decimal, legacy, complete_sum, percentage, portion,
    json_numbers, quantile, financial_summary, exposure, temporal_references, concentration,
    legacy_rows, hierarchy_reconciliation,
)

_REVISION_KEY = secrets.token_bytes(32)


class NoDataError(ValueError):
    pass


class MultipleContractsError(ValueError):
    pass


class StaleReportError(ValueError):
    pass


class ScenarioNotCalculableError(ValueError):
    pass


class PfgpAnalyticsService:
    def __init__(self, client: EklipseClient):
        self.client = client

    @staticmethod
    def _received_timestamp():
        return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    async def _fetch_source(self, inicio, final, centro_id):
        source = await self.client.fetch_data(inicio, final, centro_id)
        received_at = self._received_timestamp()
        if not isinstance(source, dict) or not isinstance(source.get("facturado"), list):
            raise ValueError("Estructura incompatible.")
        for key in ("facturado", "acostado"):
            records = source.get(key)
            if records is None and key == "acostado":
                continue
            if not isinstance(records, list):
                raise ValueError("Estructura incompatible.")
            identifiers = set()
            for record in records:
                identifier = record.get("idContrato") if isinstance(record, dict) else None
                if isinstance(identifier, bool) or not str(identifier).isdigit():
                    raise ValueError("Identificador inválido.")
                if int(identifier) in identifiers:
                    raise MultipleContractsError("Identificador repetido.")
                identifiers.add(int(identifier))
        return source, received_at

    @staticmethod
    def _bed(source, identifier):
        return next((c for c in (source.get("acostado") or []) if int(c["idContrato"]) == identifier), None)

    @staticmethod
    def _select(source, identifier=None):
        contracts = source["facturado"]
        if identifier is not None:
            contracts = [c for c in contracts if int(c["idContrato"]) == identifier]
        if not contracts:
            raise NoDataError("Contrato no disponible.")
        if len(contracts) > 1:
            raise MultipleContractsError("Selecciona un contrato.")
        return contracts[0]

    @staticmethod
    def _revision(contract, inicio, final, bed=None):
        snapshot = json.dumps([inicio, final, contract, bed], sort_keys=True, ensure_ascii=True, allow_nan=False)
        return hmac.new(_REVISION_KEY, snapshot.encode(), hashlib.sha256).hexdigest()

    def _catalog(self, source, inicio, final, centro_id, consulta_recibida_en=None):
        rows = []
        for contract in source["facturado"]:
            groups = legacy_rows(contract, "agrupadores")
            limits = complete_sum(decimal(g.get("limite")) for g in groups) if groups else None
            rows.append({
                "idContrato": int(contract["idContrato"]),
                "codigoContrato": str(contract.get("codigoContrato") or ""),
                "nombreContrato": str(contract.get("nombreContrato") or "").strip(),
                "totalFacturadoContrato": decimal(contract.get("totalFacturado")),
                "presupuestoTotalLimite": limits,
                "totalRecuperado": decimal(contract.get("totalRecuperado")),
                "cantidadAgrupadores": len(groups),
                "resumenFinanciero": financial_summary(contract),
                "exposicion": exposure(contract, self._bed(source, int(contract["idContrato"]))),
            })
        return json_numbers({"inicio": inicio, "final": final, "centroId": centro_id,
                             "consultaRecibidaEn": consulta_recibida_en or self._received_timestamp(),
                             "totalContratos": len(rows), "contratos": rows})

    async def list_contracts(self, inicio, final, centro_id):
        source, received_at = await self._fetch_source(inicio, final, centro_id)
        return self._catalog(source, inicio, final, centro_id, received_at)

    async def generate_contract_report(self, inicio, final, centro_id, id_contrato=None):
        source, received_at = await self._fetch_source(inicio, final, centro_id)
        if id_contrato is None and len(source["facturado"]) > 1:
            return self._catalog(source, inicio, final, centro_id, received_at)
        contract = self._select(source, id_contrato)
        return self._build_report(contract, inicio, final, self._bed(source, int(contract["idContrato"])), received_at)

    @staticmethod
    def _services(raw):
        services, seen = [], set()
        for service in raw:
            identifier = str(service.get("id", ""))
            code = str(service.get("codigo", "")).strip()
            total, price = legacy(service.get("valorTotal")), legacy(service.get("valorProducto"))
            services.append({
                "id": identifier, "codigo": code, "nombre": str(service.get("nombre", "")).strip(),
                "tipo": "INSUMO/MEDICAMENTO" if code == "MEDICAMENTOS" else "PROCEDIMIENTO/CUPS",
                "cantidad": legacy(service.get("cantidad")), "valorProducto": price, "valorTotal": total,
                "importeEntidad": portion(service, "valorEntidad"), "importePaciente": portion(service, "valorPaciente"),
                "es_duplicado": identifier in seen, "es_cero": total == 0 and price > 0,
            })
            seen.add(identifier)
        return services

    def _build_report(self, contract, inicio, final, bed=None, consulta_recibida_en=None):
        days = max(1, (date.fromisoformat(final) - date.fromisoformat(inicio)).days + 1)
        progress = decimal(days) / 30 * 100
        groups, episodes, all_services, raw_values, raw_service_values = [], [], [], [], []
        residuals, dirty_names, pareto = [], 0, {}
        for group in legacy_rows(contract, "agrupadores"):
            name = str(group.get("nombre", "")).strip()
            dirty_names += int("\n" in str(group.get("nombre", "")) or "\r" in str(group.get("nombre", "")))
            raw_episodes = legacy_rows(group, "iteracciones")
            values = [decimal(e.get("totalFacturado")) for e in raw_episodes]
            raw_values.extend(values)
            observations = [v for v in values if v is not None]
            count = len(raw_episodes)
            billed, limit = legacy(group.get("totalFacturado")), legacy(group.get("limite"))
            contracted = legacy(group.get("cantidadEventosContratados"))
            cme = decimal(group.get("CMEContratado"))
            execution = percentage(billed, limit) or ZERO
            burn = round(execution / progress, 2) if limit > 0 else None
            actual_billed, actual_limit = decimal(group.get("totalFacturado")), decimal(group.get("limite"))
            actual_count = decimal(group.get("cantidadEventosContratados"))
            valid_drivers = cme is not None and cme > 0 and actual_count is not None and actual_count > 0
            groups.append({
                "idAgrupador": group["id"], "nombre": name, "peso": legacy(group.get("peso")),
                "limitePresupuestal": limit, "totalFacturado": billed, "totalRecuperado": legacy(group.get("totalRecuperado")),
                "eventosContratados": contracted, "iteracionesReportadasAPI": int(group.get("cantidadIteracciones", 0)),
                "iteracionesRealesJSON": count, "cmeContratado": cme, "porcentajeEjecutado": execution,
                "burnRateRatio": burn, "proyeccionCierre30Dias": round(billed / days * 30, 0),
                "deficitProyectado": round(limit - billed / days * 30, 0) if limit > 0 else None,
                "discrepanciaConteoEventos": int(group.get("cantidadIteracciones", 0)) - count,
                "cumplimientoFrecuenciaPct": percentage(decimal(count), contracted),
                "cmeRealPromedio": round(billed / count, 0) if count else ZERO,
                "estadoAlerta": "HUERFANO_SIN_TECHO" if limit == 0 else "DESBORDADO_CRITICO" if execution > 100 else "RIESGO_SOBRECOSTO" if burn and burn > 1 else "CONTROLADO",
                "efectoVolumen": (count - actual_count) * cme if valid_drivers else None,
                "efectoValor": actual_billed - count * cme if valid_drivers and actual_billed is not None else None,
                "diferenciaPresupuestoImplicito": actual_count * cme - actual_limit if valid_drivers and actual_limit is not None else None,
                "medianaFacturacion": quantile(observations, .5), "p90Facturacion": quantile(observations, .9),
                "cantidadObservaciones": len(observations),
            })
            for episode in raw_episodes:
                raw_services = legacy_rows(episode, "servicios")
                services_available = isinstance(episode.get("servicios"), list)
                if not services_available:
                    raw_service_values.append(None)
                raw_service_values.extend(decimal(s.get("valorTotal")) for s in raw_services)
                services = self._services(raw_services)
                all_services.extend(services)
                service_total = sum((s["valorTotal"] for s in services), ZERO)
                episode_billed = legacy(episode.get("totalFacturado"))
                episode_cme = decimal(episode.get("CMEContratado")) or cme
                recovered = decimal(episode.get("totalRecuperado"))
                detail = complete_sum(decimal(s.get("valorTotal")) for s in raw_services) if services_available else None
                exact_billed = decimal(episode.get("totalFacturado"))
                residual = detail - exact_billed - recovered if detail is not None and exact_billed is not None and recovered is not None else None
                residuals.append(residual)
                meds = sum((s["valorTotal"] for s in services if s["codigo"] == "MEDICAMENTOS"), ZERO)
                stay = int(episode.get("diasEstancia", 0))
                episodes.append({
                    "idAgrupador": group["id"], "consecutivoIngreso": 0, "paciente": "", "agrupador": name, "fechaIngreso": "",
                    "diasEstancia": stay, "totalFacturadoCabecera": episode_billed,
                    "totalRecuperado": recovered, "sumaServiciosDetalle": service_total,
                    "discrepanciaIntegridad": service_total - episode_billed, "discrepanciaResidual": residual,
                    "importeEntidadServicios": complete_sum(s["importeEntidad"] for s in services) if services_available else None,
                    "importePacienteServicios": complete_sum(s["importePaciente"] for s in services) if services_available else None,
                    "montoDuplicadoDetectado": sum((s["valorTotal"] for s in services if s["es_duplicado"]), ZERO),
                    "cmeContratado": episode_cme,
                    "ratioSeveridadCME": round(episode_billed / episode_cme, 2) if episode_cme is not None and episode_cme > 0 else None,
                    "costoDiarioEstancia": round(episode_billed / stay, 0) if stay > 0 else episode_billed,
                    "gastoInsumos": meds, "indicePresionInsumosPct": percentage(meds, service_total) or ZERO,
                })
                for service in services:
                    key = service["nombre"], service["tipo"]
                    if key not in pareto:
                        pareto[key] = {"nombre": key[0], "tipo": key[1], "cantidad": ZERO, "valorTotal": ZERO}
                    pareto[key]["cantidad"] += service["cantidad"]
                    pareto[key]["valorTotal"] += service["valorTotal"]
        episodes.sort(key=lambda e: e["totalFacturadoCabecera"], reverse=True)
        for ordinal, episode in enumerate(episodes, 1):
            episode.update(consecutivoIngreso=ordinal, paciente=f"Episodio {ordinal:04d}")
        pareto_rows = sorted(pareto.values(), key=lambda s: (-s["valorTotal"], s["nombre"], s["tipo"]))
        service_total = sum((s["valorTotal"] for s in all_services), ZERO)
        meds_total = sum((s["valorTotal"] for s in all_services if s["codigo"] == "MEDICAMENTOS"), ZERO)
        limit_total = sum((g["limitePresupuestal"] for g in groups), ZERO)
        billed = legacy(contract.get("totalFacturado"))
        recovered = legacy(contract.get("totalRecuperado"))
        execution = percentage(billed, limit_total) or ZERO
        evaluated = [v for v in residuals if v is not None]
        differences = [v for v in evaluated if abs(v) > TOLERANCE]
        duplicate_services = [s for s in all_services if s["es_duplicado"]]
        zero_services = [s for s in all_services if s["es_cero"]]
        report = {
            "metadata": {
                "centroId": 99,
                "consultaRecibidaEn": consulta_recibida_en or self._received_timestamp(),
                "idContrato": int(contract["idContrato"]), "codigoContrato": str(contract.get("codigoContrato") or ""),
                "nombreContrato": str(contract.get("nombreContrato") or "").strip(), "fechaInicio": inicio, "fechaFinal": final,
                "diasCorteAnalizados": days, "avanceTemporalMesPct": round(progress, 2),
                "revision": self._revision(contract, inicio, final, bed),
            },
            "kpisGlobales": {
                "presupuestoTotalLimite": limit_total, "totalFacturadoContrato": billed, "totalRecuperadoCopagos": recovered,
                "tasaRecuperacionPct": percentage(recovered, billed) or ZERO, "ejecucionGlobalPct": execution,
                "burnRateGlobal": round(execution / progress, 2), "proyeccionFacturacion30Dias": round(billed / days * 30, 0),
                "indicePresionInsumosGlobalPct": percentage(meds_total, service_total) or ZERO, "totalEpisodiosAtendidos": len(episodes),
            },
            "auditoriaCalidadDatos": {
                "totalServiciosAnalizados": len(all_services), "agrupadoresConCaracteresSucios": dirty_names,
                "serviciosConIdDuplicado": len(duplicate_services),
                "montoInfladoPorDuplicidad": sum((s["valorTotal"] for s in duplicate_services), ZERO),
                "serviciosFacturadosEnCero": len(zero_services),
                "lucroCesantePorServiciosEnCero": sum((s["cantidad"] * s["valorProducto"] for s in zero_services), ZERO),
                "gastoHuerfanoAgrupadorEventos": sum((g["totalFacturado"] for g in groups if g["idAgrupador"] == 1), ZERO),
            },
            "agrupadores": groups, "episodios": episodes, "paretoCostos": pareto_rows[:20],
            "resumenFinanciero": financial_summary(contract), "exposicion": exposure(contract, bed),
            "conciliacion": {
                "episodiosEvaluables": len(evaluated), "episodiosConciliados": len(evaluated) - len(differences),
                "episodiosConDiferencia": len(differences), "episodiosNoEvaluables": len(episodes) - len(evaluated),
                "porcentajeConciliadoPct": percentage(decimal(len(evaluated) - len(differences)), decimal(len(evaluated))),
                "montoAbsolutoSinExplicar": sum((abs(v) for v in differences), ZERO) if evaluated else None,
            },
            "conciliacionNiveles": hierarchy_reconciliation(contract),
            "referenciasTemporales": temporal_references(inicio, final, decimal(contract.get("totalFacturado"))),
            "concentracion": concentration(raw_values),
            "paretoUniverso": {
                "totalServicios": len(all_services), "valorTotal": service_total,
                "porcentajesDisponibles": service_total > 0 and all(v is not None and v >= 0 for v in raw_service_values),
                "restoTop10": service_total - sum((s["valorTotal"] for s in pareto_rows[:10]), ZERO),
            },
        }
        return json_numbers(report)

    async def get_patient_drilldown(self, inicio, final, centro_id, consecutivo_ingreso, id_contrato, revision):
        source, received_at = await self._fetch_source(inicio, final, centro_id)
        contract = self._select(source, id_contrato)
        bed = self._bed(source, id_contrato)
        if not hmac.compare_digest(self._revision(contract, inicio, final, bed), revision):
            raise StaleReportError("El corte cambió.")
        report = self._build_report(contract, inicio, final, bed, received_at)
        if not 1 <= consecutivo_ingreso <= len(report["episodios"]):
            raise NoDataError("Episodio no disponible.")
        raw_episodes = [e for g in legacy_rows(contract, "agrupadores") for e in legacy_rows(g, "iteracciones")]
        raw_episodes.sort(key=lambda e: legacy(e.get("totalFacturado")), reverse=True)
        services = self._services(legacy_rows(raw_episodes[consecutivo_ingreso - 1], "servicios"))
        return json_numbers({
            "inicio": inicio, "final": final, "centroId": centro_id, "idContrato": id_contrato, "revision": revision,
            "episodio": report["episodios"][consecutivo_ingreso - 1],
            "auditoriaEpisodio": {
                "serviciosDuplicados": sum(s["es_duplicado"] for s in services),
                "montoDuplicado": sum((s["valorTotal"] for s in services if s["es_duplicado"]), ZERO),
                "serviciosEnCero": sum(s["es_cero"] for s in services),
            }, "servicios": services,
        })

    async def simulate_exclusions(self, req):
        source, _ = await self._fetch_source(req.inicio, req.final, req.centroId)
        contract = self._select(source, req.idContrato)
        identifier = int(contract["idContrato"])
        bed = self._bed(source, identifier)
        revision = self._revision(contract, req.inicio, req.final, bed)
        if not hmac.compare_digest(revision, req.revision):
            raise StaleReportError("El corte cambió.")
        patterns = [p.strip() for p in req.insumosExcluidosManuales if p.strip()]
        if req.excluirTerapiaVAC:
            patterns.extend(["NPWT", "FOAM", "CANISTER", "VAC"])
        if req.excluirLaparoscopiaAvanzada:
            patterns.extend(["VERSAPORT", "ENDO SHEARS", "ENDO DISSECT", "HEMOLOK", "HEMOLOCK"])
        if req.excluirMallasSling:
            patterns.extend(["SLING", "MALLA"])
        pattern = re.compile("|".join(re.escape(p) for p in patterns), re.IGNORECASE) if patterns else None
        groups, top = [], {}
        for group in legacy_rows(contract, "agrupadores"):
            limit, billed = decimal(group.get("limite")), decimal(group.get("totalFacturado"))
            if billed is None:
                raise ScenarioNotCalculableError("Falta la facturación del agrupador.")
            entity, patient, gross = ZERO, ZERO, ZERO
            for episode in legacy_rows(group, "iteracciones"):
                for service in legacy_rows(episode, "servicios"):
                    if not (pattern and limit is not None and limit > 0 and group["id"] != 1
                            and str(service.get("codigo", "")).strip() == "MEDICAMENTOS"
                            and pattern.search(str(service.get("nombre", "")))):
                        continue
                    net = portion(service, "valorEntidad")
                    copay = portion(service, "valorPaciente")
                    total = decimal(service.get("valorTotal"))
                    quantity = decimal(service.get("cantidad"))
                    entity_unit, patient_unit = decimal(service.get("valorEntidad")), decimal(service.get("valorPaciente"))
                    if any(v is None or v < 0 for v in (quantity, entity_unit, patient_unit, net, copay, total)):
                        raise ScenarioNotCalculableError("Faltan importes válidos de los servicios seleccionados.")
                    if abs(total - net - copay) > TOLERANCE:
                        raise ScenarioNotCalculableError("El desglose del servicio no concilia.")
                    entity += net
                    patient += copay
                    gross += total
                    name = str(service.get("nombre", "")).strip()
                    top[name] = top.get(name, ZERO) + net
            if entity > billed:
                raise ScenarioNotCalculableError("El traslado supera la facturación del agrupador.")
            remaining = billed - entity
            original_pct, simulated_pct = percentage(billed, limit), percentage(remaining, limit)
            groups.append({
                "idAgrupador": group["id"], "nombre": str(group.get("nombre", "")).strip(), "limite": limit,
                "facturadoOriginal": billed, "montoExcluidoEvento": entity,
                "montoExcluidoPaciente": patient, "montoExcluidoBruto": gross,
                "facturadoSimuladoPGP": remaining, "ejecucionOriginalPct": original_pct, "ejecucionSimuladaPct": simulated_pct,
                "estadoOriginal": "SIN_TECHO" if original_pct is None else "DESBORDADO" if original_pct > 100 else "EN_RANGO",
                "estadoSimulado": "SIN_TECHO" if simulated_pct is None else "DESBORDADO" if simulated_pct > 100 else "EN_RANGO",
            })
        original = sum((g["facturadoOriginal"] for g in groups), ZERO)
        moved = sum((g["montoExcluidoEvento"] for g in groups), ZERO)
        return json_numbers({
            "inicio": req.inicio, "final": req.final, "centroId": req.centroId, "idContrato": identifier, "revision": revision,
            "totalFacturadoOriginal": original, "totalFacturadoSimuladoPGP": original - moved,
            "totalTrasladadoAEvento": moved,
            "totalTrasladadoPaciente": sum((g["montoExcluidoPaciente"] for g in groups), ZERO),
            "totalTrasladadoBruto": sum((g["montoExcluidoBruto"] for g in groups), ZERO),
            "alivioFinancieroPct": percentage(moved, original) or ZERO, "agrupadoresRecalculados": groups,
            "topInsumosTrasladados": [{"nombre": name, "valorTotal": total} for name, total in sorted(top.items(), key=lambda x: (-x[1], x[0]))[:10]],
        })
