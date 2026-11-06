"""Synthetic write-proxy tests. Every outbound transport is blocked by default."""
from copy import deepcopy

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.main import app
from app.config import settings
from app.adapters.contract_registration_client import ContractRegistrationClient, ContractRegistrationSettings
from app.routers.contract_registration import get_contract_registration_client

PATH = "/api/v1/pfgp-contracts"
UPSTREAM = "https://contracts.invalid/v1/pfgp/contratos"
PAYLOAD = {
    "centroId": 99, "contratoId": 20, "valor": "2400.0001",
    "fechaInicio": "2026-10-01", "fechaFin": "2026-10-31", "keyAgrupadorServicio": 0,
    "agrupadores": [{"agrupadorId": 2, "limite": "1200.0001", "cantidadEventosContratados": "8.33"}],
}
OPTIONS = {
    "centroId": 99,
    "contratos": [{"id": 20, "codigo": "TEST-20", "nombre": "Contrato de prueba", "configurado": False}],
    "tipos": [{"id": 0, "agrupadorIds": [2]}],
    "agrupadores": [{"id": 2, "nombre": "Agrupador de prueba"}],
}


def confirmation(payload=None):
    return {**deepcopy(PAYLOAD if payload is None else payload), "configuracionId": 12,
            "codigoContrato": "TEST-20", "nombreContrato": "Contrato de prueba"}


@pytest.fixture(autouse=True)
def isolated_registration(monkeypatch):
    monkeypatch.setattr(settings, "EKLIPSE_TOKEN", SecretStr("REGISTRATION_TEST_TOKEN"))
    monkeypatch.setattr(settings, "HTTP_VERIFY_SSL", True)
    async def forbidden_send(*args, **kwargs):
        raise AssertionError("Outbound network is forbidden in registration tests")
    monkeypatch.setattr(httpx.AsyncClient, "send", forbidden_send)
    app.dependency_overrides[get_contract_registration_client] = lambda: ContractRegistrationClient(UPSTREAM)
    yield
    app.dependency_overrides.clear()


def mock_post(monkeypatch, *, status=201, body=None, error=None, raw=None):
    calls = []
    async def fake_post(client, url, *, json):
        calls.append(deepcopy(json))
        assert url == UPSTREAM
        assert client.headers["authorization"] == "Bearer REGISTRATION_TEST_TOKEN"
        assert client.follow_redirects is False
        if error is not None:
            raise error("private upstream detail")
        response_args = {"content": raw} if raw is not None else {"json": confirmation(json) if body is None else body}
        return httpx.Response(status, request=httpx.Request("POST", UPSTREAM), **response_args)
    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
    return calls


def mock_options(monkeypatch, *, status=200, body=None):
    calls = []
    async def fake_get(client, url, *, params):
        calls.append(dict(params))
        assert url == UPSTREAM + "/opciones"
        assert params == {"centroId": 99}
        assert client.headers["authorization"] == "Bearer REGISTRATION_TEST_TOKEN"
        return httpx.Response(status, json=OPTIONS if body is None else body, request=httpx.Request("GET", UPSTREAM))
    monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)
    return calls


def test_options_use_master_references_and_strip_unknown_fields(monkeypatch):
    data = deepcopy(OPTIONS)
    data["private"] = "UPSTREAM_SECRET"
    data["contratos"][0]["private"] = "UPSTREAM_SECRET"
    calls = mock_options(monkeypatch, body=data)
    response = TestClient(app).get(PATH + "/opciones?centroId=99")
    assert response.status_code == 200
    assert response.json() == OPTIONS
    assert calls == [{"centroId": 99}]
    assert "UPSTREAM_SECRET" not in response.text
    assert "REGISTRATION_TEST_TOKEN" not in response.text
    assert response.headers["cache-control"] == "no-store"


def test_create_is_one_explicit_post_with_exact_decimal_strings(monkeypatch):
    calls = mock_post(monkeypatch)
    response = TestClient(app).post(PATH, json=PAYLOAD)
    assert response.status_code == 201
    assert response.json() == confirmation()
    assert calls == [PAYLOAD]
    assert response.headers["cache-control"] == "no-store"
    assert "REGISTRATION_TEST_TOKEN" not in response.text
    # Deliberately permits a budget different from the sum of group limits.
    assert response.json()["valor"] != response.json()["agrupadores"][0]["limite"]


def test_success_whitelists_fields_and_accepts_equivalent_decimal_format(monkeypatch):
    payload = deepcopy(PAYLOAD)
    payload["agrupadores"][0]["cantidadEventosContratados"] = "8.3"
    body = confirmation(payload)
    body["agrupadores"][0].update(cantidadEventosContratados="8.30", upstreamPrivate="UPSTREAM_SECRET")
    body["private"] = "UPSTREAM_SECRET"
    mock_post(monkeypatch, body=body)
    response = TestClient(app).post(PATH, json=payload)
    assert response.status_code == 201
    assert "UPSTREAM_SECRET" not in response.text
    assert response.json()["agrupadores"][0]["cantidadEventosContratados"] == "8.30"


