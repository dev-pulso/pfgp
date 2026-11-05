from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import SecretStr

class Settings(BaseSettings):
    # Metadatos de la aplicación
    PROJECT_NAME: str = "PFGP Clinical & Financial Analytics API"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"

    # Configuración del servidor
    HOST: str = "127.0.0.1"
    PORT: int = 8000
    DEBUG: bool = True

    # Origen de datos (Endpoint remoto Eklipse)
    EKLIPSE_BASE_URL: str = "https://eklipse.grupoclinicamedicos.com:8001/v1/pfgp/centralizado"
    EKLIPSE_TOKEN: SecretStr | None = None
    HTTP_TIMEOUT_SECONDS: float = 30.0
    HTTP_VERIFY_SSL: bool = True

    # Parámetros por defecto de negocio
    DEFAULT_CENTRO_ID: int = 99
    DEFAULT_DIAS_MES_CONTRACTUAL: int = 30

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore"
    )

settings = Settings()
