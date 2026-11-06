"""Datos sintéticos; ninguna prueba consulta Eklipse ni archivos clínicos."""
from copy import deepcopy
import httpx
import pytest
from fastapi.testclient import TestClient
from app.main import app, get_analytics_service
from app.adapters.eklipse_client import EklipseClient
from app.services.pfgp_analytics_service import PfgpAnalyticsService
from app.schemas.pfgp_schemas import AnalyticsReportResponse
from app.config import settings
from pydantic import SecretStr

URL = "/api/v1/pfgp-analytics/dashboard?inicio=2026-10-01&final=2026-10-20&centroId=99"


def source():
    return {"facturado": [{
        "idContrato": 10, "codigoContrato": "PRUEBA-10", "nombreContrato": "Contrato sintético",
        "totalFacturado": 200, "totalRecuperado": 0, "totalContratado": 600,
        "agrupadores": [{
            "id": 2, "nombre": "Hospitalización\r\n", "peso": 1, "limite": 300,
            "totalFacturado": 200, "totalRecuperado": 0, "cantidadEventosContratados": 2,
            "cantidadIteracciones": 2, "CMEContratado": 150,
            "iteracciones": [{
                "consecutivoIngreso": 87654321, "nombreCompletoPaciente": "NOMBRE_SINTETICO_PRIVADO",
                "fechaIngreso": "2026-10-07T12:34:56", "diasEstancia": 4, "totalFacturado": 200, "totalRecuperado": 0,
                "servicios": [
                    {"id": 31, "codigo": "MEDICAMENTOS", "nombre": "Producto de prueba", "cantidad": 1, "valorProducto": 100, "valorTotal": 100, "valorEntidad": 100, "valorPaciente": 0},
                    {"id": 31, "codigo": "MEDICAMENTOS", "nombre": "Producto de prueba", "cantidad": 1, "valorProducto": 100, "valorTotal": 100, "valorEntidad": 100, "valorPaciente": 0},
                    {"id": 32, "codigo": "OTRO", "nombre": "Servicio de prueba", "cantidad": 2, "valorProducto": 50, "valorTotal": 0, "valorEntidad": 0, "valorPaciente": 0},
                ],
            }],
        }],
    }]}


class FakeClient:
    def __init__(self, data): self.data = data
    async def fetch_data(self, inicio, final, centro_id):
        assert centro_id == 99
        return deepcopy(self.data)


@pytest.fixture(autouse=True)
def isolated(monkeypatch):
    monkeypatch.setattr(settings, "EKLIPSE_TOKEN", SecretStr("TOKEN_SINTETICO"))
    async def block(*args, **kwargs):
        raise AssertionError("Red prohibida en pruebas")
    monkeypatch.setattr(httpx.AsyncClient, "get", block)
    app.dependency_overrides[get_analytics_service] = lambda: PfgpAnalyticsService(FakeClient(source()))
    yield
    app.dependency_overrides.clear()


def test_health():
    assert TestClient(app).get("/health").json()["status"] == "ok"


def test_contract_and_metrics():
    response = TestClient(app).get(URL)
    assert response.status_code == 200
    report = AnalyticsReportResponse(**response.json())
    assert report.metadata.diasCorteAnalizados == 20
    assert report.metadata.avanceTemporalMesPct == 66.67
    assert report.kpisGlobales.burnRateGlobal == 1
    assert report.auditoriaCalidadDatos.serviciosConIdDuplicado == 1
    assert report.auditoriaCalidadDatos.montoInfladoPorDuplicidad == 100
    assert report.auditoriaCalidadDatos.lucroCesantePorServiciosEnCero == 100
    assert report.agrupadores[0].discrepanciaConteoEventos == 1
    assert report.episodios[0].sumaServiciosDetalle == 200


def test_identity_removed_before_browser_and_no_store():
    response = TestClient(app).get(URL)
    assert response.status_code == 200
    assert response.headers["x-pfgp-privacy"] == "aliases-v1"
    assert response.headers["cache-control"] == "no-store"
    assert "NOMBRE_SINTETICO_PRIVADO" not in response.text
    assert "87654321" not in response.text
    assert "2026-10-07" not in response.text
    episode = response.json()["episodios"][0]
    assert episode["paciente"] == "Episodio 0001"
    assert episode["consecutivoIngreso"] == 1
    assert episode["fechaIngreso"] == ""


@pytest.mark.parametrize("query", [
    "inicio=invalid&final=2026-10-20&centroId=99",
    "inicio=2026-02-30&final=2026-03-01&centroId=99",
    "inicio=2026-10-20&final=2026-10-01&centroId=99",
    "inicio=2026-10-01&final=2026-10-20&centroId=98", "",
])
def test_invalid_query(query):
    assert TestClient(app).get(URL.split("?")[0] + "?" + query).status_code == 422


@pytest.mark.parametrize("mode,expected", [("empty", 404), ("duplicate", 409), ("malformed", 502)])
def test_source_states(mode, expected):
    data = {"facturado": []} if mode == "empty" else source()
    if mode == "duplicate": data["facturado"] *= 2
    if mode == "malformed": data["facturado"][0]["idContrato"] = "invalid"
    app.dependency_overrides[get_analytics_service] = lambda: PfgpAnalyticsService(FakeClient(data))
    assert TestClient(app).get(URL).status_code == expected


@pytest.mark.parametrize("empty", ["agrupadores", "iteracciones", "servicios"])
def test_empty_details_do_not_crash(empty):
    data = source()
    contract = data["facturado"][0]
    if empty == "agrupadores": contract["agrupadores"] = []
    elif empty == "iteracciones": contract["agrupadores"][0]["iteracciones"] = []
    else: contract["agrupadores"][0]["iteracciones"][0]["servicios"] = []
    app.dependency_overrides[get_analytics_service] = lambda: PfgpAnalyticsService(FakeClient(data))
    assert TestClient(app).get(URL).status_code == 200


