# Dashboard ejecutivo PFGP · Metodología

Actualizado el **5 de noviembre de 2026**. La aplicación consulta Eklipse por rango y contrato, con centro 99. El archivo local analizado sirve para comprobar agregados; no es un respaldo de la aplicación ni un fixture de pruebas.

El usuario confirmó que `centroId=99` es obligatorio para todas las consultas: catálogo, dashboard, detalle de episodios y simulador. El centro es fijo; el backend rechaza cualquier otro valor antes de consultar el origen.

## Identificación de la consulta

El catálogo y el detalle muestran el **rango solicitado**, el centro fijo 99 y la **consulta recibida**. `consultaRecibidaEn` identifica el momento en que el backend recibió la respuesta del proveedor, en ISO UTC; la interfaz lo presenta en `America/Bogota` (UTC−5). No es la fecha de corte histórico ni la fecha de actualización del origen, que siguen pendientes de confirmar. Repetir inicio/final en metadatos no demuestra qué fechas aplicó efectivamente el proveedor.

Editar fechas sin pulsar **Aplicar período** mantiene el contexto y los datos del informe abierto. Cambiar la referencia de 30 días/calendario tampoco modifica la recepción ni la revisión. El catálogo y el detalle tienen recepciones independientes porque se consultan por separado. El simulador identifica el contrato por su código público; el ID interno continúa siendo el parámetro de transporte.

El resumen presenta juntos registros de episodio y cantidad de servicios. Esta distinción permite reconocer que un conteo de episodios estable no garantiza que el detalle de facturación permanezca igual.

## Presupuestos y bases monetarias

El resumen distingue dos bases que pueden diferir:

- **Presupuesto contractual reportado:** `totalContratado` del origen. Su periodicidad no está confirmada; no se supone mensual.
- **Suma de límites:** suma de `limite` de los agrupadores presentes. Se conserva en `presupuestoTotalLimite` por compatibilidad.

La ejecución contractual es `totalFacturado / totalContratado × 100`. Cada agrupador mantiene su propia ejecución contra su límite. También se informa `totalContratado − suma de límites` y la cobertura porcentual de los límites. La diferencia entre presupuestos no se interpreta como pérdida. Un denominador ausente o no positivo produce una métrica no disponible, sin reemplazarlo por otra base.

Los cálculos monetarios del backend utilizan `Decimal`, sin redondeo intermedio; las respuestas JSON conservan números para interoperar con el cliente. La tolerancia de conciliación es **$0,01**. Los importes se presentan en COP.

## Conciliación

Por episodio se muestran cabecera facturada, recuperación, detalle de servicios y dos diferencias:

```text
diferencia bruta = suma del valorTotal de servicios − totalFacturado
diferencia residual = suma del valorTotal de servicios − totalFacturado − totalRecuperado
importe entidad del servicio = cantidad × valorEntidad
importe paciente del servicio = cantidad × valorPaciente
```

Los campos `valorEntidad` y `valorPaciente` son unitarios en la muestra analizada. La diferencia bruta se conserva para compatibilidad y explicación; las alertas financieras y filtros emplean el residual. Se cuentan episodios evaluables, conciliados, con diferencia y no evaluables. El porcentaje conciliado usa como denominador los episodios evaluables. El monto sin explicar suma los valores absolutos de los residuales, evitando que diferencias positivas y negativas se cancelen.

Un campo ausente no acredita un importe cero. La denominación recuperación no prueba recaudo en caja ni clasificación contractual como copago. No se eliminan importes por ID repetido automáticamente.

### Conciliación entre contrato, agrupadores y episodios

La sección **Conciliación entre niveles** evalúa independientemente:

```text
contrato → agrupadores: suma de cabeceras de agrupadores − cabecera del contrato
contrato → episodios: suma de cabeceras de episodios − cabecera del contrato
agrupador → episodios: suma de cabeceras de sus episodios − cabecera del agrupador
```

Estas comparaciones usan cabeceras facturadas sobre la misma base monetaria. No añaden recuperación ni vuelven a sumar servicios. Complementan la conciliación episodio → servicios, que permanece separada: un 100 % de episodios conciliados no acredita que los totales de sus agrupadores también concilien.

