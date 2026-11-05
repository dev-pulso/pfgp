# Dashboard ejecutivo PFGP · Implementación y alcance

Fecha: **4 de noviembre de 2026**. Este informe corresponde a la copia actual con `app/` y al frontend creado en `frontend/`.

## Catálogo y apertura por botón

La pantalla inicial muestra todos los contratos devueltos por `facturado` para el rango y centro 99. Incluye búsqueda por ID/código/nombre, orden y paginación; **Ver contrato** consulta el dashboard con `idContrato`. **Volver a contratos** conserva el estado del listado. Cambiar fechas elimina la selección para evitar mostrar un contrato de otro período. No se implementan edición ni escrituras a Eklipse. Evidencia: `app/services/pfgp_analytics_service.py:45`, `frontend/src/components/ContractsPanel.tsx:13`, `frontend/src/App.tsx:124`.

Los indicadores se calculan después de seleccionar el contrato, sin mezclar episodios ni servicios de otros contratos. La clave de TanStack Query incluye el ID y se comprueba que el ID de la respuesta coincida. El catálogo no incluye datos de episodios. La consulta del catálogo y la del detalle son independientes; no se afirma que compartan un mismo corte. Evidencia: `app/services/pfgp_analytics_service.py:65`, `frontend/src/hooks/useDashboard.ts:5`, `frontend/src/api/dashboard.ts:81`.

## Funcionalidad entregada

| Requisito | Implementación verificable |
| --- | --- |
| React + TypeScript + Vite + TanStack Query | Dependencias fijadas y lockfile; consulta por fechas y centro, cancelación HTTP y memoria sin persistencia. `frontend/package.json:1`, `frontend/src/hooks/useDashboard.ts:5`. |
| Encabezado, contrato, fechas y centro 99 | Fechas iniciales de Bogotá, borrador separado del período consultado, refresco explícito, contrato del payload y avance dinámico. `frontend/src/App.tsx:70`, `frontend/src/lib/format.ts:26`. |
| Cinco KPIs | Facturado/límite, burn rate con umbral 1, presión de insumos, recuperación reportada y gasto EVENTOS. COP con separador de miles; sin sustituir nulos por cero. `frontend/src/components/KpiCards.tsx:12`, `frontend/src/lib/format.ts:1`. |
| Cuatro gráficos | Ejecución con referencias dinámicas y 100%; CME contratado/real; scatter estancia/facturado con IQR; Pareto top 10 con línea acumulada. ECharts SVG modular, carga diferida, tooltips y tablas alternativas. `frontend/src/components/Charts.tsx:95`, `frontend/src/lib/analytics.ts:3`. |
| Alertas | ID repetidos, servicios a cero y diferencias de conteo con conciliación por agrupador. Etiquetas prudentes, sin afirmar fraude ni pérdida real. `frontend/src/components/AuditPanel.tsx:5`. |
| Episodios y detalle | Búsqueda de alias/agrupador sin tildes, orden, páginas de 8, filtro de alertas, discrepancias positivas/negativas y badge CME >1,5. Diálogo accesible con métricas del payload; no inventa un listado de servicios ausente. `frontend/src/components/EpisodesTable.tsx:15`, `frontend/src/components/EpisodesTable.tsx:106`. |
| Exportación | CSV de todos los agrupadores del informe, fechas y centro incluidos; sin episodios; neutralización de fórmulas. `frontend/src/lib/export.ts:3`, `frontend/src/lib/export.ts:36`. |
| Estados y privacidad | Skeletons, errores seguros, estado sin datos, incompatibilidad de esquema/privacidad y rechazo de fechas discordantes. Solo se conserva el tema en almacenamiento local. `frontend/src/api/dashboard.ts:13`, `frontend/src/api/schema.ts:1`, `frontend/src/App.tsx:44`. |
| Apple, temas y accesibilidad | Skill awesome-design, tipografía del sistema, azul, superficies sobrias, foco, movimiento reducido y tablas desplazables. `DESIGN.md:1`, `frontend/src/styles.css:1`. |

## Hallazgos metodológicos que condicionan la lectura

