# Auditoría Eklipse y dashboard local · 5 de noviembre de 2026

**Estado: auditoría parcial; verificación visual adicional bloqueada.** Parámetros solicitados a la API y al módulo local: **1 al 31 de octubre de 2026**, centro **99**. Estos parámetros y su repetición en metadatos no acreditan por sí solos las fechas efectivamente aplicadas por el proveedor. En Eklipse se observó el centro **TODOS**, cuya correspondencia con el código 99 no se pudo verificar. Las fechas de este informe corresponden a Bogotá. Se contrastaron agregados de la respuesta actual con la interfaz de Eklipse y el archivo `data/data.ts`; no se completó la comprobación de la interfaz local en este turno.

Este documento conserva únicamente importes, conteos y observaciones agregadas. No contiene respuestas completas, identificadores de ingresos, nombres de pacientes, documentos, camas ni credenciales.

## Regla de consulta confirmada

El usuario confirmó el 5 de noviembre de 2026 que **todas las consultas deben realizarse siempre con `centroId=99`**. Aplica a catálogo, dashboard, detalle de episodios y simulador. El frontend ya utiliza ese valor y el backend rechaza otros centros con HTTP 422 antes de consultar Eklipse; se verificó esta restricción mediante lectura del código.

La correspondencia visual entre «TODOS» y el código 99 queda pendiente únicamente para explicar la comparación con la pantalla de Eklipse. No es una decisión de configuración pendiente ni autoriza consultar con otro centro.

## Fuentes y alcance de la evidencia

| Fuente | Identificación | Estado y límite |
| --- | --- | --- |
| Archivo de referencia | `data/data.ts`, copia analizada antes de la consulta actual | Agregados confirmados. El archivo no conserva las fechas de consulta ni un momento de extracción verificable; no se presupone que sea idéntico al rango actual. |
| API actual de Eklipse | Solicitud del 1 al 31 de octubre de 2026, centro 99 | Agregados de Municipios confirmados durante la sesión. Parámetros efectivamente aplicados por el proveedor y hora de extracción verificable pendientes. |
| Interfaz de Eklipse | Página autenticada `legacy34` en Chrome | Se observaron los catálogos Facturado y Acostado. La actualización terminó y Facturado conservó sus importes iniciales. Los controles muestran centro TODOS y rango marcado inválido. |
| Módulo local | Agregados actuales usados para el contraste | Acostado de Municipios coincide con Eklipse; Facturado de Municipios difiere. La interfaz local no se probó en este turno. |

“Confirmado” describe una observación comprobada; no implica una explicación de su causa. “Pendiente” identifica una comprobación que todavía no se ha completado. Las pruebas automatizadas previas del proyecto validan lógica y flujos con datos sintéticos, pero no sustituyen esta comparación con el origen actual.

## Hallazgos confirmados

### H01 · Diferencia de Municipios entre archivo/UI del origen y respuesta de la API

Contrato **761 · Municipios**:

| Indicador | Archivo de referencia | API actual | Diferencia |
| --- | ---: | ---: | ---: |
| Facturación total | $372.453.246 | $414.590.185 | **+$42.136.939** |
| Registros de episodio | 64 | 64 | 0 |
| Filas de servicios | 4.836 | 5.466 | **+630** |

La variación de facturación se distribuye así:

| Agrupador | Diferencia entre API actual y archivo |
| --- | ---: |
| Internación quirúrgica | +$26.987.654 |
| Cirugía ambulatoria | +$7.982.942 |
| EVENTOS | +$7.166.343 |
| **Total** | **+$42.136.939** |

Las tres diferencias suman exactamente la diferencia de cabecera. Ambas fuentes contienen 64 episodios y la respuesta de la API contiene 630 filas de servicios más. Esto confirma importes y conteos distintos entre fuentes; **no acredita todavía** si provienen del rango consultado, actualización del origen, inclusión de servicios adicionales u otra regla de selección. Tampoco prueba duplicidad indebida o error del dashboard.

**Acción de comprobación:** contrastar filtros y totales visibles en Eklipse con la respuesta actual, y después compararlos con el dashboard local utilizando el mismo contrato y período. Mantener separados el archivo anterior y la consulta actual; no usar los importes del archivo como resultado esperado obligatorio para una consulta posterior.

### H02 · La interfaz de Eklipse no acredita equivalencia de filtros con la API

En la página autenticada de Eklipse se observaron los siguientes valores; los importes de Facturado permanecieron iguales después de completar la actualización:

| Elemento visible | Observación |
| --- | --- |
| Contrato | Municipios |
| Facturación | $372.453.246 |
| Episodios / agrupadores | 64 / 10 |
| Centro | **TODOS**; su correspondencia con el código 99 de la API no fue verificada |
| Fecha inicial / final en los controles | 1/10/2026 / 31/10/2026 |
| Validación del rango | Aviso **“El rango no es valido”**; control de fecha final marcado `ng-invalid` |