def test_errors_are_generic_and_no_fallback(caplog):
    app.dependency_overrides[get_analytics_service] = lambda: PfgpAnalyticsService(EklipseClient())
    response = TestClient(app).get(URL)
    assert response.status_code == 502
    assert "Red prohibida" not in response.text
    assert "eklipse.grupoclinicamedicos.com" not in response.text
    assert not caplog.records


def test_cors_local_only():
    client = TestClient(app)
    local = client.get(URL, headers={"Origin": "http://localhost:5173"})
    assert local.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "X-PFGP-Privacy" in local.headers["access-control-expose-headers"]
    foreign = client.get(URL, headers={"Origin": "https://example.org"})
    assert "access-control-allow-origin" not in foreign.headers


def test_token_missing_is_safe(monkeypatch):
    monkeypatch.setattr(settings, "EKLIPSE_TOKEN", None)
    app.dependency_overrides[get_analytics_service] = lambda: PfgpAnalyticsService(EklipseClient())
    response = TestClient(app).get(URL)
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "SOURCE_AUTH_REQUIRED"


@pytest.mark.parametrize("status", [200, 401, 403])
def test_bearer_header_and_rejected_token(monkeypatch, status):
    async def fake_get(client, url, params):
        assert client.headers["authorization"] == "Bearer TOKEN_SINTETICO"
        assert params == {"inicio": "2026-10-01", "final": "2026-10-20", "centroId": 99}
        return httpx.Response(status, json=source(), request=httpx.Request("GET", "https://test.invalid"))
    monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)
    app.dependency_overrides[get_analytics_service] = lambda: PfgpAnalyticsService(EklipseClient())
    response = TestClient(app).get(URL)
    assert response.status_code == (200 if status == 200 else 503)
    assert "TOKEN_SINTETICO" not in response.text


def multiple_source(size=2):
    data = source()
    first = data["facturado"][0]
    data["facturado"] = [deepcopy(first) for _ in range(size)]
    for index, contract in enumerate(data["facturado"]):
        contract["idContrato"] = 10 + index
        contract["codigoContrato"] = f"PRUEBA-{10 + index}"
        contract["totalFacturado"] = 200 + index * 500
    return data


def install_source(data):
    fake = FakeClient(data)
    app.dependency_overrides[get_analytics_service] = lambda: PfgpAnalyticsService(fake)


@pytest.mark.parametrize("endpoint", ["dashboard", "contratos"])
def test_all_contracts_are_listed_without_patient_detail(endpoint):
    install_source(multiple_source(19))
    response = TestClient(app).get(URL.replace("dashboard", endpoint))
    assert response.status_code == 200
    result = response.json()
    assert result["totalContratos"] == 19
    assert len(result["contratos"]) == 19
    assert [c["idContrato"] for c in result["contratos"]] == list(range(10, 29))
    for marker in ("NOMBRE_SINTETICO_PRIVADO", "87654321", "2026-10-07", '"episodios"', '"paciente"'):
        assert marker not in response.text
    assert response.headers["x-pfgp-privacy"] == "aliases-v1"


def test_explicit_selection_does_not_mix_identical_episode_or_service_ids():
    data = multiple_source()
    second = data["facturado"][1]
    second["agrupadores"][0]["totalFacturado"] = 700
    second["agrupadores"][0]["iteracciones"][0]["servicios"][0]["valorTotal"] = 333
    install_source(data)
    result = TestClient(app).get(URL + "&idContrato=11").json()
    assert result["metadata"]["idContrato"] == 11
    assert result["kpisGlobales"]["totalFacturadoContrato"] == 700
    assert result["agrupadores"][0]["totalFacturado"] == 700
    assert result["episodios"][0]["sumaServiciosDetalle"] == 433
    assert len(result["episodios"]) == 1
    first = TestClient(app).get(URL + "&idContrato=10").json()
    assert first["episodios"][0]["sumaServiciosDetalle"] == 200
    assert first["kpisGlobales"]["totalFacturadoContrato"] == 200


@pytest.mark.parametrize("identifier,status", [(999, 404), (0, 422), (-1, 422)])
def test_unknown_or_invalid_contract(identifier, status):
    install_source(multiple_source())
    assert TestClient(app).get(URL + f"&idContrato={identifier}").status_code == status


def test_empty_catalog_is_an_empty_list():
    install_source({"facturado": []})
    response = TestClient(app).get(URL.replace("dashboard", "contratos"))
    assert response.status_code == 200
    assert response.json()["contratos"] == []
    assert response.json()["totalContratos"] == 0


def test_catalog_preserves_unknown_amounts_and_zero():
    data = multiple_source()
    del data["facturado"][0]["totalFacturado"]
    del data["facturado"][0]["agrupadores"][0]["limite"]
    data["facturado"][1]["totalFacturado"] = 0
    install_source(data)
    result = TestClient(app).get(URL.replace("dashboard", "contratos")).json()["contratos"]
    assert result[0]["totalFacturadoContrato"] is None
    assert result[0]["presupuestoTotalLimite"] is None
    assert result[1]["totalFacturadoContrato"] == 0


def test_duplicate_catalog_ids_rejected():
    data = source()
    data["facturado"] *= 2
    install_source(data)
    assert TestClient(app).get(URL.replace("dashboard", "contratos")).status_code == 409


SIMULATION_URL = "/api/v1/pfgp-analytics/simulador-exclusiones"
SIMULATION_REQUEST = {"inicio": "2026-10-01", "final": "2026-10-20", "centroId": 99, "idContrato": 11, "revision": "0" * 64}


