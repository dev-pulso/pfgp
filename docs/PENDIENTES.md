# Pendientes priorizados · 4 de noviembre de 2026

| Prioridad | Pendiente | Esfuerzo orientativo | Evidencia / criterio de cierre |
| --- | --- | --- | --- |
| Alta | Configurar o renovar token autorizado y validar un corte real | Depende del acceso | `scripts/check_connection.py:1`, `app/config.py:17`. Debe devolver `informe_valido_con_alias` o `catalogo_valido_para_seleccion`, sin registrar identidades. |
| Alta antes de red | Autenticación de usuarios, autorización, privacidad por rol y política de exportación | 3–5 días + revisión organizacional | `app/main.py:68`. CORS y enlace local no sustituyen controles de acceso; los importes por episodio siguen siendo sensibles. |
| Alta | Confirmar unidad de evento, unicidad de ingreso/servicio y repeticiones legítimas | 2–4 días + responsable del dato | `app/services/pfgp_analytics_service.py:163`, `app/services/pfgp_analytics_service.py:174`. Evitar falsos duplicados y sumas entre agrupadores. |
| Media | Validar vigencia, período presupuestal y base de 30 días | 1–3 días | `app/services/pfgp_analytics_service.py:83`. Definir cuándo son comparables ejecución, avance y proyección. |
| Media | Diccionario aprobado: copagos/recuperación, EVENTOS, medicamentos y procedimientos | 2–4 días | `app/services/pfgp_analytics_service.py:173`, `app/services/pfgp_analytics_service.py:273`, `app/services/pfgp_analytics_service.py:315`. |
| Media | Dinero decimal, cobertura y nulos explícitos | 2–3 días | `app/schemas/pfgp_schemas.py:22`, `app/services/pfgp_analytics_service.py:101`. Pruebas de reconciliación exacta y denominadores válidos. |
| Media | Pareto sobre universo completo o total de referencia explícito | 1 día | `app/services/pfgp_analytics_service.py:262`, `frontend/src/lib/analytics.ts:3`. El actual corresponde solo a la lista devuelta. |
| Media | Paginación/filtrado de servidor y rendimiento con volumen real | 2–4 días | `frontend/src/components/EpisodesTable.tsx:106`. Hoy se descarga la respuesta completa y se filtra en memoria. |
| Media | Optimizar módulo ECharts y evaluar impresión/accesibilidad manual | 1–2 días | `frontend/src/components/Charts.tsx:1`, `frontend/e2e/dashboard.spec.ts:1`. Mantener legibilidad, foco, tablas alternativas y movimiento reducido. |
| Baja | Actualizar integración TestClient/HTTPX y fijar versiones Python | 0,5–1 día | `tests/test_analytics.py:5`, `requirements.txt:1`. La suite pasa; hay advertencia de deprecación en el entorno instalado. |

**Resuelto:** catálogo completo y selección por botón, con consulta explícita por ID, búsqueda, orden y paginación. Ver `app/main.py:53`, `app/main.py:68` y `frontend/src/components/ContractsPanel.tsx:13`.

Las estimaciones excluyen aprobaciones, obtención de datos y validación por responsables del negocio. No se han entrenado ni validado modelos predictivos en esta implementación del dashboard: la proyección de 30 días es lineal, como se documenta en `docs/DASHBOARD_EJECUTIVO.md`.