El importe visible coincide con el archivo anterior, pero la equivalencia de centro no está acreditada y el formulario informa un rango inválido. Por ello, la cifra visible todavía no prueba qué parámetros produjeron la tabla ni puede compararse como si procediera de una consulta válida de centro 99. **No se ha confirmado un problema de caché.**

Se realizaron tres intentos de abrir calendario sin observar un calendario desplegado. El botón de actualización sí inició y completó una operación: la tabla desapareció durante la carga, apareció el indicador de progreso y el botón quedó deshabilitado; después volvió el catálogo Facturado con los mismos importes. En consola se observaron dos errores Angular `NG0201` en el wrapper 2.2; su relación con la validación de fechas, el calendario o la actualización no está demostrada.

El selector de centro ofreció **TODOS**, **CLINICA MEDICOS SA**, **ALTA COMPLEJIDAD** y **CAPS MEGAMALL**. No se verificaron los códigos internos correspondientes.

### H03 · Totales visibles en Facturado después de actualizar

| Contrato | Facturación | Episodios | Recuperación | Presupuesto | Ejecución visible |
| --- | ---: | ---: | ---: | ---: | ---: |
| Municipios | $372.453.246 | 64 | $7.133.548 | $1.047.836.594 | 35,54 % |
| Valledupar | $1.993.597.771 | 575 | $47.829.498 | $2.008.742.687 | 99,25 % |
| **Total visible** | **$2.366.051.017** | **639** | **$54.963.046** | — | — |

La interfaz mantuvo el total de Municipios observado al inicio, mientras que la consulta actual utilizada por el módulo reporta $414.590.185. El refresco completado no explica por sí solo la diferencia ni demuestra que el origen haya aplicado correctamente los controles visibles.

### H04 · Acostado de Municipios coincide con el módulo actual

Se abrió el catálogo **Acostado** mediante la interfaz y se observaron estos agregados:

| Contrato | Valor en Acostado | Registros | Presupuesto visible | Diferencia visible | Ejecución visible | Diferencia porcentual visible |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Municipios | **$5.881.148** | **4** | $1.047.836.594 | $1.041.955.446 | 0,56 % | 0 % |
| Valledupar | $118.230.087 | 39 | — | — | 5,89 % | 0 % |

Los $5.881.148 y cuatro registros de Municipios **coinciden con el componente Acostado del módulo actual**. Esta coincidencia es parcial: no resuelve la diferencia de Facturado. Las celdas con raya no se verificaron visualmente en esta comprobación. El 0 % visible de “Diferencia porcentual” se registra sin atribuirle una fórmula que no ha sido confirmada.

## Matriz de comprobaciones

| ID | Comprobación | Criterio de aceptación | Estado | Evidencia / resultado |
| --- | --- | --- | --- | --- |
| T01 | Período y centro en Eklipse | Filtros aplicados del 01/10/2026 al 31/10/2026 y centro 99 | No acreditado | Controles muestran octubre completo, rango inválido y centro TODOS. Mapeo de TODOS a 99 no verificado. |
| T02 | Contrato seleccionado | Identidad contractual coincide entre Eklipse, API y dashboard | Parcial | API: contrato 761 Municipios; UI Eklipse: Municipios. Selección local pendiente. |
| T03 | Cabecera de Municipios | UI del origen y módulo muestran el total de la misma consulta | Importes distintos observados | API/módulo: $414.590.185; UI antes y después de refrescar: $372.453.246. Equivalencia de filtros no acreditada; causa pendiente. |
| T04 | Variación por agrupador | Suma de variaciones explica la diferencia de cabecera | Confirmado | $26.987.654 + $7.982.942 + $7.166.343 = $42.136.939. |
| T05 | Episodios y servicios | Conteos de cada extracción quedan identificados sin confundir sus cortes | Confirmado | 64 episodios en ambas; 4.836 → 5.466 filas de servicios. |
| T06 | Cabecera de Valledupar | Totales actuales coinciden entre origen y dashboard | Parcial | UI: $1.993.597.771, 575 episodios, $47.829.498 recuperados; comparación de interfaz local pendiente. |
| T07 | Presupuestos | Separar `totalContratado` de suma de límites y verificar denominadores | Parcial | UI Facturado: $1.047.836.594 Municipios y $2.008.742.687 Valledupar. Periodicidad contractual y comparación local pendientes. |
| T08 | Conciliación | Diferencia residual considera facturado y recuperado | Pendiente | Registrar conteos y monto residual de la consulta actual, sin identificar episodios. |
| T09 | Exposición con `acostado` | Componentes, disponibilidad y solapamientos se presentan con su estado | Parcial | UI Acostado Municipios: $5.881.148 y 4 registros, coincidentes con el módulo. Exposición combinada y solapamientos no verificados en UI. |
| T10 | Selector temporal local | Cambia referencia 30 días/calendario sin modificar datos observados | Pendiente | Para octubre, calendario utiliza 31 días. |
| T11 | Simulador local | Usa porción entidad, preserva conservación de importes y verifica revisión | Pendiente | No ejecutar cambios en facturación del origen. |
| T12 | Errores y actualización | Un cambio de revisión exige actualizar antes de detalle o simulación | Pendiente | Registrar comportamiento observado, sin provocar cambios en el origen. |
| T13 | Privacidad | Interfaz local y exportación no exponen identidades directas | Pendiente | Revisión visual y de campos permitidos; no guardar datos personales como evidencia. |
| T14 | Calendario y validación en Eklipse | Es posible seleccionar y aplicar un rango válido | Bloqueado para continuar | Tres intentos sin calendario visible; fecha final inválida. Dos errores `NG0201` observados, sin causalidad demostrada. |
| T15 | Actualización en Eklipse | La consulta termina y permite identificar filtros y resultado | Parcial | Carga terminada; volvió Facturado con los mismos importes. Los parámetros efectivamente aplicados siguen sin verificarse. |

