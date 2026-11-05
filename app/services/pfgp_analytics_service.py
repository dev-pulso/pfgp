from datetime import datetime
import hashlib
import hmac
import json
import re
import secrets
import pandas as pd
import numpy as np
from typing import Dict, Any, List
from app.adapters.eklipse_client import EklipseClient

_REVISION_KEY = secrets.token_bytes(32)

class NoDataError(ValueError):
    pass


class MultipleContractsError(ValueError):
    pass


class StaleReportError(ValueError):
    pass


class PfgpAnalyticsService:
    def __init__(self, client: EklipseClient):
        self.client = client

    @staticmethod
    def _clean_records(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        return [
            {
                k: (None if (isinstance(v, float) and np.isnan(v)) else v)
                for k, v in record.items()
            }
            for record in records
        ]

    async def _fetch_contracts(self, inicio: str, final: str, centro_id: int) -> List[Dict[str, Any]]:
        raw_data = await self.client.fetch_data(inicio, final, centro_id)
        contrato_list = raw_data.get("facturado")
        if not isinstance(contrato_list, list):
            raise ValueError("Estructura de contratos incompatible.")
        identifiers = set()
        for contract in contrato_list:
            identifier = contract.get("idContrato") if isinstance(contract, dict) else None
            if isinstance(identifier, bool) or not str(identifier).isdigit():
                raise ValueError("Identificador de contrato inválido.")
            if int(identifier) in identifiers:
                raise MultipleContractsError("Identificador de contrato repetido en el origen.")
            identifiers.add(int(identifier))
        return contrato_list

    @staticmethod
    def _catalog(contracts: List[Dict[str, Any]], inicio: str, final: str, centro_id: int) -> Dict[str, Any]:
        rows = []
        for contract in contracts:
            groups = contract.get("agrupadores", [])
            limits = [group.get("limite") for group in groups]
            rows.append({
                "idContrato": int(contract["idContrato"]),
                "codigoContrato": str(contract.get("codigoContrato") or ""),
                "nombreContrato": str(contract.get("nombreContrato") or "").strip(),
                "totalFacturadoContrato": contract.get("totalFacturado"),
                "presupuestoTotalLimite": sum(float(v) for v in limits) if limits and all(v is not None for v in limits) else None,
                "totalRecuperado": contract.get("totalRecuperado"),
                "cantidadAgrupadores": len(groups),
            })
        return {"inicio": inicio, "final": final, "centroId": centro_id, "totalContratos": len(rows), "contratos": rows}

    async def list_contracts(self, inicio: str, final: str, centro_id: int) -> Dict[str, Any]:
        contracts = await self._fetch_contracts(inicio, final, centro_id)
        return self._catalog(contracts, inicio, final, centro_id)

    async def generate_contract_report(self, inicio: str, final: str, centro_id: int, id_contrato: int | None = None) -> Dict[str, Any]:
        contrato_list = await self._fetch_contracts(inicio, final, centro_id)

        if not contrato_list:
            raise NoDataError("Sin información para el rango indicado.")
        if id_contrato is not None:
            selected = [c for c in contrato_list if int(c["idContrato"]) == id_contrato]
            if not selected:
                raise NoDataError("Contrato no disponible en este rango.")
            contrato = selected[0]
        elif len(contrato_list) > 1:
            return self._catalog(contrato_list, inicio, final, centro_id)
        else:
            contrato = contrato_list[0]

        return self._build_report(contrato, inicio, final)

    @staticmethod
    def _revision(contrato: dict, inicio: str, final: str) -> str:
        snapshot = json.dumps([inicio, final, contrato], sort_keys=True, ensure_ascii=True, allow_nan=False)
        return hmac.new(_REVISION_KEY, snapshot.encode(), hashlib.sha256).hexdigest()

    def _build_report(self, contrato: dict, inicio: str, final: str) -> Dict[str, Any]:
        # 1. Cálculo de ventana de tiempo
        dt_inicio = datetime.strptime(inicio, "%Y-%m-%d")
        dt_final = datetime.strptime(final, "%Y-%m-%d")
        dias_corte = max(1, (dt_final - dt_inicio).days + 1)
        pct_tiempo_mes = (dias_corte / 30.0) * 100.0

        # 2. Desglose en listas para aplanar a DataFrames
        agrupadores_raw = []
        episodios_raw = []
        servicios_raw = []

        nombres_sucios_count = 0

        for agr in contrato.get("agrupadores", []):
            nom_original = agr.get("nombre", "")
            if "\r" in nom_original or "\n" in nom_original:
                nombres_sucios_count += 1

            nom_limpio = nom_original.strip()
            id_agr = agr.get("id")
            iteracciones = agr.get("iteracciones", [])

            agrupadores_raw.append({
                "idAgrupador": id_agr,
                "nombre": nom_limpio,
                "peso": float(agr.get("peso", 0.0)),
                "limitePresupuestal": float(agr.get("limite", 0.0)),
                "totalFacturado": float(agr.get("totalFacturado", 0.0)),
                "totalRecuperado": float(agr.get("totalRecuperado", 0.0)),
                "eventosContratados": float(agr.get("cantidadEventosContratados", 0.0)),
                "iteracionesReportadasAPI": int(agr.get("cantidadIteracciones", 0)),
                "iteracionesRealesJSON": len(iteracciones),
                "cmeContratado": agr.get("CMEContratado")
            })

            for pac in iteracciones:
                episode_key = len(episodios_raw) + 1
                consecutivo = pac.get("consecutivoIngreso")
                srvs = pac.get("servicios", [])

                episodios_raw.append({
                    "episodeKey": episode_key,
                    "consecutivoIngreso": consecutivo,
                    "paciente": "",  # Los nombres no entran al conjunto analítico público.
                    "idAgrupador": id_agr,
                    "agrupador": nom_limpio,
                    "fechaIngreso": "",  # Fecha individual suprimida en la vista ejecutiva.
                    "diasEstancia": int(pac.get("diasEstancia", 0)),
                    "totalFacturadoCabecera": float(pac.get("totalFacturado", 0.0)),
                    "totalRecuperado": float(pac.get("totalRecuperado", 0.0)),
                    "cmeContratado": pac.get("CMEContratado") or agr.get("CMEContratado"),
                })

                for srv in srvs:
                    servicios_raw.append({
                        "episodeKey": episode_key,
                        "consecutivoIngreso": consecutivo,
                        "agrupador": nom_limpio,
                        "idServicio": str(srv.get("id", "")),
                        "codigo": str(srv.get("codigo", "")).strip(),
                        "nombre": str(srv.get("nombre", "")).strip(),
                        "cantidad": float(srv.get("cantidad", 0.0)),
                        "valorProducto": float(srv.get("valorProducto", 0.0)),
                        "valorTotal": float(srv.get("valorTotal", 0.0))
                    })

        # 3. Creación de DataFrames en Pandas
        df_agr = pd.DataFrame(agrupadores_raw, columns=[
            "idAgrupador", "nombre", "peso", "limitePresupuestal", "totalFacturado",
            "totalRecuperado", "eventosContratados", "iteracionesReportadasAPI",
            "iteracionesRealesJSON", "cmeContratado",
        ]).astype({
            "limitePresupuestal": float, "totalFacturado": float,
            "eventosContratados": float, "iteracionesRealesJSON": int,
        })
        df_pac = pd.DataFrame(episodios_raw, columns=[
            "episodeKey", "consecutivoIngreso", "paciente", "idAgrupador", "agrupador", "fechaIngreso",
            "diasEstancia", "totalFacturadoCabecera", "totalRecuperado", "cmeContratado",
        ]).astype({"totalFacturadoCabecera": float, "cmeContratado": float, "diasEstancia": int})
        df_srv = pd.DataFrame(servicios_raw)

        if df_srv.empty:
            df_srv = pd.DataFrame(columns=[
                "episodeKey", "consecutivoIngreso", "agrupador", "idServicio", "codigo",
                "nombre", "cantidad", "valorProducto", "valorTotal"
            ])

        # 4. Auditoría Forense de Servicios con Pandas
        # A. Detección de duplicados exactos de servicio dentro del mismo ingreso
        duplicados_mask = df_srv.duplicated(subset=["episodeKey", "idServicio"], keep="first")
        total_duplicados = int(duplicados_mask.sum())
        monto_duplicados = float(df_srv.loc[duplicados_mask, "valorTotal"].sum()) if not df_srv.empty else 0.0

        # B. Detección de servicios en cero (Lucro cesante)
        servicios_cero_mask = (df_srv["valorTotal"] == 0) & (df_srv["valorProducto"] > 0)
        total_servicios_cero = int(servicios_cero_mask.sum())
        lucro_cesante = float((df_srv.loc[servicios_cero_mask, "cantidad"] * df_srv.loc[servicios_cero_mask, "valorProducto"]).sum()) if not df_srv.empty else 0.0

        # C. Métricas por Paciente / Episodio
        df_srv["es_medicamento"] = df_srv["codigo"] == "MEDICAMENTOS"
        if not df_srv.empty:
            resumen_pac_srv = df_srv.groupby("episodeKey").agg(
                sumaServiciosDetalle=("valorTotal", "sum"),
                gastoInsumos=("valorTotal", lambda x: x[df_srv.loc[x.index, "es_medicamento"]].sum())
            ).reset_index()
            df_pac = df_pac.merge(resumen_pac_srv, on="episodeKey", how="left")
        else:
            df_pac["sumaServiciosDetalle"] = 0.0
            df_pac["gastoInsumos"] = 0.0

        df_pac["sumaServiciosDetalle"] = df_pac["sumaServiciosDetalle"].fillna(0.0)
        df_pac["gastoInsumos"] = df_pac["gastoInsumos"].fillna(0.0)

        # Detección de duplicados agrupados por paciente
        if not df_srv.empty and duplicados_mask.any():
            df_srv_dups = df_srv[duplicados_mask].groupby("episodeKey")["valorTotal"].sum().reset_index()
            df_srv_dups = df_srv_dups.rename(columns={"valorTotal": "montoDuplicadoDetectado"})
            df_pac = df_pac.merge(df_srv_dups, on="episodeKey", how="left")
        else:
            df_pac["montoDuplicadoDetectado"] = 0.0

        df_pac["montoDuplicadoDetectado"] = df_pac["montoDuplicadoDetectado"].fillna(0.0)
        df_pac["discrepanciaIntegridad"] = df_pac["sumaServiciosDetalle"] - df_pac["totalFacturadoCabecera"]

        # Severidad vs CME y Presión de insumos
        df_pac["ratioSeveridadCME"] = np.where(
            df_pac["cmeContratado"].notnull() & (df_pac["cmeContratado"] > 0),
            (df_pac["totalFacturadoCabecera"] / df_pac["cmeContratado"]).round(2),
            None
        )
        df_pac["costoDiarioEstancia"] = np.where(
            df_pac["diasEstancia"] > 0,
            (df_pac["totalFacturadoCabecera"] / df_pac["diasEstancia"]).round(0),
            df_pac["totalFacturadoCabecera"]
        )
        df_pac["indicePresionInsumosPct"] = np.where(
            df_pac["sumaServiciosDetalle"] > 0,
            ((df_pac["gastoInsumos"] / df_pac["sumaServiciosDetalle"]) * 100.0).round(2),
            0.0
        )

        # 5. Métricas por Agrupador
        df_agr["porcentajeEjecutado"] = np.where(
            df_agr["limitePresupuestal"] > 0,
            ((df_agr["totalFacturado"] / df_agr["limitePresupuestal"]) * 100.0).round(2),
            0.0
        )
        df_agr["burnRateRatio"] = np.where(
            df_agr["limitePresupuestal"] > 0,
            (df_agr["porcentajeEjecutado"] / pct_tiempo_mes).round(2),
            None
        )
        df_agr["proyeccionCierre30Dias"] = ((df_agr["totalFacturado"] / dias_corte) * 30.0).round(0)
        df_agr["deficitProyectado"] = np.where(
            df_agr["limitePresupuestal"] > 0,
            (df_agr["limitePresupuestal"] - df_agr["proyeccionCierre30Dias"]).round(0),
            None
        )
        df_agr["discrepanciaConteoEventos"] = df_agr["iteracionesReportadasAPI"] - df_agr["iteracionesRealesJSON"]
        df_agr["cumplimientoFrecuenciaPct"] = np.where(
            df_agr["eventosContratados"] > 0,
            ((df_agr["iteracionesRealesJSON"] / df_agr["eventosContratados"]) * 100.0).round(2),
            None
        )
        df_agr["cmeRealPromedio"] = np.where(
            df_agr["iteracionesRealesJSON"] > 0,
            (df_agr["totalFacturado"] / df_agr["iteracionesRealesJSON"]).round(0),
            0.0
        )

        def clasificar_alerta(row):
            if row["limitePresupuestal"] == 0:
                return "HUERFANO_SIN_TECHO"
            if row["porcentajeEjecutado"] > 100.0:
                return "DESBORDADO_CRITICO"
            burn = row["burnRateRatio"]
            if burn is not None and not (isinstance(burn, float) and np.isnan(burn)) and burn > 1.0:
                return "RIESGO_SOBRECOSTO"
            return "CONTROLADO"

        df_agr["estadoAlerta"] = df_agr.apply(clasificar_alerta, axis=1) if not df_agr.empty else pd.Series(dtype=str)

        # 6. Pareto de Costos (Top 20 servicios/medicamentos)
        if not df_srv.empty:
            df_srv["tipo"] = np.where(df_srv["codigo"] == "MEDICAMENTOS", "INSUMO/MEDICAMENTO", "PROCEDIMIENTO/CUPS")
            pareto_df = df_srv.groupby(["nombre", "tipo"]).agg(
                cantidad=("cantidad", "sum"),
                valorTotal=("valorTotal", "sum")
            ).reset_index().sort_values(by="valorTotal", ascending=False).head(20)
        else:
            pareto_df = pd.DataFrame(columns=["nombre", "tipo", "cantidad", "valorTotal"])

        # 7. Acumulados Globales
        limite_total_contrato = float(df_agr["limitePresupuestal"].sum()) if not df_agr.empty else 0.0
        total_facturado_contrato = float(contrato.get("totalFacturado", 0.0))
        total_recuperado_contrato = float(contrato.get("totalRecuperado", 0.0))
        gasto_total_meds = float(df_srv[df_srv["es_medicamento"]]["valorTotal"].sum()) if not df_srv.empty else 0.0
        gasto_total_general = float(df_srv["valorTotal"].sum()) if not df_srv.empty else 0.0

        gasto_huerfano = float(df_agr[df_agr["idAgrupador"] == 1]["totalFacturado"].sum()) if (not df_agr.empty and 1 in df_agr["idAgrupador"].values) else 0.0

        agrupadores_cols = [
            "idAgrupador", "nombre", "peso", "limitePresupuestal", "totalFacturado",
            "totalRecuperado", "porcentajeEjecutado", "burnRateRatio", "proyeccionCierre30Dias",
            "deficitProyectado", "eventosContratados", "iteracionesReportadasAPI",
            "iteracionesRealesJSON", "discrepanciaConteoEventos", "cumplimientoFrecuenciaPct",
            "cmeContratado", "cmeRealPromedio", "estadoAlerta"
        ]

        episodios_cols = [
            "consecutivoIngreso", "paciente", "agrupador", "fechaIngreso", "diasEstancia",
            "totalFacturadoCabecera", "sumaServiciosDetalle", "discrepanciaIntegridad",
            "montoDuplicadoDetectado", "cmeContratado", "ratioSeveridadCME",
            "costoDiarioEstancia", "gastoInsumos", "indicePresionInsumosPct"
        ]

        df_agr_records = self._clean_records(df_agr[agrupadores_cols].to_dict(orient="records"))
        df_pac_records = self._clean_records(
            df_pac.sort_values(by="totalFacturadoCabecera", ascending=False, kind="stable")[episodios_cols].to_dict(orient="records")
        )
        # Alias efímero por respuesta: no permite vincular al ingreso del origen.
        # Mantiene los nombres de campos por compatibilidad, cambiando su semántica.
        for ordinal, episodio in enumerate(df_pac_records, start=1):
            episodio["consecutivoIngreso"] = ordinal
            episodio["paciente"] = f"Episodio {ordinal:04d}"
            episodio["fechaIngreso"] = ""
        pareto_records = self._clean_records(pareto_df.to_dict(orient="records"))

        return {
            "metadata": {
                "idContrato": int(contrato.get("idContrato")),
                "codigoContrato": str(contrato.get("codigoContrato")),
                "nombreContrato": str(contrato.get("nombreContrato", "")).strip(),
                "fechaInicio": inicio,
                "fechaFinal": final,
                "diasCorteAnalizados": dias_corte,
                "avanceTemporalMesPct": round(pct_tiempo_mes, 2),
                "revision": self._revision(contrato, inicio, final)
            },
            "kpisGlobales": {
                "presupuestoTotalLimite": limite_total_contrato,
                "totalFacturadoContrato": total_facturado_contrato,
                "totalRecuperadoCopagos": total_recuperado_contrato,
                "tasaRecuperacionPct": round((total_recuperado_contrato / total_facturado_contrato * 100.0), 2) if total_facturado_contrato > 0 else 0.0,
                "ejecucionGlobalPct": round((total_facturado_contrato / limite_total_contrato * 100.0), 2) if limite_total_contrato > 0 else 0.0,
                "burnRateGlobal": round(((total_facturado_contrato / limite_total_contrato * 100.0) / pct_tiempo_mes), 2) if limite_total_contrato > 0 else 0.0,
                "proyeccionFacturacion30Dias": round((total_facturado_contrato / dias_corte) * 30.0, 0),
                "indicePresionInsumosGlobalPct": round((gasto_total_meds / gasto_total_general * 100.0), 2) if gasto_total_general > 0 else 0.0,
                "totalEpisodiosAtendidos": len(df_pac)
            },
            "auditoriaCalidadDatos": {
                "totalServiciosAnalizados": len(df_srv),
                "agrupadoresConCaracteresSucios": nombres_sucios_count,
                "serviciosConIdDuplicado": total_duplicados,
                "montoInfladoPorDuplicidad": monto_duplicados,
                "serviciosFacturadosEnCero": total_servicios_cero,
                "lucroCesantePorServiciosEnCero": lucro_cesante,
                "gastoHuerfanoAgrupadorEventos": gasto_huerfano
            },
            "agrupadores": df_agr_records,
            "episodios": df_pac_records,
            "paretoCostos": pareto_records
        }
    async def get_patient_drilldown(
        self, inicio: str, final: str, centro_id: int,
        consecutivo_ingreso: int, id_contrato: int, revision: str,
    ) -> dict:
        contracts = await self._fetch_contracts(inicio, final, centro_id)
        selected = [c for c in contracts if int(c["idContrato"]) == id_contrato]
        if not selected:
            raise NoDataError("Contrato no disponible.")
        contract = selected[0]
        if not hmac.compare_digest(self._revision(contract, inicio, final), revision):
            raise StaleReportError("El corte cambió. Actualiza el informe antes de abrir el detalle.")

        report = self._build_report(contract, inicio, final)
        if not 1 <= consecutivo_ingreso <= len(report["episodios"]):
            raise NoDataError("Episodio no disponible.")
        # El ordinal usa exactamente el mismo orden estable que el informe público.
        raw_episodes = [pac for agr in contract.get("agrupadores", []) for pac in agr.get("iteracciones", [])]
        raw_episodes.sort(key=lambda pac: float(pac.get("totalFacturado", 0.0)), reverse=True)
        raw_episode = raw_episodes[consecutivo_ingreso - 1]
        services = []
        seen = set()
        for service in raw_episode.get("servicios", []):
            identifier = str(service.get("id", ""))
            code = str(service.get("codigo", "")).strip()
            total = float(service.get("valorTotal", 0.0))
            price = float(service.get("valorProducto", 0.0))
            services.append({
                "id": identifier,
                "codigo": code,
                "nombre": str(service.get("nombre", "")).strip(),
                "tipo": "INSUMO/MEDICAMENTO" if code == "MEDICAMENTOS" else "PROCEDIMIENTO/CUPS",
                "cantidad": float(service.get("cantidad", 0.0)),
                "valorProducto": price,
                "valorTotal": total,
                "es_duplicado": identifier in seen,
                "es_cero": total == 0 and price > 0,
            })
            seen.add(identifier)
        return {
            "inicio": inicio, "final": final, "centroId": centro_id,
            "idContrato": id_contrato, "revision": revision,
            "episodio": report["episodios"][consecutivo_ingreso - 1],
            "auditoriaEpisodio": {
                "serviciosDuplicados": sum(s["es_duplicado"] for s in services),
                "montoDuplicado": sum(s["valorTotal"] for s in services if s["es_duplicado"]),
                "serviciosEnCero": sum(s["es_cero"] for s in services),
            },
            "servicios": services,
        }

    async def simulate_exclusions(self, req: "SimulacionRequest") -> dict:
        contracts = await self._fetch_contracts(req.inicio, req.final, req.centroId)
        if req.idContrato is not None:
            contracts = [c for c in contracts if int(c["idContrato"]) == req.idContrato]
        if not contracts:
            raise NoDataError("Contrato no disponible en este rango.")
        if len(contracts) > 1:
            raise MultipleContractsError("Selecciona un contrato para simular las exclusiones.")
        contrato = contracts[0]

        # 1. Aplanar agrupadores y servicios
        agrupadores_list = []
        servicios_list = []

        for agr in contrato.get("agrupadores", []):
            id_agr = agr.get("id")
            nom_agr = agr.get("nombre", "").strip()
            limite = float(agr.get("limite", 0.0))
            facturado = float(agr.get("totalFacturado", 0.0))

            agrupadores_list.append({
                "idAgrupador": id_agr,
                "nombre": nom_agr,
                "limite": limite,
                "facturadoOriginal": facturado
            })

            for pac in agr.get("iteracciones", []):
                for srv in pac.get("servicios", []):
                    servicios_list.append({
                        "idAgrupador": id_agr,
                        "codigo": str(srv.get("codigo", "")).strip(),
                        "nombre": str(srv.get("nombre", "")).strip(),
                        "valorTotal": float(srv.get("valorTotal", 0.0))
                    })

        df_agr = pd.DataFrame(agrupadores_list, columns=[
            "idAgrupador", "nombre", "limite", "facturadoOriginal"
        ]).astype({"limite": float, "facturadoOriginal": float})
        df_srv = pd.DataFrame(servicios_list, columns=[
            "idAgrupador", "codigo", "nombre", "valorTotal"
        ]).astype({"valorTotal": float})

        # 2. Construir reglas de exclusión
        patrones_excluir = [p.strip() for p in req.insumosExcluidosManuales if p.strip()]
        if req.excluirTerapiaVAC:
            patrones_excluir.extend(["NPWT", "FOAM", "CANISTER", "VAC"])
        if req.excluirLaparoscopiaAvanzada:
            patrones_excluir.extend(["VERSAPORT", "ENDO SHEARS", "ENDO DISSECT", "HEMOLOK", "HEMOLOCK"])
        if req.excluirMallasSling:
            patrones_excluir.extend(["SLING", "MALLA"])

        if not patrones_excluir or df_srv.empty:
            df_srv["excluido"] = False
        else:
            # Búsqueda insensible a mayúsculas
            regex_pattern = "|".join([re.escape(p) for p in patrones_excluir if p.strip()])
            pgp_ids = df_agr.loc[(df_agr["limite"] > 0) & (df_agr["idAgrupador"] != 1), "idAgrupador"]
            df_srv["excluido"] = df_srv["idAgrupador"].isin(pgp_ids) & (df_srv["codigo"] == "MEDICAMENTOS") & (
                df_srv["nombre"].str.contains(regex_pattern, case=False, na=False)
            )

        # 3. Calcular montos excluidos por agrupador
        monto_excluido_agr = df_srv[df_srv["excluido"]].groupby("idAgrupador")["valorTotal"].sum().reset_index()
        monto_excluido_agr.rename(columns={"valorTotal": "montoExcluidoEvento"}, inplace=True)

        df_sim = df_agr.merge(monto_excluido_agr, on="idAgrupador", how="left")
        df_sim["montoExcluidoEvento"] = df_sim["montoExcluidoEvento"].fillna(0.0)
        df_sim["facturadoSimuladoPGP"] = (df_sim["facturadoOriginal"] - df_sim["montoExcluidoEvento"]).clip(lower=0.0)

        # Recalcular porcentajes de ejecución
        df_sim["ejecucionOriginalPct"] = np.where(
            df_sim["limite"] > 0,
            ((df_sim["facturadoOriginal"] / df_sim["limite"]) * 100.0).round(2),
            0.0
        )
        df_sim["ejecucionSimuladaPct"] = np.where(
            df_sim["limite"] > 0,
            ((df_sim["facturadoSimuladoPGP"] / df_sim["limite"]) * 100.0).round(2),
            0.0
        )

        df_sim["estadoOriginal"] = np.where(df_sim["ejecucionOriginalPct"] > 100, "DESBORDADO", "EN_RANGO")
        df_sim["estadoSimulado"] = np.where(df_sim["ejecucionSimuladaPct"] > 100, "DESBORDADO", "EN_RANGO")

        # 4. Top insumos trasladados a Evento
        top_excluidos = (
            df_srv[df_srv["excluido"]]
            .groupby("nombre")["valorTotal"]
            .sum()
            .reset_index()
            .sort_values(by="valorTotal", ascending=False)
            .head(10)
        )

        tot_orig = float(df_sim["facturadoOriginal"].sum())
        tot_sim = float(df_sim["facturadoSimuladoPGP"].sum())
        tot_evento = float(df_sim["montoExcluidoEvento"].sum())

        return {
            "totalFacturadoOriginal": tot_orig,
            "totalFacturadoSimuladoPGP": tot_sim,
            "totalTrasladadoAEvento": tot_evento,
            "alivioFinancieroPct": round((tot_evento / tot_orig * 100.0), 2) if tot_orig > 0 else 0.0,
            "agrupadoresRecalculados": df_sim.to_dict(orient="records"),
            "topInsumosTrasladados": top_excluidos.to_dict(orient="records")
        }
