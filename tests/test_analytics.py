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
        "totalFacturado": 200, "totalRecuperado": 10,
        "agrupadores": [{
            "id": 2, "nombre": "Hospitalización\r\n", "peso": 1, "limite": 300,
            "totalFacturado": 200, "totalRecuperado": 10, "cantidadEventosContratados": 2,
            "cantidadIteracciones": 2, "CMEContratado": 150,
            "iteracciones": [{
                "consecutivoIngreso": 87654321, "nombreCompletoPaciente": "NOMBRE_SINTETICO_PRIVADO",
                "fechaIngreso": "2026-10-07T12:34:56", "diasEstancia": 4, "totalFacturado": 200,
                "servicios": [
                    {"id": 31, "codigo": "MEDICAMENTOS", "nombre": "Producto de prueba", "cantidad": 1, "valorProducto": 100, "valorTotal": 100},
                    {"id": 31, "codigo": "MEDICAMENTOS", "nombre": "Producto de prueba", "cantidad": 1, "valorProducto": 100, "valorTotal": 100},
                    {"id": 32, "codigo": "OTRO", "nombre": "Servicio de prueba", "cantidad": 2, "valorProducto": 50, "valorTotal": 0},
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
        assert params["centroId"] == 99
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
SIMULATION_REQUEST = {"inicio": "2026-10-01", "final": "2026-10-20", "centroId": 99, "idContrato": 11}


def test_simulation_uses_selected_contract_and_only_transfers_pgp_supplies():
    data = multiple_source()
    group = data["facturado"][1]["agrupadores"][0]
    group["totalFacturado"] = 700
    group["iteracciones"][0]["servicios"][0].update(nombre="Foam VAC", valorTotal=100)
    group["iteracciones"][0]["servicios"][1].update(nombre="Malla sling", valorTotal=50)
    events = deepcopy(group)
    events.update(id=1, nombre="EVENTOS", limite=0, totalFacturado=500)
    data["facturado"][1]["agrupadores"].append(events)
    install_source(data)
    client = TestClient(app)
    result = client.post(SIMULATION_URL, json={**SIMULATION_REQUEST, "excluirTerapiaVAC": True, "excluirMallasSling": True})
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
    original = client.post(SIMULATION_URL, json=SIMULATION_REQUEST).json()
    assert original["totalTrasladadoAEvento"] == 0


@pytest.mark.parametrize("empty", ["agrupadores", "iteracciones", "servicios"])
def test_simulation_handles_empty_details(empty):
    data = source()
    group = data["facturado"][0]["agrupadores"][0]
    if empty == "agrupadores": data["facturado"][0]["agrupadores"] = []
    elif empty == "iteracciones": group["iteracciones"] = []
    else: group["iteracciones"][0]["servicios"] = []
    install_source(data)
    response = TestClient(app).post(SIMULATION_URL, json={**SIMULATION_REQUEST, "idContrato": 10, "excluirTerapiaVAC": True})
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