## Límites de la sesión y próximos pasos

La herramienta de control del navegador impidió continuar al intentar verificar la aplicación nativa Chrome y su URL en Windows. La revisión quedó **parcial y bloqueada para ampliar la evidencia visual**; no se declara una prueba completa de la página. No se guardaron capturas de pantalla. No se probaron exportaciones, detalles de episodios ni la interfaz local durante este turno.

Para cerrar la comparación se requiere:

1. Verificar la correspondencia entre el centro visible y su código, y conseguir un rango aceptado por el formulario.
2. Identificar los parámetros efectivamente enviados por Eklipse al actualizar, sin registrar credenciales ni datos personales.
3. Repetir el contraste de Facturado y Acostado con esos mismos parámetros y una extracción identificable.
4. Contrastar la interfaz local, su selector temporal, conciliación, simulador, detalles y exportación con la respuesta correspondiente.

La revisión visual no modificó la facturación ni los datos del origen. En una fase posterior se implementaron las mejoras locales de trazabilidad y conciliación descritas a continuación. La causa de la diferencia de Facturado debe demostrarse antes de modificar la interpretación de la respuesta del proveedor.

## Seguimiento de mejoras a partir de la auditoría

| Prioridad | Mejora | Estado | Motivo y condición |
| --- | --- | --- | --- |
| Alta | Identificar rango solicitado, centro y recepción de respuesta | **Implementada en el módulo local** | Catálogo y detalle presentan centro 99 y recepción del backend en Bogotá. Las fechas efectivas, actualización y corte del proveedor continúan pendientes de confirmar. |
| Alta | Conservar el contexto del informe al editar filtros | **Implementada en el módulo local** | El borrador de fechas no reemplaza el rango solicitado del informe hasta aplicar una consulta. El selector temporal no modifica recepción ni revisión. |
| Alta | Conciliar cabecera, agrupadores y episodios | **Implementada en el módulo local** | Comparaciones independientes, con estados explícitos y tolerancia de $0,01. Las diferencias opuestas permanecen visibles por agrupador y se suman en valor absoluto, sin duplicar los balances del contrato. |
| Media | Mostrar juntos episodios y servicios | **Implementada en el módulo local** | Permite observar cambios de volumen de detalle aunque no cambie la cantidad de episodios. |
| Media | Identificar el contrato del simulador mediante su código público | **Implementada en el módulo local** | El ID interno continúa como parámetro de API; la interfaz muestra el código del contrato abierto. |
| Media | Exportar contexto y balances agregados | **Implementada en el módulo local** | CSV con recepción UTC, centro, revisión, conteos, diferencias y estados; mantiene una fila de contexto cuando no hay agrupadores. |
| Alta | Acreditar filtros efectivos de Eklipse y equivalencia del centro | **Pendiente en el origen** | El centro visible TODOS no está relacionado de forma verificada con el código 99; el rango se observó inválido. |
| Alta | Resolver el desfase de Facturado de Municipios | **Pendiente de causa demostrada** | Persisten $414.590.185 en API/módulo frente a $372.453.246 en la interfaz observada. Las mejoras locales conservan los importes recibidos. |
| Alta | Revisar calendario y validación de Eklipse | **Pendiente en el origen** | Reproducir y aislar el formulario antes de atribuir una causa técnica. |
| Media | Aislar errores Angular `NG0201` | **Pendiente de evidencia** | Determinar componente y reproducibilidad sin asociarlos todavía con el desfase financiero. |

