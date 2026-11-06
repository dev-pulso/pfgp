# Cambios de integración · 5 de noviembre de 2026

El backend FastAPI mantiene las rutas existentes y añade un contrato financiero explícito. El frontend valida estos campos mediante Zod. Los cambios corrigen bases de cálculo y preservan los alias temporales.

## Respuestas del catálogo y dashboard

El catálogo continúa devolviendo encabezados sin episodios. Cada contrato añade `resumenFinanciero` y `exposicion`. El contexto del catálogo añade `consultaRecibidaEn`, y los metadatos del dashboard añaden `centroId: 99` y `consultaRecibidaEn`. El timestamp ISO UTC se toma al recibir la respuesta del proveedor; no representa su corte histórico. No se incluye en la revisión HMAC, de modo que una nueva recepción de datos iguales no invalida por sí sola el informe.

El dashboard conserva sus secciones anteriores y añade:

| Bloque | Contenido |
| --- | --- |
| `resumenFinanciero` | Presupuesto contractual reportado, suma de límites, diferencia y cobertura, ejecución contractual y participación de EVENTOS. |
| `exposicion` | Estado de disponibilidad, registros e importe de `acostado`, suma combinada, ejecución, disponibilidad y conciliación contra el origen. |
| `conciliacion` | Episodios evaluables, conciliados, con diferencia y no evaluables; porcentaje conciliado y monto absoluto residual. |
| `conciliacionNiveles` | Balances de contrato contra agrupadores y episodios, balances de cada agrupador contra sus episodios, conteos por estado y monto absoluto de diferencias de agrupadores. |
| `referenciasTemporales` | Referencias `dias30` y `calendario`; calendario es nulo en rangos entre meses, con motivo explícito. |
| `concentracion` | Cantidades y porcentajes de los 10 episodios principales y del decil superior. |
| `paretoUniverso` | Total de servicios e importe completo, validez de porcentajes y resto fuera de los 10 principales. |

Los episodios añaden `idAgrupador`, `totalRecuperado`, `discrepanciaResidual`, `importeEntidadServicios` e `importePacienteServicios`. Los agrupadores añaden efectos volumen/valor, diferencia de presupuesto implícito, mediana, percentil 90 y cantidad de observaciones. Cada servicio del detalle añade `importeEntidad` e `importePaciente` calculados con la cantidad.

Se conservan `presupuestoTotalLimite` como suma de límites y `discrepanciaIntegridad` como diferencia bruta. Los campos históricos de proyección y burn rate permanecen para compatibilidad; la interfaz utiliza las referencias explícitas y no interpreta esas cifras como cierre mensual validado.

### Contrato de conciliación entre niveles

`conciliacionNiveles.contratoAgrupadores` y `contratoEpisodios` contienen `{cabecera, sumaComponentes, diferencia, estado}`. La diferencia es componentes menos cabecera; los importes son números finitos o nulos y el estado es `conciliado`, `con_diferencia` o `no_evaluable`.

`conciliacionNiveles.agrupadores[]` extiende ese balance con `idAgrupador`, `nombre` y `cantidadEpisodios`. Los contadores son `agrupadoresConciliados`, `agrupadoresConDiferencia` y `agrupadoresNoEvaluables`. `montoAbsolutoDiferenciasAgrupadores` suma las diferencias absolutas de grupos que superan $0,01; es nulo si el universo está incompleto. No se suman los balances del contrato a ese monto ni se compensan diferencias de signo opuesto.

El catálogo y dashboard requieren ahora estos campos de contexto y balances para ser aceptados por el cliente actualizado. Los fixtures y el exportador se actualizan conjuntamente; no se sustituyen por valores predeterminados que oculten una respuesta anterior.

El exportador utiliza la cabecera auditada del balance para **Facturado COP** del agrupador. Ante una cabecera ausente, deja facturación y ejecución porcentual vacías en vez de tomar el cero predeterminado de campos históricos. Una prueba unitaria cubre este caso; la compilación se repitió después de corregirlo.