Cada relación devuelve cabecera, suma de componentes, diferencia con signo y estado `conciliado`, `con_diferencia` o `no_evaluable`. Se utiliza `Decimal` y tolerancia de $0,01. Si falta o es inválida una cabecera o un componente necesario, la relación queda no evaluable; en la interfaz los importes ausentes aparecen como **N/D**, no como cero.

Las diferencias de agrupadores se cuentan por separado y no se compensan. Por ejemplo, +$100 y −$100 pueden sumar cero a nivel contractual, pero se conservan como dos agrupadores con diferencia y $200 de monto absoluto. Ese monto suma los valores absolutos de las diferencias que superan la tolerancia; queda no disponible si falta información de algún agrupador. Los balances del contrato se muestran como comprobaciones independientes y no se suman al monto de diferencias de agrupadores.

## Exposición con `acostado`

`facturado` y `acostado` se obtienen de la misma respuesta y se relacionan mediante `idContrato`. El supuesto visible de trabajo es que pertenecen al mismo corte; recibir ambos bloques en una consulta no acredita por sí solo el corte histórico del proveedor.

```text
exposición combinada = totalFacturado + totalFacturado de acostado
ejecución combinada = exposición combinada / totalContratado × 100
disponibilidad calculada = totalContratado − exposición combinada
```

Se muestra además la disponibilidad reportada y su diferencia contra la calculada. La ausencia del bloque o del contrato no se transforma en cero. Un contrato explícitamente vacío y con total cero sí permite representar cero. Si un ingreso aparece en ambos bloques, se conserva la información individual de los componentes y se omite su suma para evitar una exposición duplicada. Los identificadores usados para verificar esta condición nunca se devuelven al navegador.

La disponibilidad calculada no se etiqueta como déficit mensual mientras no esté confirmada la periodicidad del presupuesto.

## Referencias temporales

El backend devuelve la referencia de 30 días y, cuando el rango pertenece a un único mes, la referencia calendario. El selector modifica solamente la presentación sobre la misma respuesta; no realiza otra consulta ni cambia presupuesto, importes observados o revisión.

```text
días del rango = fecha final − fecha inicial + 1
facturación normalizada = totalFacturado / días del rango × días de referencia
avance de referencia = días del rango / días de referencia × 100
```

Se utilizan 30 días o los 28, 29, 30 o 31 días reales del mes. La opción inicial es 30 días. Para un rango que cruce meses, calendario queda no disponible con explicación, sin sustituirlo silenciosamente por 30 días. Estas cifras son referencias lineales, no predicciones validadas ni cierres contractuales. `fechaIngreso` no se utiliza como fecha de prestación o facturación.

## Indicadores explicativos

| Indicador | Método |
| --- | --- |
| Efecto volumen | `(eventos reales − eventos contratados) × CME contratado`. |
| Efecto valor | `facturado − eventos reales × CME contratado`. |
| Diferencia de presupuesto implícito | `eventos contratados × CME contratado − límite del agrupador`. Los tres efectos suman la desviación contra el límite. |
| Concentración | Participación de los 10 episodios principales y del 10 % superior, redondeando la cantidad hacia arriba. Denominador: suma de cabeceras de los episodios analizados. |
| Distribución | Mediana y percentil 90 por agrupador, con interpolación lineal y tamaño de muestra visible. |
| Atípicos IQR | Facturado mayor que `Q3 + 1,5 × (Q3 − Q1)`, dentro de cada agrupador y con al menos cuatro observaciones. Es una señal financiera. |
| Pareto | Total bruto de todos los servicios como denominador, calculado antes de limitar la lista. La interfaz muestra los 10 principales y el resto del total. |
| Participación EVENTOS | Facturación del agrupador EVENTOS / facturación del contrato. Mantiene la convención de origen ID 1. |

Concentración y Pareto omiten porcentajes cuando existen importes negativos o el denominador no es válido. La clasificación medicamentos/insumos sigue el código literal `MEDICAMENTOS`; requiere catálogo de negocio para una clasificación más precisa. Los demás códigos mantienen la etiqueta provisional procedimiento/CUPS.

## Simulador de exclusiones

Las reglas actuales buscan nombres de insumos bajo `MEDICAMENTOS` en agrupadores con límite positivo distintos de EVENTOS. Los interruptores permiten excluir terapia VAC, insumos laparoscópicos y mallas/slings; una fila coincidente con varias reglas se considera una sola vez.

