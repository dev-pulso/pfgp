# Dashboard ejecutivo PFGP · Grupo Clínica Médicos

Catálogo de contratos y dashboard de auditoría y análisis por contrato retornado por Eklipse, con centro fijo **99**. React, TypeScript, Vite, TanStack Query, Apache ECharts (`echarts-for-react`) y Lucide; backend FastAPI existente. El frontend consulta datos reales bajo demanda: no incluye un modo demo ni un archivo de respaldo automático.

## Arranque local en Windows

Requisitos: Python 3.12 y Node.js 22.12+ o 24. Se verificó con Python 3.12.14 y Node.js 24.22.1. Ejecuta los comandos desde la raíz del proyecto.

1. Instala las dependencias del backend si no están instaladas:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

2. Crea `.env` a partir de `.env.example` **solo si no existe**. En el archivo local, completa `EKLIPSE_TOKEN` con tu token autorizado, sin el prefijo `Bearer`. No lo pegues en el chat, en la terminal ni en archivos de frontend. Conserva `HTTP_VERIFY_SSL=True` y `HOST=127.0.0.1`.

El backend usa `Authorization: Bearer …` y la confianza TLS del sistema. Si tu organización usa una CA adicional, configura el certificado autorizado mediante `SSL_CERT_FILE`; no desactives TLS para resolverlo. Nunca coloques el token en una variable `VITE_*`: esas variables son públicas en el navegador.

3. Inicia el backend en una terminal:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

4. En otra terminal, inicia el frontend:

```powershell
cd frontend
npm.cmd ci
npm.cmd run dev
```

