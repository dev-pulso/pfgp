# Pendientes priorizados · 5 de noviembre de 2026

**Regla confirmada por el usuario:** todas las consultas utilizan siempre `centroId=99`, incluido catálogo, dashboard, detalle y simulador. Esta restricción ya está aplicada en los flujos HTTP. La comparación con la etiqueta «TODOS» de Eklipse no cambia el centro obligatorio.

| Prioridad | Pendiente | Criterio de cierre |
| --- | --- | --- |
| Alta | Confirmar periodicidad y vigencia de `totalContratado` | Responsable del contrato acredita si es mensual o corresponde al rango. Hasta entonces se muestra como presupuesto reportado y no se afirma déficit mensual. |
| Alta | Confirmar corte histórico de `acostado` | El proveedor acredita su relación temporal con `facturado`; la misma consulta se usa hoy como supuesto visible. |
| Alta | Confirmar unidad de evento e IDs repetidos legítimos | Diccionario aprobado de ingreso, episodio, evento y servicio. No se descuentan repeticiones automáticamente. |
| Alta antes de red | Autenticación, autorización y política de exportación | Controles de acceso validados antes de exponer el dashboard fuera del equipo local. |
| Alta antes de habilitar escritura | Integrar registro de configuración PFGP en Eklipse | Incorporar endpoint y ajuste de lectores, registrar autoridad de escritura específica y compilar en el proyecto completo. Validar en staging metadatos SQL, transacción y dos peticiones concurrentes. Configurar la URL local únicamente tras esa comprobación. Véase el [checklist de integración](REGISTRO_CONTRATOS_PFGP.md#lista-de-integración-y-comprobación). |
| Alta antes de admitir renovaciones | Definir selección temporal de checkpoints | Acreditar una regla de vigencia y actualizar lectores. Esta entrega almacena fechas y rechaza cualquier segunda configuración del contrato; no promete elegir presupuesto por rango. |
| Alta | Completar paridad entre interfaz de Eklipse y respuesta actual | Acreditar centro y fechas efectivamente aplicadas; resolver la diferencia de $42.136.939 de Municipios documentada en la auditoría. La recepción del backend identifica una extracción, pero no acredita el corte del proveedor. |
| Media | Validar diccionario de recuperación, EVENTOS y tipos de servicio | Aclarar significado contractual de `totalRecuperado`, convención EVENTOS ID 1 y catálogo medicamentos/procedimientos. |
| Media | Rendimiento con volumen real | Medir extracción, cálculo y renderizado; decidir paginación de servidor con evidencia. |
| Media | Fechas y datos adicionales para nuevas métricas | Obtener fecha de prestación/facturación, capacidad y costos antes de incorporar tendencias, ocupación, reingresos o rentabilidad. |
| Media | Accesibilidad manual y tamaño de gráficos | Revisar lectores de pantalla, impresión y carga diferida del módulo ECharts. |
| Media | Ejecutar suite e2e ampliada | Hay 20 escenarios analíticos y 6 de configuración de contratos escritos. Las comprobaciones manuales con datos sintéticos se registran por separado; falta ejecutar el runner completo y renovar comprobaciones automatizadas de accesibilidad. |
| Baja | Dependencias Python reproducibles | Fijar versiones después de validar compatibilidad y revisar advertencias del adaptador de pruebas. |

La mejora implementa separación de presupuestos, conciliación residual, exposición combinada bajo supuesto explícito, referencias temporales seleccionables, simulación sobre porción entidad y revisión, Pareto completo, concentración y comparación por agrupador. El README registra las pruebas aprobadas y la comprobación local agregada.

La [auditoría de Eklipse del 5 de noviembre](AUDITORIA_EKLIPSE_2026-11-05.md) registra por separado la extracción anterior, la consulta actual y las comprobaciones visuales, con estados de evidencia explícitos.
