# Configuración PFGP de contratos existentes

## Alcance acordado

El formulario configura un contrato **ya existente** en Eklipse. Selecciona un registro de `GENDETCON` y crea su configuración PFGP en `EKSLNCHPTCONT`, con los límites y cantidades de eventos de sus agrupadores en `EKSLNAGRUCONT`. No crea maestros `GENCONTRA`, detalles `GENDETCON`, terceros, servicios ni agrupadores.

La integración externa se entrega en `integrations/eklipse-nestjs/` para incorporarla al backend de Eklipse. La entrega local no despliega ese backend ni escribe en una base de datos real. La opción de escritura permanece deshabilitada si no se configura expresamente su endpoint y su autoridad de escritura.

## Referencia y decisiones de compatibilidad

La referencia de implementación es `eklipse-back-v1`, rama `sln`, commit `7ab7479cd04418233db4af5acbbd5b0e4b6d88bd`, módulo `8004/sln/apps/estadistico-pfgp`. Se consultó el código clonado de forma local; el clon no forma parte de los datos de la aplicación.

| Concepto | Persistencia y significado |
| --- | --- |
| Contrato elegido | `GENDETCON.OID`: detalle contractual. Es la referencia que utiliza `EKSLNCHPTCONT.GENDETCON`. |
| Maestro contractual | `GENCONTRA.OID`: entidad distinta, relacionada desde `GENDETCON.GENCONTRA1`. Sus ID no se intercambian con los del detalle. |
| Configuración PFGP | `EKSLNCHPTCONT`: presupuesto reportado, fechas registradas y tipo de asociación de servicios. |
| Agrupadores de la configuración | `EKSLNAGRUCONT`: agrupador, límite y cantidad de eventos contratados, ligados al checkpoint. |
| Tipo de asociación | Valores existentes de `EKSLNAGRUSERVTIP`; los agrupadores seleccionados deben pertenecer al tipo elegido. |
| EVENTOS | ID 1 reservado; no se ofrece como agrupador presupuestal configurable. |

El lector de referencia toma el primer checkpoint del contrato. Por eso esta entrega permite **una única configuración por detalle contractual**, aunque una segunda petición proponga fechas diferentes o disjuntas. No incorpora edición, renovación ni eliminación de configuraciones existentes.

Las fechas se almacenan en los campos existentes `FECHINI` y `FECHFIN`. **No convierten al lector heredado en un selector por vigencia temporal**: consultar un rango no garantiza que el presupuesto se seleccione por esas fechas. La periodicidad presupuestal continúa pendiente de confirmación. Incorporar renovaciones requiere definir la selección temporal y migrar los lectores antes de admitir varias configuraciones.

Los lectores conservan los códigos estáticos de `CONTRATOS_PFGP` y añaden los códigos de detalles que tienen configuración. Persistir un checkpoint sin incorporar esta unión dejaría ciertos contratos fuera de las consultas. El catálogo analítico sigue dependiendo de la facturación del período: un contrato configurado sin facturas puede no aparecer allí; la pantalla de opciones permite comprobar que su configuración existe.

El descubrimiento reutiliza los checkpoints del informe cuando ya están disponibles, evitando otra consulta SQL para reconstruir la lista de códigos. El lector de acostado también resuelve sus checkpoints por los ID de detalle cuando se invoca sin un snapshot previo.

El parche también agrupa facturado y acostado por **ID de `GENDETCON`**, conserva el código y nombre de ese detalle y busca su checkpoint por la misma referencia. Así evita fusionar detalles distintos que compartan maestro, código o nombre. La consolidación de facturas del lector se limita al detalle contractual en proceso, sin recorrer y modificar de nuevo los demás contratos. Este ajuste de identidad contractual no demuestra la causa de la discrepancia monetaria previamente observada en Municipios.

En el módulo de referencia no se encontraron archivos `*.spec.ts` o `*.test.ts`. Su `package.json` declara Jest y ts-jest; esa declaración no acredita cobertura. El controlador `registro` incluye utilidades de desarrollo y una operación GET que vincula servicios con agrupadores. Esa operación no es el endpoint de alta de configuración PFGP y no se reutiliza para este flujo.

## Flujo local y API

La ruta del frontend es `#/contratos/nuevo`. El formulario carga contratos existentes, tipos y agrupadores desde el backend local. El centro se fija en **99** tanto al consultar opciones como al guardar; el usuario no lo cambia desde el formulario.