@pytest.mark.parametrize("base", ["", "  ", "file:///private", "https://user:password@contracts.invalid/v1/pfgp/contratos", "https://contracts.invalid/path?target=other"])
def test_disabled_or_invalid_server_endpoint_never_sends(base):
    app.dependency_overrides[get_contract_registration_client] = lambda: ContractRegistrationClient(base)
    client = TestClient(app)
    for response in (client.get(PATH + "/opciones"), client.post(PATH, json=PAYLOAD)):
        assert response.status_code == 503
        assert response.json()["detail"]["code"] == "CONTRACT_REGISTRATION_UNAVAILABLE"
        assert "password" not in response.text


def test_configuration_url_has_no_fallback(monkeypatch):
    monkeypatch.delenv("EKLIPSE_CONTRACTS_URL", raising=False)
    assert ContractRegistrationSettings(_env_file=None).EKLIPSE_CONTRACTS_URL == ""


def test_missing_token_never_sends():
    from unittest.mock import patch
    with patch.object(settings, "EKLIPSE_TOKEN", None):
        response = TestClient(app).post(PATH, json=PAYLOAD)
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "SOURCE_AUTH_REQUIRED"


@pytest.mark.parametrize("patch", [
    {"centroId": 98}, {"contratoId": 0}, {"contratoId": True}, {"contratoId": "20"},
    {"contratoId": 2147483648}, {"keyAgrupadorServicio": -1}, {"keyAgrupadorServicio": 2147483648},
    {"valor": 2400}, {"valor": "0"}, {"valor": "-1"}, {"valor": "NaN"}, {"valor": "1e3"},
    {"valor": "1.00001"}, {"valor": "922337203685477.5808"}, {"valor": "01.20"},
    {"fechaInicio": "2026-02-30"}, {"fechaInicio": "2026-11-01"},
    {"fechaInicio": "1752-12-31"}, {"fechaFin": "2026-10-31T12:00:00Z"},
    {"fechaFin": "2026-09-01"}, {"agrupadores": []},
    {"unknown": "PRIVATE_REQUEST_VALUE"}, {"url": "https://other.invalid"},
])
def test_invalid_input_is_sanitized_before_any_network(patch):
    response = TestClient(app).post(PATH, json={**PAYLOAD, **patch})
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "INVALID_CONTRACT_INPUT"
    assert "PRIVATE_REQUEST_VALUE" not in response.text
    assert "other.invalid" not in response.text


@pytest.mark.parametrize("patch", [
    {"agrupadorId": 1}, {"agrupadorId": 0}, {"agrupadorId": 2147483648},
    {"limite": "0"}, {"limite": "922337203685477.5808"}, {"limite": "1.00001"},
    {"cantidadEventosContratados": "0"}, {"cantidadEventosContratados": "1.001"},
    {"cantidadEventosContratados": "10000000000000000.00"}, {"cantidadEventosContratados": 2},
    {"unexpected": "PRIVATE_REQUEST_VALUE"},
])
def test_invalid_group_input_never_sends(patch):
    payload = deepcopy(PAYLOAD)
    payload["agrupadores"][0].update(patch)
    response = TestClient(app).post(PATH, json=payload)
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "INVALID_CONTRACT_INPUT"


def test_group_ids_must_be_unique_and_maximum_is_100():
    client = TestClient(app)
    repeated = {**PAYLOAD, "agrupadores": PAYLOAD["agrupadores"] * 2}
    assert client.post(PATH, json=repeated).status_code == 422
    excessive = {**PAYLOAD, "agrupadores": [{**PAYLOAD["agrupadores"][0], "agrupadorId": n} for n in range(2, 103)]}
    assert client.post(PATH, json=excessive).status_code == 422


def test_decimal_sql_and_calendar_boundaries_are_accepted(monkeypatch):
    mock_post(monkeypatch)
    payload = deepcopy(PAYLOAD)
    payload.update(contratoId=2147483647, keyAgrupadorServicio=2147483647,
                   valor="922337203685477.5807", fechaInicio="1753-01-01", fechaFin="9999-12-31")
    payload["agrupadores"][0].update(agrupadorId=2147483647, limite="922337203685477.5807", cantidadEventosContratados="9999999999999999.99")
    assert TestClient(app).post(PATH, json=payload).status_code == 201


def test_options_rejects_other_center_before_network():
    response = TestClient(app).get(PATH + "/opciones?centroId=98")
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "INVALID_CONTRACT_INPUT"


