# Cambios de integración del dashboard · 4 de noviembre de 2026

Alcance: backend FastAPI presente en `app/`. Se conserva el motor Pandas y el contrato de seis secciones, con ajustes acotados para conectar una interfaz ejecutiva sin identidades directas. El motivo y el impacto se explicaron antes de editar.

| Cambio | Motivo e impacto | Evidencia |
| --- | --- | --- |
| Alias temporales antes de serializar | Evitar transferir nombres e ingresos reales. `paciente` pasa a `Episodio NNNN`, `consecutivoIngreso` a ordinal del informe y `fechaIngreso` se suprime. Es una incompatibilidad semántica deliberada para consumidores que usaran el ingreso original. No se crea una tabla de vinculación. | `app/services/pfgp_analytics_service.py:121`, `app/services/pfgp_analytics_service.py:294`, `app/schemas/pfgp_schemas.py:62`. |
| Contrato de privacidad y ausencia de caché | El navegador rechaza respuestas antiguas. Se exponen solo los encabezados necesarios a los orígenes locales. | `app/main.py:18`, `app/main.py:26`, `app/main.py:83`, `frontend/src/api/dashboard.ts:13`. |
| Centro 99 y fechas calendario | Evitar centros incorrectos, fechas inexistentes e intervalos invertidos. Fechas obligatorias en lugar de un corte fijo de octubre. | `app/main.py:33`, `app/schemas/pfgp_schemas.py:8`. |
| Errores saneados | No se devuelven excepciones, rutas o respuestas del proveedor al usuario. Estados diferentes para vacío, ID de contrato ambiguo, autenticación y fallo de origen. Validación del esquema dentro del bloque protegido. | `app/main.py:68`. |
| Sin fallback local | Un fallo del proveedor ya no se convierte en un informe de otro corte sin aviso. Se eliminaron el cargador de respaldo y su configuración. | `app/adapters/eklipse_client.py:21`. |
| Token Bearer solo en servidor | Mecanismo solicitado por el usuario. `EKLIPSE_TOKEN` se trata como `SecretStr`; se envía en Authorization. Token faltante o rechazo 401/403 produce aviso 503 seguro. | `app/config.py:17`, `app/adapters/eklipse_client.py:21`, `app/main.py:49`. |
| TLS con confianza del sistema | La prueba encontró fallo de CA con la configuración HTTPX predeterminada. `ssl.create_default_context()` permite usar los certificados de Windows y mantener validación TLS. Con esa confianza, el origen respondió 401; no se deshabilitó TLS. | `app/adapters/eklipse_client.py:28`, `app/config.py:19`. |
| CORS local y escucha local por defecto | Limitar esta versión de desarrollo al equipo; no sustituye autenticación o autorización para desplegarla en red. | `app/main.py:18`, `app/config.py:11`. |
| Colecciones vacías y números finitos | Los DataFrames declaran columnas aun sin filas. Se evita el error de asignación de estado en agrupadores vacíos y se rechazan NaN/Infinity en la respuesta. | `app/services/pfgp_analytics_service.py:144`, `app/services/pfgp_analytics_service.py:255`, `app/schemas/pfgp_schemas.py:4`. |
| Catálogo y selección explícita | `/contratos` devuelve todos los encabezados; `/dashboard?idContrato=...` calcula solo el elegido. Sin selección, una respuesta múltiple devuelve catálogo. El 409 se reserva para IDs repetidos. | `app/main.py:53`, `app/main.py:68`, `app/services/pfgp_analytics_service.py:29`, `app/services/pfgp_analytics_service.py:65`. |

## Validación

`python -m pytest -q`: **29 pruebas aprobadas**, con origen inyectado y red bloqueada. Cubren métricas de un caso sintético conocido, nombres/identificadores/fechas suprimidos, encabezados, rangos y centro, colecciones vacías, catálogo de 19 contratos, selección aislada aun con IDs de ingreso/servicio compartidos, contrato inexistente, IDs repetidos, errores seguros, CORS, token faltante, envío Bearer y rechazo 401/403. Evidencia ejecutable: `tests/test_analytics.py:1`.

No se modificaron datos clínicos ni se creó una base de pacientes. El diagnóstico manual imprime exclusivamente un estado y usa el mes actual de Bogotá: `scripts/check_connection.py:1`. La verificación de conexión inicial terminó en `token_ausente_o_rechazado`; la validación del informe real queda pendiente del token autorizado.

## Límites

La supresión de identificadores directos es seudonimización, no prueba de anonimización irreversible. Las combinaciones de agrupador, estancia e importes aún pueden permitir inferencias. No publicar esta versión en red sin controles de acceso, revisión de privacidad y política de exportación. Tampoco se acredita la corrección metodológica de todos los nombres de métricas del motor; se explican en `docs/DASHBOARD_EJECUTIVO.md`.