def test_simulation_uses_selected_contract_and_only_transfers_pgp_supplies():
    data = multiple_source()
    group = data["facturado"][1]["agrupadores"][0]
    group["totalFacturado"] = 700
    group["iteracciones"][0]["servicios"][0].update(nombre="Foam VAC", valorTotal=100)
    group["iteracciones"][0]["servicios"][1].update(nombre="Malla sling", valorTotal=50, valorEntidad=50)
    events = deepcopy(group)
    events.update(id=1, nombre="EVENTOS", limite=0, totalFacturado=500)
    data["facturado"][1]["agrupadores"].append(events)
    install_source(data)
    client = TestClient(app)
    request = {**SIMULATION_REQUEST, **drilldown_params(client, 11)}
    result = client.post(SIMULATION_URL, json={**request, "excluirTerapiaVAC": True, "excluirMallasSling": True})
    assert result.status_code == 200
    report = result.json()
    assert report["totalFacturadoOriginal"] == 1200
    assert report["totalTrasladadoAEvento"] == 150
    assert report["totalFacturadoSimuladoPGP"] == 1050
    assert report["alivioFinancieroPct"] == 12.5
    assert report["agrupadoresRecalculados"][0]["ejecucionSimuladaPct"] == 183.33
    assert report["agrupadoresRecalculados"][1]["montoExcluidoEvento"] == 0
    assert result.headers["x-pfgp-privacy"] == "aliases-v1"
    assert result.headers["cache-control"] == "no-store"
    assert "NOMBRE_SINTETICO_PRIVADO" not in result.text
    original = client.post(SIMULATION_URL, json=request).json()
    assert original["totalTrasladadoAEvento"] == 0


@pytest.mark.parametrize("empty", ["agrupadores", "iteracciones", "servicios"])
def test_simulation_handles_empty_details(empty):
    data = source()
    group = data["facturado"][0]["agrupadores"][0]
    if empty == "agrupadores": data["facturado"][0]["agrupadores"] = []
    elif empty == "iteracciones": group["iteracciones"] = []
    else: group["iteracciones"][0]["servicios"] = []
    install_source(data)
    client = TestClient(app)
    response = client.post(SIMULATION_URL, json={**SIMULATION_REQUEST, **drilldown_params(client), "excluirTerapiaVAC": True})
    assert response.status_code == 200
    assert response.json()["totalTrasladadoAEvento"] == 0


@pytest.mark.parametrize("changes", [
    {"inicio": "2026-02-30"}, {"inicio": "2026-11-01"}, {"centroId": 98}, {"idContrato": 0},
])
def test_simulation_validates_filters(changes):
    assert TestClient(app).post(SIMULATION_URL, json={**SIMULATION_REQUEST, **changes}).status_code == 422


def test_simulation_source_errors_and_missing_selection():
    install_source(multiple_source())
    client = TestClient(app)
    assert client.post(SIMULATION_URL, json={**SIMULATION_REQUEST, "idContrato": None}).status_code == 409
    assert client.post(SIMULATION_URL, json={**SIMULATION_REQUEST, "idContrato": 999}).status_code == 404
    install_source({"facturado": []})
    assert client.post(SIMULATION_URL, json=SIMULATION_REQUEST).status_code == 404
    app.dependency_overrides[get_analytics_service] = lambda: PfgpAnalyticsService(EklipseClient())
    result = client.post(SIMULATION_URL, json=SIMULATION_REQUEST)
    assert result.status_code == 502
    assert "Red prohibida" not in result.text


def test_simulation_cors_preflight():
    response = TestClient(app).options(SIMULATION_URL, headers={
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
    })
    assert response.status_code == 200
    assert "POST" in response.headers["access-control-allow-methods"]


def drilldown_params(client, contract=10):
    report = client.get(URL + f"&idContrato={contract}")
    assert report.status_code == 200
    return {
        "inicio": "2026-10-01", "final": "2026-10-20", "centroId": 99,
        "idContrato": contract, "revision": report.json()["metadata"]["revision"],
    }


def test_drilldown_services_audit_and_private_alias():
    client = TestClient(app)
    response = client.get("/api/v1/pfgp-analytics/episodio/1", params=drilldown_params(client))
    assert response.status_code == 200
    detail = response.json()
    assert detail["episodio"]["paciente"] == "Episodio 0001"
    assert detail["episodio"]["sumaServiciosDetalle"] == 200
    assert detail["auditoriaEpisodio"] == {"serviciosDuplicados": 1, "montoDuplicado": 100, "serviciosEnCero": 1}
    assert [s["es_duplicado"] for s in detail["servicios"]] == [False, True, False]
    assert [s["es_cero"] for s in detail["servicios"]] == [False, False, True]
    assert detail["servicios"][0]["tipo"] == "INSUMO/MEDICAMENTO"
    assert detail["servicios"][2]["tipo"] == "PROCEDIMIENTO/CUPS"
    assert response.headers["x-pfgp-privacy"] == "aliases-v1"
    assert response.headers["cache-control"] == "no-store"
    for value in ("NOMBRE_SINTETICO_PRIVADO", "87654321", "2026-10-07"):
        assert value not in response.text