La implementación local mejora la capacidad de explicar y repetir comparaciones; **no resuelve ni oculta el desfase de $42.136.939**. La matriz T01–T15 conserva el estado de la auditoría visual del origen. La validación del código posterior se registra de forma separada en el README y no sustituye las comprobaciones pendientes de Eklipse.

Se añadieron escenarios de navegador sintéticos para contexto de consulta, diferencias opuestas con episodios completamente conciliados, bases ausentes y exportación. La suite contiene **20 escenarios escritos, no ejecutados mediante runner en esta fase**.

## Validación posterior de las mejoras locales

Esta validación se distingue de la auditoría visual parcial de Eklipse. Las comprobaciones de interfaz siguientes utilizaron **datos sintéticos** en `http://127.0.0.1:5199`, mediante control manual del navegador.

| Comprobación | Resultado confirmado | Alcance |
| --- | --- | --- |
| Backend | **108 pruebas aprobadas** | Pruebas automatizadas aisladas del origen. |
| Frontend | **31 pruebas unitarias aprobadas y compilación correcta** | Contrato de datos, cálculos, transporte, formatos y exportación. |
| Pydantic → Zod | Contrato 761 aceptado por ambos esquemas | Comprobación local sin red. |
| Balances sobre archivo de referencia | **25 agrupadores, 639 episodios; todos los balances nuevos conciliados con diferencia cero** | Ambos contratos procesados localmente. El timestamp generado es de ejecución local, no prueba de consulta actual. |
| Catálogo y fechas | Selección del 1 al 31 de octubre; el aviso de borrador conserva el informe abierto | Escenario sintético mediante controles accesibles. |
| Recepción y centro | `20:30Z` presentado como **15:30 de Bogotá**, con centro 99 | Recepción fija del fixture, identificada de forma separada del corte del proveedor. |
| Diferencias opuestas | TEST-PFGP-101: contrato con diferencia neta cero, agrupadores +$100/−$100, **dos diferencias y $200 absolutos** | Los episodios concilian al 100 %; la interfaz mantiene visibles las diferencias de agrupadores. |
| Bases ausentes | TEST-PFGP-102 muestra **N/D / No evaluable** | No convierte la ausencia en cero conciliado. |
| Contrato conciliado | TEST-PFGP-100 presenta balances conciliados | Escenario sintético de control. |
| Selector calendario | Octubre completo muestra 100 % de avance de referencia; **cuatro consultas antes y después del cambio** | El selector no realiza extracción adicional ni modifica los importes observados. |
| CSV | Descargado y verificado con recepción, rango, referencia, centro 99, signos +100/−100 y absoluto 200 | Datos agregados sintéticos, sin identidades de pacientes. |
| Simulador | Contexto muestra código **TEST-PFGP**; escenario sin exclusiones correcto: **$1.200.000 = $1.200.000 + $0** | Flujo con mocks; no acredita una simulación contra el origen ni una nueva revisión completa de todas las reglas del motor. |
| Detalle de servicios | Apertura y cierre correctos del **Episodio 0001** sintético | Flujo con mocks; no se utilizaron identidades reales. |
| Centro fijo en transporte | **Ocho solicitudes** entre catálogo, dashboard, episodio y simulador utilizaron **99** | Observación de los cuatro flujos sintéticos; no valida el mapeo del centro TODOS en Eklipse. |
| Vista móvil | Ancho de 390 px, sin desbordamiento global; tablas con desplazamiento propio | Revisión manual, sin atribuir una nueva ejecución Axe. |
| Modo oscuro y cierre de pestaña de prueba | Modo oscuro verificado; pestaña de prueba cerrada y viewport restaurado | Revisión manual con datos sintéticos. |

Se guardaron exclusivamente capturas sintéticas locales, ignoradas por Git:

- `frontend/test-results/audit-ui/conciliacion.jpg`.
- `frontend/test-results/audit-ui/movil.jpg`.
- `frontend/test-results/audit-ui/oscuro.jpg`.

El CSV se corrigió para usar la cabecera auditada en **Facturado COP** y dejar facturación y ejecución vacías si falta esa cabecera. La prueba unitaria añadida elevó el resultado actual a **31 unitarias**, con compilación nuevamente correcta. Así se conserva la ausencia en lugar de exportar un cero heredado.

La comprobación manual aprobada no equivale a ejecutar los 20 escenarios e2e escritos. Tampoco completa T01–T15 sobre el origen ni explica el desfase de $42.136.939. No se alteraron los valores recibidos para hacer coincidir las fuentes.

## Referencias del proyecto

- [Metodología del dashboard](DASHBOARD_EJECUTIVO.md).
- [Contrato de API y cambios del backend](CAMBIOS_BACKEND.md).
- [Pendientes de validación de negocio](PENDIENTES.md).
- [Uso y validación del proyecto](../README.md).