## Cambio obligatorio del simulador

La petición `POST /api/v1/pfgp-analytics/simulador-exclusiones` exige ahora `revision`, tomada del dashboard abierto:

```json
{
  "inicio": "2026-10-01",
  "final": "2026-10-30",
  "centroId": 99,
  "idContrato": 100,
  "revision": "REVISION_DE_64_CARACTERES_HEXADECIMALES_DEL_DASHBOARD",
  "excluirTerapiaVAC": true,
  "excluirLaparoscopiaAvanzada": false,
  "excluirMallasSling": false
}
```

La cadena del ejemplo es un marcador: debe sustituirse por el valor real de `metadata.revision` antes de enviar la petición. El campo no puede omitirse.

La respuesta añade `inicio`, `final`, `centroId`, `idContrato` y `revision`. El cliente verifica que coincidan con la solicitud. `totalTrasladadoAEvento` y `montoExcluidoEvento` pasan a representar **porción entidad**, corrigiendo el uso anterior del bruto. Se añaden `totalTrasladadoPaciente`, `totalTrasladadoBruto`, `montoExcluidoPaciente` y `montoExcluidoBruto`.

El remanente no se recorta a cero. Un escenario incoherente falla de forma explícita. Los clientes anteriores deben actualizar su petición y la interpretación de importes al mismo tiempo que el backend.

## Revisión y errores

La revisión HMAC incluye el contrato seleccionado, su componente `acostado` y las fechas. Un cambio en otro contrato no invalida este informe; un cambio relevante en el elegido sí. Reiniciar el backend invalida revisiones previas. El selector temporal no forma parte de la revisión.

| HTTP | Código o comportamiento |
| --- | --- |
| 200 | Catálogo, dashboard, detalle o simulación validados; sin caché. |
| 404 | Contrato o episodio no disponible. |
| 409 | `STALE_REPORT`: actualizar corte; `DUPLICATE_CONTRACTS`: identificadores ambiguos del origen. |
| 422 | Validación de petición o `SCENARIO_NOT_CALCULABLE`: faltan bases monetarias válidas o el traslado supera la cabecera. |
| 503 | `SOURCE_AUTH_REQUIRED`: token ausente o rechazado. |
| 502 | Conexión o estructura incompatible, sin revelar la excepción del proveedor. |

El navegador distingue los códigos de negocio; un escenario no calculable no se presenta como error de fechas. Se mantiene `X-PFGP-Privacy: aliases-v1`, CORS local, `Cache-Control: no-store` y ausencia de respaldo automático.

## Precisión y ausencia

Las operaciones financieras usan `Decimal` internamente y números finitos en JSON. La tolerancia residual es $0,01. Los nuevos indicadores conservan valores nulos cuando faltan datos, sin reemplazarlos por cero ni por otra base. `acostado` ausente no equivale a un contrato explícito con importe cero.

No se añaden identificadores de pacientes, fechas individuales, camas ni documentos a las respuestas o al CSV. Las pruebas siguen aisladas del origen, con datos sintéticos. La metodología completa se encuentra en [DASHBOARD_EJECUTIVO.md](DASHBOARD_EJECUTIVO.md).

## Validación de la ampliación

La ejecución actual completó **108 pruebas de backend, 31 unitarias de frontend y compilación**. Se verificó localmente la respuesta del contrato 761 contra Pydantic y Zod, sin consultar el origen. En el archivo de referencia, ambos contratos reúnen 25 agrupadores y 639 episodios y todos los balances nuevos entre niveles conciliaron con diferencia cero. El timestamp producido en esta comprobación corresponde a generación local, no a una nueva recepción de Eklipse.

La interfaz se comprobó manualmente en navegador con datos sintéticos, incluidos diferencias compensadas a nivel contractual, nulos, referencia temporal sin consultas adicionales y CSV. Los **20 escenarios e2e escritos permanecen sin ejecución mediante runner en esta fase**. Estos resultados no resuelven la discrepancia observada con la interfaz original de Eklipse.
