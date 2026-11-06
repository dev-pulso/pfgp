"""Server-only proxy for explicit PFGP configuration writes, without retries."""
from decimal import Decimal
import ssl

import httpx
from pydantic import ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.config import settings
from app.schemas.contract_registration import (
    ContractRegistrationOptions, ContractRegistrationRequest, ContractRegistrationResponse,
)


class ContractRegistrationSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    EKLIPSE_CONTRACTS_URL: str = ""


class ContractRegistrationError(Exception):
    def __init__(self, status_code, code, message):
        super().__init__(message)
        self.status_code, self.code, self.message = status_code, code, message


BUSINESS_ERRORS = {
    "CONTRACT_ALREADY_CONFIGURED": (409, "El contrato ya tiene una configuración PFGP. Actualiza las opciones para verificarla."),
    "INVALID_CONTRACT_REFERENCE": (422, "El contrato seleccionado no está disponible en el origen."),
    "INVALID_GROUP_REFERENCE": (422, "Uno o más agrupadores no están disponibles para esta configuración."),
    "INVALID_SERVICE_TYPE": (422, "El tipo de clasificación seleccionado no es válido."),
    "INVALID_CONTRACT_INPUT": (422, "Revisa los datos de la configuración PFGP."),
}


def unavailable():
    return ContractRegistrationError(503, "CONTRACT_REGISTRATION_UNAVAILABLE", "La configuración de contratos aún no está disponible. Falta habilitar su endpoint en el backend.")


def unconfirmed():
    return ContractRegistrationError(502, "CONTRACT_WRITE_UNCONFIRMED", "No fue posible confirmar el resultado. El contrato puede haber quedado configurado; verifica su estado antes de volver a enviarlo.")


class ContractRegistrationClient:
    def __init__(self, base_url=None):
        self.base_url = base_url if base_url is not None else ContractRegistrationSettings().EKLIPSE_CONTRACTS_URL

    def _connection(self):
        base = self.base_url.strip().rstrip("/")
        if not base:
            raise unavailable()
        try:
            url = httpx.URL(base)
            if url.scheme not in ("https", "http") or not url.host or url.userinfo or url.query or url.fragment:
                raise ValueError("Invalid server endpoint")
        except (ValueError, httpx.InvalidURL):
            raise unavailable() from None
        token = settings.EKLIPSE_TOKEN.get_secret_value().strip() if settings.EKLIPSE_TOKEN else ""
        if not token:
            raise ContractRegistrationError(503, "SOURCE_AUTH_REQUIRED", "El origen requiere una credencial válida configurada en el backend.")
        verify = ssl.create_default_context() if settings.HTTP_VERIFY_SSL else False
        return base, {
            "timeout": settings.HTTP_TIMEOUT_SECONDS, "verify": verify,
            "follow_redirects": False, "headers": {"Authorization": f"Bearer {token}", "Accept": "application/json"},
        }

    @staticmethod
    def _auth_error(response):
        if response.status_code == 401:
            raise ContractRegistrationError(503, "SOURCE_AUTH_REQUIRED", "El origen requiere una credencial válida configurada en el backend.")
        if response.status_code == 403:
            raise ContractRegistrationError(403, "CONTRACT_WRITE_FORBIDDEN", "La credencial del backend no tiene permiso para esta operación.")

    @staticmethod
    def _response_code(response):
        try:
            body = response.json()
            code = body.get("code") or (body.get("detail", {}).get("code") if isinstance(body.get("detail"), dict) else None)
            return code if isinstance(code, str) else None
        except (ValueError, AttributeError):
            return None

    async def options(self):
        base, connection = self._connection()
        try:
            async with httpx.AsyncClient(**connection) as client:
                response = await client.get(f"{base}/opciones", params={"centroId": 99})
            self._auth_error(response)
            if response.status_code == 503 and self._response_code(response) == "CONTRACT_REGISTRATION_UNAVAILABLE":
                raise unavailable()
            if response.status_code != 200:
                raise ValueError("Invalid options response")
            return ContractRegistrationOptions.model_validate(response.json())
        except ContractRegistrationError:
            raise
        except (httpx.HTTPError, ValueError, ValidationError):
            raise ContractRegistrationError(502, "CONTRACT_OPTIONS_UNAVAILABLE", "No se pudieron consultar las opciones de configuración. Vuelve a consultarlas antes de enviar.") from None

    @staticmethod
    def _assert_matches(request, result):
        same_fields = ("centroId", "contratoId", "fechaInicio", "fechaFin", "keyAgrupadorServicio")
        if any(getattr(request, key) != getattr(result, key) for key in same_fields) or Decimal(request.valor) != Decimal(result.valor):
            raise unconfirmed()
        def amounts(groups):
            return {g.agrupadorId: (Decimal(g.limite), Decimal(g.cantidadEventosContratados)) for g in groups}
        if amounts(request.agrupadores) != amounts(result.agrupadores):
            raise unconfirmed()

    async def create(self, request: ContractRegistrationRequest):
        base, connection = self._connection()
        try:
            # A single POST. There is deliberately no transport or application retry.
            async with httpx.AsyncClient(**connection) as client:
                response = await client.post(base, json=request.model_dump(mode="json"))
            self._auth_error(response)
            if response.status_code == 503 and self._response_code(response) == "CONTRACT_REGISTRATION_UNAVAILABLE":
                raise unavailable()
            if response.status_code in (409, 422, 400):
                code = self._response_code(response)
                if code in BUSINESS_ERRORS:
                    status, message = BUSINESS_ERRORS[code]
                    raise ContractRegistrationError(status, code, message)
            if response.status_code != 201:
                raise unconfirmed()
            result = ContractRegistrationResponse.model_validate(response.json())
            self._assert_matches(request, result)
            return result
        except ContractRegistrationError:
            raise
        except (httpx.ConnectError, httpx.ConnectTimeout, httpx.PoolTimeout):
            raise ContractRegistrationError(503, "SOURCE_UNAVAILABLE", "No se pudo establecer la conexión con el servicio de configuración.") from None
        except (httpx.HTTPError, ValueError, ValidationError):
            # A read timeout, protocol failure or invalid acknowledgement can follow a commit.
            raise unconfirmed() from None