@pytest.mark.parametrize("code,status", [
    ("CONTRACT_ALREADY_CONFIGURED", 409), ("INVALID_CONTRACT_REFERENCE", 422),
    ("INVALID_GROUP_REFERENCE", 422), ("INVALID_SERVICE_TYPE", 422), ("INVALID_CONTRACT_INPUT", 422),
])
def test_business_errors_are_whitelisted_and_sanitized(monkeypatch, code, status):
    calls = mock_post(monkeypatch, status=status, body={"code": code, "message": "UPSTREAM_SECRET"})
    response = TestClient(app).post(PATH, json=PAYLOAD)
    assert response.status_code == status
    assert response.json()["detail"]["code"] == code
    assert "UPSTREAM_SECRET" not in response.text
    assert len(calls) == 1


@pytest.mark.parametrize("status,code,local", [(401, "SOURCE_AUTH_REQUIRED", 503), (403, "CONTRACT_WRITE_FORBIDDEN", 403)])
def test_auth_errors_do_not_echo_upstream_or_claim_unknown_write(monkeypatch, status, code, local):
    mock_post(monkeypatch, status=status, body={"message": "UPSTREAM_SECRET"})
    response = TestClient(app).post(PATH, json=PAYLOAD)
    assert response.status_code == local
    assert response.json()["detail"]["code"] == code
    assert "UPSTREAM_SECRET" not in response.text


@pytest.mark.parametrize("error", [httpx.ReadTimeout, httpx.WriteTimeout, httpx.RemoteProtocolError, httpx.ReadError])
def test_post_transport_ambiguity_is_never_retried(monkeypatch, error):
    calls = mock_post(monkeypatch, error=error)
    response = TestClient(app).post(PATH, json=PAYLOAD)
    assert response.status_code == 502
    assert response.json()["detail"]["code"] == "CONTRACT_WRITE_UNCONFIRMED"
    assert "private upstream detail" not in response.text
    assert len(calls) == 1


@pytest.mark.parametrize("error", [httpx.ConnectError, httpx.ConnectTimeout, httpx.PoolTimeout])
def test_pre_send_connection_failure_has_separate_code(monkeypatch, error):
    calls = mock_post(monkeypatch, error=error)
    response = TestClient(app).post(PATH, json=PAYLOAD)
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "SOURCE_UNAVAILABLE"
    assert len(calls) == 1


@pytest.mark.parametrize("status", [200, 202, 301, 400, 409, 422, 500, 502, 503])
def test_nondefinitive_status_never_claims_write_was_unsaved(monkeypatch, status):
    calls = mock_post(monkeypatch, status=status, body={"code": "UNKNOWN_PROVIDER_CODE", "message": "UPSTREAM_SECRET"})
    response = TestClient(app).post(PATH, json=PAYLOAD)
    assert response.status_code == 502
    assert response.json()["detail"]["code"] == "CONTRACT_WRITE_UNCONFIRMED"
    assert "UPSTREAM_SECRET" not in response.text
    assert len(calls) == 1


@pytest.mark.parametrize("mode", ["invalid_json", "missing_id", "other_contract", "other_amount", "other_group"])
def test_invalid_success_acknowledgement_is_unconfirmed(monkeypatch, mode):
    body = confirmation()
    raw = None
    if mode == "invalid_json": raw = "not-json-UPSTREAM_SECRET"
    elif mode == "missing_id": del body["configuracionId"]
    elif mode == "other_contract": body["contratoId"] = 21
    elif mode == "other_amount": body["valor"] = "1"
    else: body["agrupadores"][0]["agrupadorId"] = 3
    calls = mock_post(monkeypatch, body=body, raw=raw)
    response = TestClient(app).post(PATH, json=PAYLOAD)
    assert response.status_code == 502
    assert response.json()["detail"]["code"] == "CONTRACT_WRITE_UNCONFIRMED"
    assert len(calls) == 1


def test_upstream_disabled_authority_is_definitive_and_sanitized(monkeypatch):
    body = {"code": "CONTRACT_REGISTRATION_UNAVAILABLE", "message": "UPSTREAM_SECRET"}
    mock_post(monkeypatch, status=503, body=body)
    mock_options(monkeypatch, status=503, body=body)
    client = TestClient(app)
    for response in (client.get(PATH + "/opciones"), client.post(PATH, json=PAYLOAD)):
        assert response.status_code == 503
        assert response.json()["detail"]["code"] == "CONTRACT_REGISTRATION_UNAVAILABLE"
        assert "UPSTREAM_SECRET" not in response.text


def test_invalid_options_are_not_forwarded(monkeypatch):
    body = deepcopy(OPTIONS)
    body["contratos"] *= 2
    mock_options(monkeypatch, body=body)
    response = TestClient(app).get(PATH + "/opciones")
    assert response.status_code == 502
    assert response.json()["detail"]["code"] == "CONTRACT_OPTIONS_UNAVAILABLE"


def test_registration_cors_remains_local():
    response = TestClient(app).options(PATH, headers={
        "Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
    })
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