def test_drilldown_matches_sorted_alias_and_keeps_repeated_admissions_separate():
    data = multiple_source()
    group = data["facturado"][1]["agrupadores"][0]
    second = deepcopy(group)
    second.update(id=3, nombre="Cirugía")
    second["iteracciones"][0]["totalFacturado"] = 500
    second["iteracciones"][0]["servicios"] = [{
        "id": 31, "codigo": "CUPS", "nombre": "Servicio exclusivo del episodio",
        "cantidad": 1, "valorProducto": 500, "valorTotal": 500,
    }]
    data["facturado"][1]["agrupadores"].append(second)
    install_source(data)
    client = TestClient(app)
    params = drilldown_params(client, 11)
    first = client.get("/api/v1/pfgp-analytics/episodio/1", params=params).json()
    next_episode = client.get("/api/v1/pfgp-analytics/episodio/2", params=params).json()
    assert first["idContrato"] == 11
    assert first["episodio"]["agrupador"] == "Cirugía"
    assert first["episodio"]["sumaServiciosDetalle"] == 500
    assert first["auditoriaEpisodio"]["serviciosDuplicados"] == 0
    assert len(first["servicios"]) == 1
    assert next_episode["episodio"]["agrupador"] == "Hospitalización"
    assert next_episode["episodio"]["sumaServiciosDetalle"] == 200
    assert next_episode["auditoriaEpisodio"]["serviciosDuplicados"] == 1
    # El ingreso real no puede utilizarse como ordinal del informe.
    assert client.get("/api/v1/pfgp-analytics/episodio/87654321", params=params).status_code == 404


def test_drilldown_empty_services_and_missing_episode():
    data = source()
    data["facturado"][0]["agrupadores"][0]["iteracciones"][0]["servicios"] = []
    install_source(data)
    client = TestClient(app)
    params = drilldown_params(client)
    detail = client.get("/api/v1/pfgp-analytics/episodio/1", params=params)
    assert detail.status_code == 200
    assert detail.json()["servicios"] == []
    assert detail.json()["auditoriaEpisodio"]["serviciosDuplicados"] == 0
    assert client.get("/api/v1/pfgp-analytics/episodio/2", params=params).status_code == 404


def test_drilldown_rejects_changed_snapshot_and_does_not_leak_errors(monkeypatch):
    client = TestClient(app)
    params = drilldown_params(client)
    data = source()
    data["facturado"][0]["agrupadores"][0]["iteracciones"][0]["totalFacturado"] = 250
    install_source(data)
    assert client.get("/api/v1/pfgp-analytics/episodio/1", params=params).status_code == 409
    app.dependency_overrides[get_analytics_service] = lambda: PfgpAnalyticsService(EklipseClient())
    result = client.get("/api/v1/pfgp-analytics/episodio/1", params=params)
    assert result.status_code == 502
    assert "Red prohibida" not in result.text
    monkeypatch.setattr(settings, "EKLIPSE_TOKEN", None)
    assert client.get("/api/v1/pfgp-analytics/episodio/1", params=params).status_code == 503


@pytest.mark.parametrize("changes", [
    {"inicio": "2026-02-30"}, {"final": "2026-09-01"}, {"centroId": 98},
    {"idContrato": 0}, {"revision": "invalid"},
])
def test_drilldown_validates_filters(changes):
    client = TestClient(app)
    params = drilldown_params(client)
    assert client.get("/api/v1/pfgp-analytics/episodio/1", params={**params, **changes}).status_code == 422


def financial_source():
    data = source()
    contract = data["facturado"][0]
    group = contract["agrupadores"][0]
    episode = group["iteracciones"][0]
    contract.update(totalRecuperado=20, totalDisponibilidad=350)
    group["totalRecuperado"] = 20
    episode["totalRecuperado"] = 20
    episode["servicios"][0].update(cantidad=2, valorEntidad=50, valorPaciente=10, valorTotal=120, nombre="Foam VAC")
    data["acostado"] = [{
        "idContrato": 10, "totalFacturado": 50,
        "iteracciones": [{"consecutivoIngreso": 90000001, "nombreCompletoPaciente": "OTRO_NOMBRE_PRIVADO", "totalFacturado": 50}],
    }]
    return data


def financial_report(data=None, url=URL):
    install_source(financial_source() if data is None else data)
    response = TestClient(app).get(url)
    assert response.status_code == 200
    return response.json()


def test_financial_budget_and_exposure_bases_are_explicit_and_match_catalog():
    report = financial_report()
    summary = report["resumenFinanciero"]
    assert summary == {
        "presupuestoContractualReportado": 600, "sumaLimitesAgrupadores": 300,
        "diferenciaPresupuestos": 300, "coberturaLimitesPct": 50,
        "ejecucionContractualPct": 33.33, "participacionEventosPct": 0,
    }
    assert report["kpisGlobales"]["presupuestoTotalLimite"] == 300
    exposure = report["exposicion"]
    assert exposure["estado"] == "disponible"
    assert exposure["registrosAcostado"] == 1
    assert exposure["totalAcostado"] == 50
    assert exposure["totalCombinado"] == 250
    assert exposure["ejecucionCombinadaPct"] == 41.67
    assert exposure["disponibilidadCalculada"] == 350
    assert exposure["diferenciaDisponibilidad"] == 0
    assert exposure["supuestoMismoCorte"] is True
    catalog = TestClient(app).get(URL.replace("dashboard", "contratos")).json()["contratos"][0]
    assert catalog["resumenFinanciero"] == summary
    assert catalog["exposicion"] == exposure
    assert "OTRO_NOMBRE_PRIVADO" not in str(catalog)
    assert "90000001" not in str(catalog)


@pytest.mark.parametrize("budget", [None, 0, -100])
def test_budget_has_no_implicit_fallback(budget):
    data = financial_source()
    data["facturado"][0]["totalContratado"] = budget
    report = financial_report(data)
    assert report["resumenFinanciero"]["ejecucionContractualPct"] is None
    assert report["resumenFinanciero"]["coberturaLimitesPct"] is None
    assert report["exposicion"]["ejecucionCombinadaPct"] is None