```text
GET  /api/v1/pfgp-contracts/opciones?centroId=99
POST /api/v1/pfgp-contracts

GET  /v1/pfgp/contratos/opciones?centroId=99    (Eklipse)
POST /v1/pfgp/contratos                       (Eklipse)
```

La respuesta de opciones tiene esta forma, con datos sintéticos:

```json
{
  "centroId": 99,
  "contratos": [
    { "id": 9001, "codigo": "TEST-PFGP-9001", "nombre": "Contrato de prueba", "configurado": false }
  ],
  "tipos": [{ "id": 7, "agrupadorIds": [2, 3] }],
  "agrupadores": [
    { "id": 2, "nombre": "Hospitalización" },
    { "id": 3, "nombre": "Cirugía" }
  ]
}
```

Los importes viajan como cadenas decimales para preservar hasta cuatro decimales; las cantidades de eventos admiten hasta dos. Los ejemplos y pruebas no utilizan datos personales ni credenciales. El presupuesto no tiene que ser igual a la suma de límites: ambos conservan su significado y la diferencia no representa dinero perdido.

Ejemplo sintético de petición de creación:

```json
{
  "centroId": 99,
  "contratoId": 9001,
  "valor": "1200000.0000",
  "fechaInicio": "2026-10-01",
  "fechaFin": "2026-10-31",
  "keyAgrupadorServicio": 7,
  "agrupadores": [
    { "agrupadorId": 2, "limite": "600000.1234", "cantidadEventosContratados": "10.33" },
    { "agrupadorId": 3, "limite": "400000", "cantidadEventosContratados": "4" }
  ]
}
```

La API acepta de 1 a 100 agrupadores únicos; sus ID y el ID de detalle contractual son enteros positivos, hasta `2147483647`. El ID de tipo puede ser cero y tiene el mismo máximo. Presupuesto, límites y cantidades de eventos deben ser positivos. El máximo contractual de la API es `922337203685477.5807` para importes y `9999999999999999.99` para eventos. Estos límites explícitos de entrada **no acreditan la precisión de las columnas instaladas**. La API exige cadenas de hasta 24 caracteres con formato decimal simple, punto y sin ceros iniciales innecesarios, separadores de miles ni notación exponencial; el formulario admite coma decimal y normaliza sin pasar por un número de coma flotante. Las fechas deben existir en el calendario, usar `YYYY-MM-DD`, estar entre `1753-01-01` y `9999-12-31`, y conservar inicio menor o igual que fin. La respuesta puede normalizar la representación decimal manteniendo el mismo valor.

Una creación confirmada devuelve HTTP **201**, el ID de configuración, la referencia y código del contrato, centro 99, fechas, tipo y valores persistidos. El cliente verifica la estructura de la respuesta. La respuesta de opciones incluye `configurado` para distinguir contratos disponibles de los ya configurados.

| Estado o código | Interpretación y acción |
| --- | --- |
| 503 `CONTRACT_REGISTRATION_UNAVAILABLE` | No se habilitó el endpoint de configuración o la integración no está disponible. |
| 503 `SOURCE_AUTH_REQUIRED` | El origen rechazó la autenticación. La credencial se revisa únicamente en el backend. |
| 403 `CONTRACT_WRITE_FORBIDDEN` | El origen denegó la autorización de escritura. No basta el permiso de consulta. |
| 503 `SOURCE_UNAVAILABLE` | No se pudo establecer la conexión antes del envío. |
| 502 `CONTRACT_OPTIONS_UNAVAILABLE` | No se pudieron consultar o validar las opciones. |
| 409 `CONTRACT_ALREADY_CONFIGURED` | El detalle contractual ya tiene configuración. Se actualizan las opciones para comprobarlo. |
| 422 `INVALID_CONTRACT_REFERENCE`, `INVALID_GROUP_REFERENCE`, `INVALID_SERVICE_TYPE` o `INVALID_CONTRACT_INPUT` | Referencias o campos inválidos; se corrige el formulario. |
| 502 `CONTRACT_WRITE_UNCONFIRMED` | La escritura pudo haberse completado, pero no existe una respuesta confirmada. No se repite automáticamente el POST. |

Ante un resultado incierto, actualizar opciones es una consulta de lectura. `configurado: true` confirma que existe una configuración; `false` no descarta que una operación anterior siga en curso. No equivale a una autorización para reenviar inmediatamente la misma creación. Hay que comprobar el estado en el origen antes de decidir un nuevo intento.

