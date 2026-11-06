from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import SecretStr

class Settings(BaseSettings):
    # Metadatos de la aplicación
    PROJECT_NAME: str = "PFGP Clinical & Financial Analytics API"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    TOKEN:str  = "eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJWNUZrTFFfTk1IcHkzWjF1OVk3MmkyeUsyU1Y1OTNXQ3BZc1ZJeUhLaDVOZUJSNXR5Mk8wcnNiYllpZDQyZjh3a2cyV3l0elFEYmE4a1JrcHN2YmlVUT09IiwicnN0IjpmYWxzZSwiZGNtIjoiMTA2NzgxNTU0MiIsImZubSI6IlBVTElETyBTT0xBTk8gQ0FSTE9TIEpPU0UgIiwiZGltIjp0cnVlLCJzdWIiOiJBTFRBQ0VOVFJPIiwidHVlIjoxLCJpYXQiOjE3OTM3MzQ3MjEsImV4cCI6MTc5NDMzOTUyMX0.A-mXi9VBOEoli8Y2lEwZTI5AyVx99hOYFZZwjb7hP3Z6u1RK-0Kp4avxwSa3u-Co8cfmpLXP1WPYkxJoeZ8QqQ"

    # Configuración del servidor
    HOST: str = "127.0.0.1"
    PORT: int = 8000
    DEBUG: bool = True

    # Origen de datos (Endpoint remoto Eklipse)
    EKLIPSE_BASE_URL: str = "https://eklipse.grupoclinicamedicos.com:8001/v1/pfgp/centralizado"
    EKLIPSE_TOKEN: SecretStr | None = TOKEN 
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