Abre [el dashboard local](http://localhost:5173). La API se consulta en `http://localhost:8000`. Para cambiar esa URL, copia `frontend/.env.example` a `frontend/.env.local` y modifica únicamente `VITE_API_BASE_URL`. Reinicia Vite después de cambiar sus variables. Reinicia el backend después de cambiar el token.

**Si tenías una versión anterior en ejecución, reinicia ambos procesos.** El frontend exige el encabezado `X-PFGP-Privacy: aliases-v1` para evitar mostrar respuestas antiguas con identidades directas.

## Uso

- El período inicial va del primer día del mes al día actual de Bogotá. Cambia las fechas y pulsa **Aplicar período**. Las fechas sin aplicar no cambian el informe visible.
- La pantalla inicial muestra **todos los contratos devueltos para el período**, con búsqueda, orden y páginas de 8. Pulsa **Ver contrato** para abrir sus indicadores, gráficos, auditoría y episodios. **Volver a contratos** conserva la búsqueda y página del listado. Cambiar las fechas vuelve al catálogo del nuevo período.
- **Actualizar listado** refresca el catálogo. Abrir un contrato y **Actualizar corte** consultan de nuevo Eklipse. Buscar, ordenar y paginar dentro de cada vista no vuelven a consultar el origen. El listado y el detalle pueden corresponder a momentos distintos, indicados en la interfaz.
- Los gráficos incluyen sus datos en tablas accesibles. El scatter abre el detalle al seleccionar un punto; también se puede abrir desde la tabla con teclado.
- Pulsa el alias del episodio o **Ver detalle** en la tabla inferior para abrir el modal de servicios auditados. Incluye resumen financiero, ID repetidos, servicios con valor cero, filtros por tipo, búsqueda por nombre/código/ID y páginas de 20 registros. Buscar, filtrar y paginar en el modal no consulta de nuevo Eklipse. Se cierra con Escape, el botón de cierre o el fondo; el foco vuelve al control que lo abrió.
- Debajo de los gráficos, el **simulador de renegociación** permite excluir terapia VAC, insumos laparoscópicos y mallas/slings. Usa el contrato abierto, el período aplicado y el centro 99. Cada interruptor recalcula el traslado a Evento y la ejecución por agrupador; **Simular escenario** consulta la base sin exclusiones. No modifica la facturación. Cambiar de contrato, período o actualizar el corte reinicia el escenario.
- **Exportar resumen** descarga todos los agrupadores del informe en CSV, sin episodios. Se neutralizan fórmulas de hoja de cálculo.
- Los episodios usan alias temporales; no se exponen nombres, ingresos reales ni fechas individuales. Sus métricas financieras siguen siendo información restringida. Esta versión es para uso local; no tiene autenticación de usuarios del dashboard.

## API y estados

```text
GET /api/v1/pfgp-analytics/contratos?inicio=YYYY-MM-DD&final=YYYY-MM-DD&centroId=99
GET /api/v1/pfgp-analytics/dashboard?inicio=YYYY-MM-DD&final=YYYY-MM-DD&centroId=99&idContrato=ID
GET /api/v1/pfgp-analytics/episodio/ORDINAL?inicio=YYYY-MM-DD&final=YYYY-MM-DD&centroId=99&idContrato=ID&revision=REVISION
POST /api/v1/pfgp-analytics/simulador-exclusiones
GET /health
```

Las fechas son obligatorias y deben existir en el calendario; inicio no puede superar final. El centro acepta únicamente 99. El detalle seleccionado conserva las seis secciones solicitadas. El catálogo devuelve `inicio`, `final`, `centroId`, `totalContratos` y `contratos` con metadatos e importes de cabecera, sin episodios. Por compatibilidad, `/dashboard` sin `idContrato` conserva el informe si hay un contrato; si hay varios devuelve el catálogo, sin error ni selección automática. `episodios[].consecutivoIngreso` ahora es un ordinal local, `paciente` es un alias y `fechaIngreso` es una cadena vacía: cambio deliberado de semántica por privacidad.

El POST del simulador recibe JSON con `inicio`, `final`, `centroId`, `idContrato` y los booleanos `excluirTerapiaVAC`, `excluirLaparoscopiaAvanzada` y `excluirMallasSling`. Si hay varios contratos, es obligatorio seleccionar uno. Las reglas buscan nombres bajo el código `MEDICAMENTOS` y solo trasladan importes de agrupadores con límite positivo distintos de EVENTOS (ID 1). El porcentaje de alivio usa la suma de la facturación original de los agrupadores como denominador.

El detalle de servicios usa el ordinal público del episodio y `metadata.revision` del informe abierto; nunca recibe el ingreso real. Verifica la revisión del origen antes de resolver el alias. Si el corte cambió o el backend se reinició, devuelve 409 y pide **Actualizar corte**, evitando abrir otro episodio por un cambio de orden. La respuesta solo incluye el alias, métricas, auditoría y campos de servicios permitidos. Los ID repetidos se detectan dentro de cada registro de episodio, sin mezclar ingresos repetidos entre agrupadores.

| Estado | Interpretación |
| --- | --- |
| 200 | Catálogo (incluso vacío) o informe seleccionado validado, con `Cache-Control: no-store`. |
| 404 | No hay datos para el contrato o rango solicitado en el detalle. |
| 409 | Catálogo con ID de contrato repetido o revisión del corte desactualizada al abrir servicios. |
| 422 | Fechas o centro inválidos. |
| 503 | Token ausente o rechazado por Eklipse; revisar `EKLIPSE_TOKEN` localmente. |
| 502 | Fallo de conexión o respuesta incompatible; no se devuelve la excepción del proveedor. |

## Validación

```powershell
.\.venv\Scripts\python.exe -m pytest -q
cd frontend
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
```

Las pruebas del backend requieren `pytest` (`python -m pip install pytest` en el entorno de desarrollo). Las pruebas de navegador utilizan Google Chrome instalado, inician Vite localmente e interceptan las consultas con fixtures sintéticos exclusivos de pruebas. Esos fixtures no se importan en la aplicación.

Resultado del 4 de noviembre de 2026: **29 pruebas de backend, 16 unitarias de frontend y 11 flujos de navegador**. Compilación de producción correcta. Axe verificó las reglas WCAG 2 A/AA y 2.1 AA en tres tamaños, en claro y oscuro; se revisaron capturas. Esto no equivale a una certificación integral de accesibilidad ni a validación de métricas clínicas.

La comprobación del origen encontró inicialmente un problema de confianza TLS; con certificados del sistema Eklipse respondió **401**. El cliente ya admite token Bearer. La comprobación de conexión inicial registró `token_ausente_o_rechazado`; **esa comprobación no validó un informe real**; el cambio de selección de contratos se verificó con fuentes sintéticas aisladas. No se almacenó ni imprimió información de pacientes.

Para comprobar únicamente el estado de la conexión después de configurar el token:

```powershell
.\.venv\Scripts\python.exe -B -m scripts.check_connection
```

Vite advierte que el módulo de gráficos supera 500 kB sin comprimir. Se carga de forma diferida y solo importa los tipos de gráfico utilizados; queda pendiente medir con volúmenes reales. Starlette emite una advertencia de deprecación del adaptador de pruebas HTTPX, sin fallos de pruebas.

## Estructura y documentación

```text
app/                        FastAPI, configuración, adaptador Eklipse y motor existente
frontend/src/api/           Contrato Zod, tipos y transporte HTTP
frontend/src/hooks/         Consulta y cancelación con TanStack Query
frontend/src/components/    KPIs, gráficos, auditoría, tabla y diálogo
frontend/src/lib/           Formatos, IQR, Pareto y exportación
frontend/e2e/               Pruebas de navegador; datos sintéticos separados
tests/                     Pruebas del backend sin acceso a la red
scripts/check_connection.py Diagnóstico que imprime solo un estado seguro
docs/                      Cambios, alcance metodológico y pendientes
```

- [Implementación y límites del dashboard](docs/DASHBOARD_EJECUTIVO.md).
- [Cambios del backend y su impacto](docs/CAMBIOS_BACKEND.md).
- [Pendientes priorizados](docs/PENDIENTES.md).
- [Criterios visuales](DESIGN.md).