El traslado que afecta la ejecución utiliza **cantidad × valorEntidad**. La porción paciente y el valor bruto se informan aparte. Siempre debe cumplirse `original = remanente + traslado` sobre la base entidad. La simulación no modifica la facturación del origen ni representa por sí sola ahorro o ingreso adicional confirmado.

Se requiere la revisión del informe abierto. Si cambia el corte, el servidor devuelve 409. Si faltan cantidades o importes necesarios, o el traslado supera la cabecera del agrupador, responde 422 con código `SCENARIO_NOT_CALCULABLE`. No se sustituye el neto por bruto y no se recortan remanentes negativos a cero.

## Interfaz, privacidad y exportación

El catálogo conserva búsqueda, orden y paginación. El detalle incluye resumen ejecutivo, referencias temporales, seis gráficos con tablas alternativas, auditoría, simulador y episodios. El diálogo de servicios conserva filtros, búsqueda, paginación, Escape y retorno del foco.

Los episodios mantienen alias temporales, ordinales locales y fechas individuales suprimidas. La revisión cubre el contrato elegido, `acostado` y el rango; el selector temporal no la altera. La lista y el detalle son consultas independientes, por lo que pueden corresponder a extracciones diferentes.

El CSV contiene métricas agregadas, presupuesto reportado, referencia temporal, centro, recepción UTC y revisión del informe. Incluye conteos de episodios y servicios, balances entre niveles y estados, sin identidades ni fechas individuales. Si no hay agrupadores, conserva una fila de contexto contractual con los campos de agrupador vacíos. El rango se identifica como solicitado y conserva el aviso de que las fechas efectivas del origen no están confirmadas. Los valores ausentes se distinguen de cero. El tema es la única preferencia persistida localmente.

La columna **Facturado COP** utiliza la cabecera auditada del agrupador. Si no está disponible, tanto esa columna como su ejecución porcentual quedan vacías; no se exporta el cero predeterminado de campos históricos como si fuera una cabecera observada.

## Comprobación y límites

Las pruebas automatizadas usan datos sintéticos y no consultan Eklipse. La validación del 5 de noviembre de 2026, **antes de añadir trazabilidad y conciliación entre niveles**, completó **85 pruebas de backend, 25 unitarias de frontend y 17 flujos de navegador**, además de compilación y revisión de capturas.

La ampliación actual completó **108 pruebas de backend, 31 unitarias de frontend y compilación**. Una comprobación local sin red verificó el contrato 761 mediante Pydantic y Zod. Sobre el archivo de referencia, los **25 agrupadores y 639 episodios** de ambos contratos produjeron balances de niveles conciliados y diferencias cero; el timestamp de esa ejecución local no acredita una consulta actual del proveedor.

La revisión manual del navegador sobre datos sintéticos verificó rango solicitado, recepción UTC convertida a Bogotá, centro 99, fechas en borrador, selector temporal sin nuevas consultas, diferencias opuestas por agrupador, bases ausentes, exportación y código público del contrato. El caso con +$100 y −$100 mantuvo dos diferencias y $200 absolutos aunque contrato y episodios conciliaran; los nulos se mostraron como N/D. En móvil de 390 px las tablas conservaron desplazamiento interno sin desbordamiento global.

También se verificaron modo oscuro, apertura/cierre de servicios del episodio sintético 0001 y simulación sin exclusiones, con original y remanente de $1.200.000 y traslado cero. Las ocho solicitudes observadas entre catálogo, dashboard, episodio y simulador utilizaron centro 99. Estas comprobaciones emplearon mocks, no la interfaz del origen.

La suite ampliada contiene **20 escenarios de navegador escritos; no se ejecutó el runner en esta fase**. La comprobación manual actual no sustituye una ejecución automatizada completa ni una nueva revisión Axe. El README conserva los detalles de validación y las rutas de capturas sintéticas.

No se incorporan todavía tendencias históricas, ocupación, reingresos o rentabilidad. Se requieren fechas de prestación/facturación, capacidad, continuidad de episodios o costos validados. El archivo contiene ingresos fuera de octubre y no conserva el rango original de consulta; esto impide inferir facturación diaria a partir de la fecha de ingreso.