1. **La referencia temporal no es el mes calendario.** El motor usa días del rango / 30 y una proyección lineal de facturación a 30 días. El frontend muestra la cifra recibida, explica la base y limita visualmente la barra a 100% conservando la cifra original. No fija 66,7% en el código. Evidencia: `app/services/pfgp_analytics_service.py:83`, `app/services/pfgp_analytics_service.py:226`.
2. **ID repetido no equivale a fraude ni a duplicado exacto.** El motor compara ingreso + ID de servicio; no verifica equivalencia de todos los atributos o legitimidad de repeticiones. El monto continúa incluido en los totales. Evidencia: `app/services/pfgp_analytics_service.py:163`.
3. **“Lucro cesante” es un valor potencial.** Se estima con cantidad × valor de producto cuando el total es cero; no verifica tarifa aplicable, cobertura o derecho de cobro. La UI lo llama valor potencial por revisar. Evidencia: `app/services/pfgp_analytics_service.py:168`.
4. **La clasificación de servicios es provisional.** Se identifican medicamentos mediante el código literal `MEDICAMENTOS`; el resto se etiqueta como procedimiento/CUPS sin catálogo validado. Evidencia: `app/services/pfgp_analytics_service.py:173`, `app/services/pfgp_analytics_service.py:257`.
5. **El denominador del Pareto es parcial.** El backend entrega como máximo 20 servicios. El frontend ordena, toma 10 y acumula sobre toda la lista recibida, sin afirmar que representa el gasto completo. Ante importes negativos o denominador cero, omite porcentajes. Evidencia: `app/services/pfgp_analytics_service.py:262`, `frontend/src/lib/analytics.ts:3`.
6. **La desviación del CME es financiera.** El cociente de facturación/CME no acredita severidad clínica. La UI conserva el umbral solicitado de 1,5 como señal financiera. Evidencia: `app/services/pfgp_analytics_service.py:198`, `frontend/src/components/EpisodesTable.tsx:106`.
7. **“Gasto huérfano” depende de una convención no validada.** El motor suma el agrupador con ID 1, sin verificar que sea EVENTOS o que carezca de techo. La tarjeta evita afirmar que la asignación es incorrecta. Evidencia: `app/services/pfgp_analytics_service.py:273`.
8. **Recuperación no acredita copagos ni recaudo.** El motor renombra `totalRecuperado`; no hay conciliación de caja en esta copia. La UI señala esta limitación. Evidencia: `app/services/pfgp_analytics_service.py:269`, `app/services/pfgp_analytics_service.py:315`.
9. **Ausencia de valores y precisión.** El motor utiliza valores por defecto cero y `float` para dinero. La interfaz no puede recuperar información de ausencia ya perdida ni precisión decimal original. Los ceros requieren validar cobertura; migrar a Decimal exige una mejora del contrato de datos. Evidencia: `app/services/pfgp_analytics_service.py:101`, `app/schemas/pfgp_schemas.py:22`.
10. **Episodios no son personas únicas.** El motor cuenta filas y agrega servicios por ingreso. No acredita unicidad entre agrupadores ni evita duplicidad transversal. Los alias públicos identifican únicamente filas del informe. Evidencia: `app/services/pfgp_analytics_service.py:174`, `app/services/pfgp_analytics_service.py:294`, `app/services/pfgp_analytics_service.py:321`.

## Verificación y evidencia

- Backend: **29 pruebas**, sin red ni pacientes reales, en `tests/test_analytics.py:1`.
- Frontend: **16 pruebas unitarias** de formato, fechas Bogotá, rango inválido, Pareto, IQR, CSV, búsquedas, contrato, privacidad y transporte. `frontend/src/lib/analytics.test.ts:1`, `frontend/src/api/dashboard.test.ts:1`.
- Navegador: **11 flujos** con Chrome, incluidos filtros, exportación, mismo corte al navegar, diálogo/foco/Escape, carga, cambios de rango, errores y estados vacíos. `frontend/e2e/dashboard.spec.ts:1`.
- Revisión visual y Axe en **1440×1100, 768×1024 y 390×844**, claro y oscuro. Sin desbordamiento de página; el catálogo usa filas apiladas en móvil con el botón visible. Las tablas analíticas conservan desplazamiento interno. Capturas sintéticas generadas bajo `frontend/test-results/`; esta carpeta no se versiona. No supone evaluación integral con lectores de pantalla.
- `npm run build` pasó. ECharts se carga en un módulo diferido de aproximadamente 602 kB sin comprimir, 204 kB gzip; queda la advertencia de tamaño. No se modificaron los límites de aviso para ocultarla.
- Conexión real: certificados del sistema resolvieron la confianza TLS; Eklipse respondió **401** sin autenticación. Tras añadir soporte Bearer, el diagnóstico permanece en `token_ausente_o_rechazado`. No se puede afirmar que un informe real completo haya pasado la validación. `scripts/check_connection.py:1`.

## Fuentes técnicas

La cancelación sigue el `AbortSignal` de [TanStack Query](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation). Los gráficos activan el componente de accesibilidad de [Apache ECharts](https://echarts.apache.org/handbook/en/best-practices/aria/) y se complementan con tablas y botones navegables. La integración usa el módulo ESM de [echarts-for-react](https://github.com/hustcc/echarts-for-react), compatible con el empaquetado observado en Vite 8.