def test_contract_without_groups_still_has_reported_budget():
    data = financial_source()
    data["facturado"][0]["agrupadores"] = []
    report = financial_report(data)
    assert report["resumenFinanciero"]["presupuestoContractualReportado"] == 600
    assert report["resumenFinanciero"]["sumaLimitesAgrupadores"] == 0
    assert report["conciliacion"]["porcentajeConciliadoPct"] is None
    assert report["concentracion"]["top10Pct"] is None


def test_recovery_explains_gross_difference_and_service_portions_use_quantity():
    report = financial_report()
    episode = report["episodios"][0]
    assert episode["sumaServiciosDetalle"] == 220
    assert episode["discrepanciaIntegridad"] == 20
    assert episode["discrepanciaResidual"] == 0
    assert episode["importeEntidadServicios"] == 200
    assert episode["importePacienteServicios"] == 20
    assert episode["idAgrupador"] == 2
    assert report["conciliacion"] == {
        "episodiosEvaluables": 1, "episodiosConciliados": 1, "episodiosConDiferencia": 0,
        "episodiosNoEvaluables": 0, "porcentajeConciliadoPct": 100, "montoAbsolutoSinExplicar": 0,
    }
    client = TestClient(app)
    detail = client.get("/api/v1/pfgp-analytics/episodio/1", params=drilldown_params(client)).json()
    assert detail["servicios"][0]["importeEntidad"] == 100
    assert detail["servicios"][0]["importePaciente"] == 20
    assert detail["episodio"] == episode


@pytest.mark.parametrize("difference,count", [(0.01, 0), (0.02, 1), (-0.02, 1)])
def test_residual_uses_decimal_tolerance_and_absolute_amount(difference, count):
    data = financial_source()
    data["facturado"][0]["agrupadores"][0]["iteracciones"][0]["servicios"][0]["valorTotal"] = 120 + difference
    report = financial_report(data)
    assert report["conciliacion"]["episodiosConDiferencia"] == count
    assert report["conciliacion"]["montoAbsolutoSinExplicar"] == (abs(difference) if count else 0)


@pytest.mark.parametrize("missing", ["totalRecuperado", "totalFacturado", "valorTotal", "valorEntidad"])
def test_missing_inputs_are_not_reported_as_zero_in_new_metrics(missing):
    data = financial_source()
    episode = data["facturado"][0]["agrupadores"][0]["iteracciones"][0]
    if missing in ("valorTotal", "valorEntidad"):
        del episode["servicios"][0][missing]
    else:
        del episode[missing]
    report = financial_report(data)
    if missing == "valorEntidad":
        assert report["episodios"][0]["importeEntidadServicios"] is None
    else:
        assert report["episodios"][0]["discrepanciaResidual"] is None
        assert report["conciliacion"]["episodiosNoEvaluables"] == 1
        assert report["conciliacion"]["porcentajeConciliadoPct"] is None
    if missing == "valorTotal":
        assert report["paretoUniverso"]["porcentajesDisponibles"] is False
    if missing == "totalFacturado":
        assert report["concentracion"]["top10Pct"] is None


@pytest.mark.parametrize("mode", ["absent", "empty", "unmatched", "missing_rows"])
def test_unavailable_bed_section_is_not_zero(mode):
    data = financial_source()
    if mode == "absent": del data["acostado"]
    elif mode == "empty": data["acostado"] = []
    elif mode == "unmatched": data["acostado"][0]["idContrato"] = 999
    else: del data["acostado"][0]["iteracciones"]
    report = financial_report(data)
    assert report["exposicion"]["estado"] == "no_disponible"
    assert report["exposicion"]["totalCombinado"] is None


def test_explicit_empty_bed_contract_is_zero():
    data = financial_source()
    data["acostado"][0].update(totalFacturado=0, iteracciones=[])
    result = financial_report(data)["exposicion"]
    assert result["estado"] == "disponible"
    assert result["registrosAcostado"] == 0
    assert result["totalAcostado"] == 0
    assert result["totalCombinado"] == 200


def test_overlapping_admissions_block_combined_exposure_only():
    data = financial_source()
    data["acostado"][0]["iteracciones"][0]["consecutivoIngreso"] = 87654321
    result = financial_report(data)["exposicion"]
    assert result["estado"] == "solapamiento"
    assert result["ingresosCompartidos"] == 1
    assert result["totalAcostado"] == 50
    assert result["totalCombinado"] is None
    assert result["disponibilidadCalculada"] is None


def test_duplicate_bed_contracts_have_structured_error():
    data = financial_source()
    data["acostado"] *= 2
    install_source(data)
    response = TestClient(app).get(URL)
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "DUPLICATE_CONTRACTS"


def test_revision_covers_selected_bed_but_not_other_contract():
    data = financial_source()
    data["acostado"].append({"idContrato": 99, "totalFacturado": 20, "iteracciones": []})
    first = financial_report(data)["metadata"]["revision"]
    data["acostado"][1]["totalFacturado"] = 999
    assert financial_report(data)["metadata"]["revision"] == first
    data["acostado"][0]["totalFacturado"] = 51
    assert financial_report(data)["metadata"]["revision"] != first
    response = TestClient(app).post(SIMULATION_URL, json={**SIMULATION_REQUEST, "idContrato": 10, "revision": first})
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "STALE_REPORT"