## Integración en Eklipse

El backend local requiere `EKLIPSE_CONTRACTS_URL` con la URL completa del endpoint `/v1/pfgp/contratos`. Sin ese valor, las rutas de registro devuelven 503. Reutiliza `EKLIPSE_TOKEN` exclusivamente en el servidor; no se publica en variables `VITE_*`, respuestas ni código del navegador.

La integración NestJS incorpora el DTO, servicio y controlador de contratos PFGP, y los ajustes de descubrimiento e identidad contractual en los lectores. Debe registrarse en el módulo existente. Ambos endpoints usan `CommonGuards` y la autoridad existente de estadístico PFGP. Además, el servicio exige **una autoridad nueva de escritura**, registrada y asignada por el equipo responsable mediante `PFGP_CONTRACT_WRITE_AUTHORITY`, tanto al cargar las opciones del formulario como al crear la configuración. Si no se define, ambos endpoints de configuración quedan deshabilitados. Esta condición no deshabilita las consultas analíticas existentes.

La creación utiliza una transacción con aislamiento serializable y bloqueo de la fila `GENDETCON` elegida. Comprueba que no exista configuración antes de insertar el checkpoint y sus hijos. Un fallo en cualquier inserción debe revertir el conjunto. Las solicitudes concurrentes al mismo contrato a través de este servicio deben producir una única configuración, sin checkpoints vacíos ni agrupadores parciales. El bloqueo no sustituye una restricción única frente a escritores externos que no sigan este protocolo. No se añade una tabla de control al esquema existente.

El servicio vuelve a comprobar referencias y asociaciones en el servidor. La validación del formulario no sustituye esos controles. La unidad atómica es checkpoint más todos sus agrupadores; la creación no modifica el catálogo de servicios ni sus asociaciones.

## Lista de integración y comprobación

1. Seguir las [instrucciones del paquete de integración](../integrations/eklipse-nestjs/README.md): copiar únicamente sus archivos `src/` al módulo de referencia. Revisar y comprobar `readers-and-module.patch` con `git apply --check` antes de aplicarlo. El parche registra servicio/controlador y ajusta ambos lectores, conservando el contexto y la conexión de la sesión autenticada. Los stubs de pruebas y la configuración del paquete aislado no se copian al módulo productivo.
2. Registrar una autoridad de escritura específica, asignarla solo a los roles autorizados y configurar `PFGP_CONTRACT_WRITE_AUTHORITY`. Comprobar que un usuario con permiso de lectura no puede crear configuraciones.
3. Revisar en un entorno de pruebas los metadatos SQL reales: tipos, precisión, escala, nulabilidad, valores predeterminados y relaciones. La entidad de eventos de la referencia declara escala 2 sin precisión explícita; el decorador no demuestra cómo está definida la columna instalada. La integración usa `decimal(18,2)` para eventos: si la columna física difiere, alinear NestJS, Python y frontend antes de habilitarla.
4. Compilar contra el proyecto completo de Eklipse y sus dependencias reales. Una comprobación aislada con NestJS/TypeORM no sustituye esta compilación.
5. Probar referencias inexistentes, ID de maestro en lugar de detalle, agrupadores repetidos, EVENTOS reservado, tipo desconocido y agrupador no asociado al tipo. Rechazar fechas inexistentes o invertidas y decimales fuera del formato permitido.
6. Probar cantidades fraccionarias de eventos, importes con cuatro decimales y presupuesto distinto de la suma de límites. No exigir una igualdad presupuestal que no forma parte de la decisión de negocio.
7. Verificar una transacción correcta y otra que falle al guardar hijos: la segunda no debe dejar datos parciales. Lanzar dos creaciones simultáneas sobre el mismo detalle y comprobar una sola configuración persistida.
8. Intentar una segunda configuración con fechas disjuntas; debe responder conflicto. Confirmar que ningún lector promete selección por vigencia temporal.
9. Crear en el entorno de pruebas un contrato cuyo código no esté en `CONTRATOS_PFGP` y comprobar el descubrimiento por los lectores. Verificar dos detalles del mismo maestro, incluso con etiquetas coincidentes: cada uno debe conservar su configuración e importes sin duplicar servicios del otro. Verificar por separado un contrato sin facturación, que puede seguir ausente del catálogo analítico del período.
10. Verificar fallos de autenticación, autorización, conexión, timeout y respuesta incompatible sin filtrar mensajes SQL ni credenciales. Un timeout posterior al envío debe preservar el estado incierto y evitar reintentos automáticos.
11. Habilitar `EKLIPSE_CONTRACTS_URL` en el backend local solo después de integrar y validar el endpoint. Verificar lectura y creación con el origen de pruebas autorizado antes de cualquier puesta en producción.

