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
- El catálogo y el detalle identifican **Rango solicitado**, **Consulta recibida** en Bogotá y **Centro 99**. La recepción corresponde al backend y no acredita la fecha de actualización o corte histórico del origen. Editar fechas sin aplicarlas o cambiar la referencia temporal conserva el contexto del informe abierto.
- El resumen distingue **presupuesto contractual reportado** (`totalContratado`) y suma de límites de agrupadores. La ejecución contractual usa el primero; su periodicidad continúa sin confirmar. La exposición añade `acostado` bajo el supuesto visible de que ambos bloques pertenecen al mismo corte. Si falta información o hay ingresos compartidos, la suma no se presenta como disponible.
- El selector **30 días / Mes calendario** cambia la facturación normalizada sobre el mismo corte, sin consultar de nuevo Eklipse ni modificar presupuestos. Calendario se deshabilita para rangos entre meses. La normalización es una referencia lineal, no un cierre mensual validado.
- Los gráficos incluyen sus datos en tablas accesibles. El scatter abre el detalle al seleccionar un punto; también se puede abrir desde la tabla con teclado.
- El análisis incorpora causas de desviación por volumen, valor por evento y base presupuestal; concentración de episodios; mediana/P90 por agrupador; IQR por agrupador y Pareto sobre el total completo de servicios.
- Pulsa el alias del episodio o **Ver detalle** en la tabla inferior para abrir el modal de servicios auditados. Incluye resumen financiero, ID repetidos, servicios con valor cero, filtros por tipo, búsqueda por nombre/código/ID y páginas de 20 registros. Buscar, filtrar y paginar en el modal no consulta de nuevo Eklipse. Se cierra con Escape, el botón de cierre o el fondo; el foco vuelve al control que lo abrió.
- Debajo de los gráficos, el **simulador de renegociación** permite excluir terapia VAC, insumos laparoscópicos y mallas/slings. Usa el contrato abierto, el período aplicado y el centro 99. Cada interruptor recalcula el traslado a Evento y la ejecución por agrupador; **Simular escenario** consulta la base sin exclusiones. No modifica la facturación. Cambiar de contrato, período o actualizar el corte reinicia el escenario.
- El simulador descuenta solo **cantidad × valorEntidad**; informa aparte porción paciente y bruto. Exige la revisión del dashboard y rechaza escenarios incompletos o importes trasladados superiores a la cabecera. El traslado representa reclasificación, no ahorro ni recaudo adicional confirmado.
- Las alertas usan la **diferencia residual**: detalle de servicios menos facturado y recuperado, con tolerancia de $0,01. El detalle conserva la diferencia bruta y muestra las porciones entidad/paciente; recuperación no acredita recaudo.
- **Conciliación entre niveles** compara contrato contra agrupadores, contrato contra episodios y cada agrupador contra sus episodios. Diferencias opuestas se mantienen visibles, incluso si el total contractual concilia. Las bases ausentes se indican como **No evaluable / N/D**. El porcentaje de conciliación episodio-servicios sigue siendo una comprobación separada.
- **Exportar resumen** descarga todos los agrupadores del informe en CSV, con presupuesto, referencia temporal, recepción UTC, centro, revisión, conteos e indicadores de conciliación. Si no hay agrupadores, conserva una fila de contexto contractual. No exporta identidades ni fechas individuales y se neutralizan fórmulas de hoja de cálculo.
- Los episodios usan alias temporales; no se exponen nombres, ingresos reales ni fechas individuales. Sus métricas financieras siguen siendo información restringida. Esta versión es para uso local; no tiene autenticación de usuarios del dashboard.

## Configurar un contrato existente

La ruta `#/contratos/nuevo` permite seleccionar un detalle contractual existente en Eklipse y registrar su presupuesto, fechas, tipo de asociación de servicios y agrupadores PFGP. No crea el maestro contractual. El centro permanece en **99** y los contratos ya configurados no admiten una segunda configuración, incluso con fechas distintas. El presupuesto y la suma de límites pueden diferir.

Esta función necesita integrar el endpoint externo entregado en `integrations/eklipse-nestjs/`. En el backend local, `EKLIPSE_CONTRACTS_URL` debe señalar a `/v1/pfgp/contratos`; sin configuración devuelve 503. Reutiliza la credencial del backend, y el origen exige una autoridad de escritura nueva y explícita. La entrega no despliega ni escribe en la base real. Los pasos, restricciones temporales y comprobaciones previas se detallan en [Configuración PFGP de contratos existentes](docs/REGISTRO_CONTRATOS_PFGP.md).

Si el guardado queda sin confirmar, no se repite automáticamente. Se actualizan las opciones para comprobar si existe la configuración y se revisa el origen antes de decidir otro intento. Un contrato configurado puede seguir ausente del catálogo analítico si no tiene facturación en el período.

## API y estados