@pytest.mark.parametrize("start,end,days,calendar_days", [
    ("2026-10-01", "2026-10-30", 30, 31),
    ("2026-10-01", "2026-10-31", 31, 31),
    ("2024-02-01", "2024-02-29", 29, 29),
    ("2026-02-10", "2026-02-20", 11, 28),
    ("2026-10-20", "2026-11-02", 14, None),
])
def test_temporal_references_normalize_without_changing_budget(start, end, days, calendar_days):
    url = f"/api/v1/pfgp-analytics/dashboard?inicio={start}&final={end}&centroId=99"
    report = financial_report(url=url)
    refs = report["referenciasTemporales"]
    assert refs["dias30"]["facturacionNormalizada"] == pytest.approx(200 / days * 30)
    assert refs["dias30"]["avanceReferenciaPct"] == round(days / 30 * 100, 2)
    if calendar_days:
        assert refs["calendario"]["diasReferencia"] == calendar_days
        assert refs["calendario"]["facturacionNormalizada"] == pytest.approx(200 / days * calendar_days)
        assert refs["motivoCalendario"] is None
    else:
        assert refs["calendario"] is None
        assert refs["motivoCalendario"]
    assert report["resumenFinanciero"]["presupuestoContractualReportado"] == 600


def test_deviation_components_reconcile_to_group_budget():
    data = financial_source()
    data["facturado"][0]["agrupadores"][0]["limite"] = 250
    group = financial_report(data)["agrupadores"][0]
    assert group["efectoVolumen"] == -150
    assert group["efectoValor"] == 50
    assert group["diferenciaPresupuestoImplicito"] == 50
    assert group["efectoVolumen"] + group["efectoValor"] + group["diferenciaPresupuestoImplicito"] == group["totalFacturado"] - group["limitePresupuestal"]


def test_quantiles_and_concentration_use_all_episode_headers():
    data = financial_source()
    group = data["facturado"][0]["agrupadores"][0]
    base = group["iteracciones"][0]
    group["iteracciones"] = [{**deepcopy(base), "totalFacturado": value} for value in range(1, 12)]
    report = financial_report(data)
    actual = report["agrupadores"][0]
    assert actual["cantidadObservaciones"] == 11
    assert actual["medianaFacturacion"] == 6
    assert actual["p90Facturacion"] == 10
    assert report["concentracion"] == {
        "totalFacturadoEpisodios": 66, "cantidadEpisodios": 11,
        "cantidadTop10": 10, "top10Pct": 98.48,
        "cantidadTopDecil": 2, "topDecilPct": 31.82,
    }
    group["iteracciones"] = group["iteracciones"][:4]
    assert financial_report(data)["agrupadores"][0]["p90Facturacion"] == 3.7


def test_pareto_denominator_precedes_truncation_and_counts_rest():
    data = financial_source()
    episode = data["facturado"][0]["agrupadores"][0]["iteracciones"][0]
    base = episode["servicios"][0]
    episode["servicios"] = [{**base, "id": i, "nombre": f"Servicio {i:02}", "valorTotal": 1} for i in range(25)]
    report = financial_report(data)
    assert len(report["paretoCostos"]) == 20
    assert report["paretoUniverso"] == {"totalServicios": 25, "valorTotal": 25, "porcentajesDisponibles": True, "restoTop10": 15}
    episode["servicios"][-1]["valorTotal"] = -1
    assert financial_report(data)["paretoUniverso"]["porcentajesDisponibles"] is False
    episode["totalFacturado"] = -1
    assert financial_report(data)["concentracion"]["top10Pct"] is None


def test_simulation_moves_entity_only_and_preserves_both_portions():
    financial_report()
    client = TestClient(app)
    request = {**drilldown_params(client), "excluirTerapiaVAC": True, "insumosExcluidosManuales": ["FOAM"]}
    response = client.post(SIMULATION_URL, json=request)
    assert response.status_code == 200
    result = response.json()
    assert result["totalFacturadoOriginal"] == 200
    assert result["totalFacturadoSimuladoPGP"] == 100
    assert result["totalTrasladadoAEvento"] == 100
    assert result["totalTrasladadoPaciente"] == 20
    assert result["totalTrasladadoBruto"] == 120
    assert result["totalFacturadoOriginal"] == result["totalFacturadoSimuladoPGP"] + result["totalTrasladadoAEvento"]
    assert result["revision"] == request["revision"]
    assert result["idContrato"] == 10
    assert result["agrupadoresRecalculados"][0]["montoExcluidoPaciente"] == 20


@pytest.mark.parametrize("failure", ["missing_entity", "missing_quantity", "missing_patient", "negative_quantity_unit", "inconsistent_gross", "exceeds_header"])
def test_simulation_cannot_hide_invalid_or_excessive_transfers(failure):
    data = financial_source()
    group = data["facturado"][0]["agrupadores"][0]
    service = group["iteracciones"][0]["servicios"][0]
    if failure == "missing_entity": del service["valorEntidad"]
    elif failure == "missing_quantity": del service["cantidad"]
    elif failure == "missing_patient": del service["valorPaciente"]
    elif failure == "negative_quantity_unit": service.update(cantidad=-2, valorEntidad=-50, valorPaciente=-10)
    elif failure == "inconsistent_gross": service["valorTotal"] = 121
    else: group["totalFacturado"] = 99
    financial_report(data)
    client = TestClient(app)
    request = {**drilldown_params(client), "excluirTerapiaVAC": True}
    response = client.post(SIMULATION_URL, json=request)
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "SCENARIO_NOT_CALCULABLE"
    assert "NOMBRE_SINTETICO_PRIVADO" not in response.text


def test_simulator_requires_revision_and_has_null_execution_without_ceiling():
    data = financial_source()
    data["facturado"][0]["agrupadores"][0]["limite"] = 0
    financial_report(data)
    client = TestClient(app)
    params = drilldown_params(client)
    result = client.post(SIMULATION_URL, json={**params, "excluirTerapiaVAC": True}).json()
    assert result["totalTrasladadoAEvento"] == 0
    assert result["agrupadoresRecalculados"][0]["ejecucionOriginalPct"] is None
    del params["revision"]
    assert client.post(SIMULATION_URL, json=params).status_code == 422