## Pruebas y estado de la entrega

Las pruebas de navegador del formulario usan interceptores HTTP y contratos sintéticos, separados de los fixtures analíticos. Cubren envío con centro 99, importes como cadenas, restricciones de selección, éxito, conflictos y escritura no confirmada. No apuntan a endpoints reales ni registran información de pacientes.

| Comprobación | Estado |
| --- | --- |
| Backend local | **186 pruebas aprobadas**, incluidas 78 nuevas del registro, sin acceso al origen real. |
| Frontend y compilación | **62 pruebas unitarias aprobadas** y compilación TypeScript + Vite correcta. Permanece el aviso conocido del módulo ECharts mayor de 500 kB. |
| Paquete NestJS aislado | **13 pruebas aprobadas** y comprobación TypeScript correcta con las versiones de referencia. `git apply --check` aprobado sobre el commit indicado; no se modificó el clon. |
| Lectores de referencia parcheados en memoria | Facturado y acostado comprobados con ORM simulados y datos sintéticos; detalles del mismo maestro o código permanecen separados con sus presupuestos. |
| E2e del registro | **6 escenarios escritos**, con tipos y sintaxis TypeScript comprobados; no ejecutados con el runner. |
| Navegador con datos sintéticos | Comprobación manual mediante control de Chrome aprobada en escritorio y viewport de 390 × 844; detalle de alcance a continuación. |

La comprobación manual usó un servidor HTTP sintético en `127.0.0.1:5198`, posteriormente detenido. Se verificaron campos vacíos, revisión previa y éxito 201 conservando `1000000.1234` y `8.33`, conflicto 409 con **Guardar configuración** deshabilitado, y resultado 502 incierto que bloquea el envío. La posterior consulta de opciones mostró el contrato configurado sin atribuir esa configuración al POST anterior. No hubo escritura en Eklipse.

También se comprobó que navegar al catálogo y regresar conserva la revisión, que el enlace de salto mantiene la ruta y lleva el foco al contenido principal, y que cambiar del tipo 7 al 8 retira agrupadores incompatibles. En móvil, el ancho desplazable coincidió con el disponible (375 px), sin desbordamiento horizontal global.

La captura de solicitudes mostró cuatro GET de opciones y tres POST únicos para los ID sintéticos 9001, 9002 y 9003, todos con centro 99. El único GET analítico ocurrió al visitar el catálogo; abrir directamente el formulario no consultó la analítica. Las capturas `frontend/test-results/registration-ui/success-desktop.jpg` y `form-mobile.jpg` son sintéticas y están ignoradas por Git. Esta comprobación manual no equivale a ejecutar los seis escenarios del runner ni a una evaluación Axe nueva.

La comprobación de lectores ejecutó su código de referencia con el parche aplicado en memoria. Facturado conservó presupuestos distintos, importes y recuperación por detalle, incluidas varias facturas del segundo contrato; los controles con el código original reprodujeron la fusión de contratos y la pérdida de facturas del segundo grupo. Acostado se verificó con y sin snapshot de checkpoints, incluida la resolución de los ID que faltaba en la consulta independiente heredada. Estas pruebas no usaron la base ni datos reales y no sustituyen la compilación del proyecto completo.

La integración no se ha desplegado ni ejecutado contra una base de datos real. La validación de los metadatos SQL, los permisos del proyecto, los bloqueos y rollback del motor, y la compilación en el proyecto completo de Eklipse corresponden al entorno de integración.

La discrepancia de $42.136.939 entre la interfaz original y la respuesta analizada de Municipios continúa pendiente de causa demostrada. Esta funcionalidad no modifica ese hallazgo ni acredita una corrección del origen. Véanse la [auditoría de Eklipse](AUDITORIA_EKLIPSE_2026-11-05.md), la [metodología del dashboard](DASHBOARD_EJECUTIVO.md) y los [pendientes](PENDIENTES.md).
