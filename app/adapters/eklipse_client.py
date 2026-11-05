import ssl
from typing import Dict, Any, Optional
import httpx
from app.config import settings

class EklipseAuthError(ConnectionError):
    pass


class EklipseClient:
    def __init__(
        self,
        base_url: Optional[str] = None,
        timeout: Optional[float] = None,
        verify_ssl: Optional[bool] = None,
    ):
        self.base_url = base_url or settings.EKLIPSE_BASE_URL
        self.timeout = timeout if timeout is not None else settings.HTTP_TIMEOUT_SECONDS
        self.verify_ssl = verify_ssl if verify_ssl is not None else settings.HTTP_VERIFY_SSL

    async def fetch_data(self, inicio: str, final: str, centro_id: int) -> Dict[str, Any]:
        params = {"inicio": inicio, "final": final, "centroId": centro_id}
        token = settings.EKLIPSE_TOKEN.get_secret_value().strip() if settings.EKLIPSE_TOKEN else ""
        if not token:
            raise EklipseAuthError("Se requiere configurar el token en el backend.")
        try:
            # En Windows incluye las CA del sistema; respeta SSL_CERT_FILE sin desactivar TLS.
            verify = ssl.create_default_context() if self.verify_ssl else False
            async with httpx.AsyncClient(verify=verify, timeout=self.timeout, headers={"Authorization": f"Bearer {token}"}) as client:
                response = await client.get(self.base_url, params=params)
                if response.status_code in (401, 403):
                    raise EklipseAuthError("El origen rechazó la autenticación.")
                response.raise_for_status()
                return response.json()
        except EklipseAuthError:
            raise
        except Exception:
            # No registrar URLs, tokens, cuerpos ni sustituir una consulta por otro corte.
            raise ConnectionError("No se pudo consultar el origen de datos.") from None