def test_hierarchical_reconciliation_keeps_net_headers_separate_from_recovery():
    report = financial_report()
    levels = report["conciliacionNiveles"]
    expected = {"cabecera": 200, "sumaComponentes": 200, "diferencia": 0, "estado": "conciliado"}
    assert levels["contratoAgrupadores"] == expected
    assert levels["contratoEpisodios"] == expected
    assert levels["agrupadores"] == [{**expected, "idAgrupador": 2, "nombre": "Hospitalización", "cantidadEpisodios": 1}]
    assert levels["agrupadoresConciliados"] == 1
    assert levels["agrupadoresConDiferencia"] == 0
    assert levels["agrupadoresNoEvaluables"] == 0
    assert levels["montoAbsolutoDiferenciasAgrupadores"] == 0
    assert report["episodios"][0]["sumaServiciosDetalle"] == 220
    assert report["conciliacion"]["porcentajeConciliadoPct"] == 100
    # Recovery explains gross service values; it is not added again to net headers.
    assert report["kpisGlobales"]["totalFacturadoContrato"] == 200


def test_compensating_group_differences_are_not_hidden_by_balanced_contract():
    data = financial_source()
    contract = data["facturado"][0]
    second = deepcopy(contract["agrupadores"][0])
    second.update(id=3, nombre="Cirugía")
    contract["agrupadores"].append(second)
    contract["totalFacturado"] = 400
    for group, billed in zip(contract["agrupadores"], (250, 150)):
        episode = group["iteracciones"][0]
        episode["totalFacturado"] = billed
        episode["servicios"][0].update(valorTotal=billed - 80, valorEntidad=(billed - 100) / 2)
    report = financial_report(data)
    levels = report["conciliacionNiveles"]
    assert levels["contratoAgrupadores"]["estado"] == "conciliado"
    assert levels["contratoEpisodios"]["estado"] == "conciliado"
    assert [group["diferencia"] for group in levels["agrupadores"]] == [50, -50]
    assert levels["agrupadoresConDiferencia"] == 2
    assert levels["agrupadoresConciliados"] == 0
    assert levels["montoAbsolutoDiferenciasAgrupadores"] == 100
    assert report["conciliacion"]["porcentajeConciliadoPct"] == 100


def test_contract_header_difference_does_not_rewrite_provider_total():
    data = financial_source()
    data["facturado"][0]["totalFacturado"] = 250
    report = financial_report(data)
    levels = report["conciliacionNiveles"]
    assert report["kpisGlobales"]["totalFacturadoContrato"] == 250
    assert levels["contratoAgrupadores"] == {"cabecera": 250, "sumaComponentes": 200, "diferencia": -50, "estado": "con_diferencia"}
    assert levels["contratoEpisodios"]["diferencia"] == -50
    assert levels["agrupadoresConciliados"] == 1
    assert report["conciliacion"]["porcentajeConciliadoPct"] == 100


@pytest.mark.parametrize("level", ["contract", "group", "episode"])
@pytest.mark.parametrize("missing", [False, True])
def test_missing_and_null_headers_propagate_to_hierarchical_balances(level, missing):
    data = financial_source()
    contract = data["facturado"][0]
    group = contract["agrupadores"][0]
    episode = group["iteracciones"][0]
    target = {"contract": contract, "group": group, "episode": episode}[level]
    if missing:
        del target["totalFacturado"]
    else:
        target["totalFacturado"] = None
    levels = financial_report(data)["conciliacionNiveles"]
    if level == "contract":
        assert levels["contratoAgrupadores"]["cabecera"] is None
        assert levels["contratoAgrupadores"]["sumaComponentes"] == 200
        assert levels["contratoAgrupadores"]["estado"] == "no_evaluable"
        assert levels["contratoEpisodios"]["estado"] == "no_evaluable"
        assert levels["agrupadoresConciliados"] == 1
    else:
        assert levels["agrupadoresNoEvaluables"] == 1
        assert levels["agrupadores"][0]["diferencia"] is None
        assert levels["montoAbsolutoDiferenciasAgrupadores"] is None
        if level == "group":
            assert levels["contratoAgrupadores"]["sumaComponentes"] is None
            assert levels["contratoEpisodios"]["estado"] == "conciliado"
        else:
            assert levels["contratoAgrupadores"]["estado"] == "conciliado"
            assert levels["contratoEpisodios"]["sumaComponentes"] is None


@pytest.mark.parametrize("level", ["groups", "episodes", "services"])
@pytest.mark.parametrize("missing", [False, True])
def test_omitted_and_null_lists_do_not_become_evaluable_empty_lists(level, missing):
    data = financial_source()
    contract = data["facturado"][0]
    group = contract["agrupadores"][0]
    target, key = {
        "groups": (contract, "agrupadores"),
        "episodes": (group, "iteracciones"),
        "services": (group["iteracciones"][0], "servicios"),
    }[level]
    if missing:
        del target[key]
    else:
        target[key] = None
    report = financial_report(data)
    levels = report["conciliacionNiveles"]
    if level == "groups":
        assert levels["contratoAgrupadores"]["sumaComponentes"] is None
        assert levels["contratoEpisodios"]["sumaComponentes"] is None
        assert levels["agrupadores"] == []
        assert levels["montoAbsolutoDiferenciasAgrupadores"] is None
    elif level == "episodes":
        assert levels["contratoAgrupadores"]["estado"] == "conciliado"
        assert levels["contratoEpisodios"]["estado"] == "no_evaluable"
        assert levels["agrupadoresNoEvaluables"] == 1
    else:
        assert levels["contratoAgrupadores"]["estado"] == "conciliado"
        assert levels["contratoEpisodios"]["estado"] == "conciliado"
        assert report["conciliacion"]["episodiosNoEvaluables"] == 1
        assert report["episodios"][0]["discrepanciaResidual"] is None
    # The catalog must remain readable even with incomplete legacy detail.
    assert TestClient(app).get(URL.replace("dashboard", "contratos")).status_code == 200