```text
GET /api/v1/pfgp-analytics/contratos?inicio=YYYY-MM-DD&final=YYYY-MM-DD&centroId=99
GET /api/v1/pfgp-analytics/dashboard?inicio=YYYY-MM-DD&final=YYYY-MM-DD&centroId=99&idContrato=ID
GET /api/v1/pfgp-analytics/episodio/ORDINAL?inicio=YYYY-MM-DD&final=YYYY-MM-DD&centroId=99&idContrato=ID&revision=REVISION
POST /api/v1/pfgp-analytics/simulador-exclusiones
GET /api/v1/pfgp-contracts/opciones?centroId=99
POST /api/v1/pfgp-contracts
GET /health
```

Las fechas son obligatorias y deben existir en el calendario; inicio no puede superar final. El centro acepta únicamente 99. El dashboard conserva las secciones anteriores y añade `resumenFinanciero`, `exposicion`, `conciliacion`, `conciliacionNiveles`, `referenciasTemporales`, `concentracion` y `paretoUniverso`. Sus metadatos incluyen `centroId` y `consultaRecibidaEn` en ISO UTC. El catálogo devuelve `inicio`, `final`, `centroId`, `consultaRecibidaEn`, `totalContratos` y `contratos` con metadatos, importes, resumen financiero y exposición, sin episodios. Por compatibilidad, `/dashboard` sin `idContrato` conserva el informe si hay un contrato; si hay varios devuelve el catálogo, sin error ni selección automática. `episodios[].consecutivoIngreso` es un ordinal local, `paciente` es un alias y `fechaIngreso` es una cadena vacía.

El POST del simulador recibe JSON con `inicio`, `final`, `centroId`, `idContrato`, **`revision` obligatoria** y los booleanos `excluirTerapiaVAC`, `excluirLaparoscopiaAvanzada` y `excluirMallasSling`. Si hay varios contratos, es obligatorio seleccionar uno. Las reglas buscan nombres bajo el código `MEDICAMENTOS` y solo trasladan importes de agrupadores con límite positivo distintos de EVENTOS (ID 1). El porcentaje trasladado usa la suma de la facturación original de los agrupadores como denominador. La respuesta incluye contexto y revisión verificables; `totalTrasladadoAEvento` representa la porción entidad, con paciente y bruto separados. Los clientes previos deben actualizarse.

El detalle de servicios usa el ordinal público del episodio y `metadata.revision` del informe abierto; nunca recibe el ingreso real. Verifica la revisión del origen antes de resolver el alias. Si el corte cambió o el backend se reinició, devuelve 409 y pide **Actualizar corte**, evitando abrir otro episodio por un cambio de orden. La respuesta solo incluye el alias, métricas, auditoría y campos de servicios permitidos. Los ID repetidos se detectan dentro de cada registro de episodio, sin mezclar ingresos repetidos entre agrupadores.