@pytest.mark.parametrize("level", ["groups", "episodes"])
def test_explicit_empty_lists_and_zero_headers_reconcile(level):
    data = financial_source()
    contract = data["facturado"][0]
    contract["totalFacturado"] = 0
    if level == "groups":
        contract["agrupadores"] = []
    else:
        contract["agrupadores"][0].update(totalFacturado=0, iteracciones=[])
    levels = financial_report(data)["conciliacionNiveles"]
    assert levels["contratoAgrupadores"] == {"cabecera": 0, "sumaComponentes": 0, "diferencia": 0, "estado": "conciliado"}
    assert levels["contratoEpisodios"] == levels["contratoAgrupadores"]
    assert levels["montoAbsolutoDiferenciasAgrupadores"] == 0
    assert levels["agrupadoresNoEvaluables"] == 0


@pytest.mark.parametrize("delta,state", [("0.01", "conciliado"), ("0.011", "con_diferencia"), ("-0.011", "con_diferencia")])
def test_hierarchical_tolerance_uses_exact_decimals(delta, state):
    from decimal import Decimal
    data = financial_source()
    data["facturado"][0]["agrupadores"][0]["iteracciones"][0]["totalFacturado"] = str(Decimal(200) + Decimal(delta))
    levels = financial_report(data)["conciliacionNiveles"]
    assert levels["agrupadores"][0]["diferencia"] == float(delta)
    assert levels["agrupadores"][0]["estado"] == state
    assert levels["contratoEpisodios"]["estado"] == state
    assert levels["montoAbsolutoDiferenciasAgrupadores"] == (abs(float(delta)) if state == "con_diferencia" else 0)


def test_reception_timestamp_changes_without_changing_revision(monkeypatch):
    data = financial_source()
    install_source(data)
    stamps = iter(["2026-11-05T14:00:00.000001Z", "2026-11-05T14:01:00.000002Z", "2026-11-05T14:02:00.000003Z"])
    monkeypatch.setattr(PfgpAnalyticsService, "_received_timestamp", staticmethod(lambda: next(stamps)))
    client = TestClient(app)
    first = client.get(URL).json()
    second = client.get(URL).json()
    catalog = client.get(URL.replace("dashboard", "contratos")).json()
    assert first["metadata"]["consultaRecibidaEn"] == "2026-11-05T14:00:00.000001Z"
    assert second["metadata"]["consultaRecibidaEn"] == "2026-11-05T14:01:00.000002Z"
    assert catalog["consultaRecibidaEn"] == "2026-11-05T14:02:00.000003Z"
    assert first["metadata"]["revision"] == second["metadata"]["revision"]
    assert first["metadata"]["centroId"] == catalog["centroId"] == 99
    assert "consultaRecibidaEn" not in data
    assert "consultaRecibidaEn" not in data["facturado"][0]


def test_direct_report_optional_timestamp_is_utc_and_does_not_affect_revision():
    from datetime import datetime, timedelta
    data = financial_source()
    service = PfgpAnalyticsService(FakeClient(data))
    contract, bed = data["facturado"][0], data["acostado"][0]
    explicit = service._build_report(contract, "2026-10-01", "2026-10-20", bed, "2026-11-05T14:00:00Z")
    automatic = service._build_report(contract, "2026-10-01", "2026-10-20", bed)
    assert automatic["metadata"]["consultaRecibidaEn"].endswith("Z")
    assert datetime.fromisoformat(automatic["metadata"]["consultaRecibidaEn"]).utcoffset() == timedelta(0)
    assert explicit["metadata"]["revision"] == automatic["metadata"]["revision"]
    assert explicit["metadata"]["centroId"] == automatic["metadata"]["centroId"] == 99


def test_all_http_flows_reject_other_centers_before_fetch_and_send_exact_99_range():
    data = financial_source()
    calls = []
    class RecordingClient(FakeClient):
        async def fetch_data(self, inicio, final, centro_id):
            calls.append((inicio, final, centro_id))
            return await super().fetch_data(inicio, final, centro_id)
    app.dependency_overrides[get_analytics_service] = lambda: PfgpAnalyticsService(RecordingClient(data))
    client = TestClient(app)
    report = client.get(URL).json()
    request = {**SIMULATION_REQUEST, "idContrato": 10, "revision": report["metadata"]["revision"]}
    catalog = client.get(URL.replace("dashboard", "contratos")).json()
    detail = client.get("/api/v1/pfgp-analytics/episodio/1", params=request).json()
    simulation = client.post(SIMULATION_URL, json=request).json()
    assert report["metadata"]["centroId"] == catalog["centroId"] == detail["centroId"] == simulation["centroId"] == 99
    assert calls == [("2026-10-01", "2026-10-20", 99)] * 4
    for endpoint in ("dashboard", "contratos"):
        assert client.get(URL.replace("dashboard", endpoint).replace("centroId=99", "centroId=98")).status_code == 422
    assert client.get("/api/v1/pfgp-analytics/episodio/1", params={**request, "centroId": 100}).status_code == 422
    assert client.post(SIMULATION_URL, json={**request, "centroId": 98}).status_code == 422
    assert len(calls) == 4