Los siguientes estados corresponden a las rutas analíticas. El registro de configuraciones devuelve 201 al guardar y distingue permisos, conflictos y escritura incierta según su [contrato de API](docs/REGISTRO_CONTRATOS_PFGP.md#flujo-local-y-api).

| Estado | Interpretación |
| --- | --- |
| 200 | Catálogo (incluso vacío) o informe seleccionado validado, con `Cache-Control: no-store`. |
| 404 | No hay datos para el contrato o rango solicitado en el detalle. |
| 409 | `DUPLICATE_CONTRACTS` o `STALE_REPORT`; el corte se verifica en detalle y simulador. |
| 422 | Petición inválida o `SCENARIO_NOT_CALCULABLE`, distinguidos por el cliente. |
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

**Validación del registro de configuración PFGP:** **186 pruebas de backend, 62 unitarias de frontend y 13 del paquete NestJS aislado aprobadas**, compilaciones TypeScript y Vite correctas. El parche pasó `git apply --check` sobre el commit de referencia; los lectores parcheados en memoria conservaron separados los detalles contractuales con datos sintéticos. La comprobación manual de Chrome contra un servidor sintético verificó éxito, conflicto, resultado incierto, navegación, importes exactos y móvil sin desbordamiento horizontal; el servidor de prueba quedó detenido. Los resultados y sus límites se registran en la [guía de configuración](docs/REGISTRO_CONTRATOS_PFGP.md#pruebas-y-estado-de-la-entrega). Esta comprobación no despliega el endpoint externo ni acredita una escritura en SQL Server.

Validación de la mejora financiera **anterior a la ampliación de trazabilidad y conciliación entre niveles**, el **5 de noviembre de 2026**: **85 pruebas de backend, 25 unitarias de frontend y 17 flujos de navegador aprobados**; compilación de producción correcta. Las comprobaciones Axe cubrieron reglas WCAG 2 A/AA y 2.1 AA en tres tamaños, en claro y oscuro; se revisaron capturas sintéticas de escritorio, móvil, simulador y detalle. Esto no equivale a certificación integral de accesibilidad ni a validación clínica. Las diferencias residuales muestran dos decimales para que una discrepancia de $0,02 no se presente como cero.

**Validación actual de trazabilidad y conciliación entre niveles:** **108 pruebas de backend y 31 unitarias de frontend aprobadas**, compilación de producción correcta y respuesta del contrato 761 aceptada de extremo a extremo por Pydantic y Zod en una comprobación local sin red. El archivo de referencia se procesó en memoria: **25 agrupadores y 639 episodios** entre ambos contratos; todos los balances nuevos entre contrato, agrupadores y episodios conciliaron con diferencia cero. El timestamp generado en esta comprobación identifica la ejecución local, no una recepción actual de Eklipse.

Se verificaron manualmente con control de navegador y datos sintéticos en `http://127.0.0.1:5199`: catálogo, rango solicitado del 1 al 31 de octubre, conservación de datos al editar fechas, recepción en Bogotá, balances con diferencias opuestas (+$100/−$100) y monto absoluto $200 aunque los episodios concilien al 100 %, bases ausentes N/D, contrato conciliado, selector calendario sin consultas adicionales, código público del contrato en el simulador y CSV con contexto, signos y totales sin identidades. También se comprobó el escenario sin exclusiones (`$1.200.000 = $1.200.000 + $0`), la apertura y cierre del detalle del episodio sintético 0001 y centro 99 en las ocho solicitudes observadas de catálogo, dashboard, episodio y simulador. En móvil de 390 px no se observó desbordamiento global; las tablas mantienen desplazamiento propio. El modo oscuro se verificó y la pestaña de prueba quedó cerrada con el viewport restaurado. Capturas sintéticas ignoradas por Git: `frontend/test-results/audit-ui/conciliacion.jpg`, `movil.jpg` y `oscuro.jpg`.

El CSV toma **Facturado COP** de la cabecera auditada del agrupador; cuando falta, conserva el campo vacío y omite su ejecución porcentual. Esto evita convertir una cabecera ausente en el cero predeterminado de campos antiguos. El caso cuenta con prueba unitaria y la compilación se repitió después de la corrección.

La suite automatizada ampliada contiene **20 escenarios analíticos y 6 de configuración de contratos escritos, no ejecutados con el runner en esta fase**. La comprobación manual actual no se presenta como una ejecución de esos casos ni como una nueva evaluación Axe. La discrepancia con la interfaz original de Eklipse sigue pendiente de causa demostrada, según la [auditoría](docs/AUDITORIA_EKLIPSE_2026-11-05.md).

En el entorno de ejecución Windows, al terminar los 17 casos fue necesario cerrar el proceso Vite creado por la prueba para liberar el cierre del runner; la ejecución terminó con código 0. No se cerraron procesos ajenos. La causa de ese comportamiento del entorno no se atribuye a un fallo funcional del dashboard.

**Comprobación local del archivo de octubre, 5 de noviembre de 2026:** los dos contratos validaron sus esquemas y los **639 episodios conciliaron**, con cero diferencias residuales. La ejecución contractual fue **99,25 % / 35,54 %**; incluyendo `acostado`, **104,71 % / 36,45 %**; disponibilidad **−$94.602.041 / $665.862.120**, para Valledupar y Municipios respectivamente. La comprobación procesó el archivo en memoria, sin red ni persistencia de identidades. No acredita una consulta autenticada actual de Eklipse ni confirma la periodicidad presupuestal o el corte histórico de `acostado`.

La comprobación del origen encontró inicialmente un problema de confianza TLS; con certificados del sistema Eklipse respondió **401**. El cliente ya admite token Bearer. La comprobación de conexión inicial registró `token_ausente_o_rechazado`; **esa comprobación no validó un informe real**; el cambio de selección de contratos se verificó con fuentes sintéticas aisladas. No se almacenó ni imprimió información de pacientes.

Para comprobar únicamente el estado de la conexión después de configurar el token:

```powershell
.\.venv\Scripts\python.exe -B -m scripts.check_connection
```

Vite advierte que el módulo de gráficos supera 500 kB sin comprimir (aproximadamente 607 kB en esta compilación). Se carga de forma diferida y solo importa los tipos de gráfico utilizados; queda pendiente medir con volúmenes reales.

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
integrations/eklipse-nestjs/ Endpoint y ajuste de lectores para integrar en Eklipse
```

- [Implementación y límites del dashboard](docs/DASHBOARD_EJECUTIVO.md).
- [Cambios del backend y su impacto](docs/CAMBIOS_BACKEND.md).
- [Pendientes priorizados](docs/PENDIENTES.md).
- [Auditoría de Eklipse y comparación local](docs/AUDITORIA_EKLIPSE_2026-11-05.md).
- [Configuración PFGP de contratos existentes](docs/REGISTRO_CONTRATOS_PFGP.md).
- [Criterios visuales](DESIGN.md).
