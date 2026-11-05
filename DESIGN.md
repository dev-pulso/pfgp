# PFGP · Criterios de interfaz

La implementación aplica la skill local **awesome-design**, basada en la referencia Apple de [VoltAgent awesome-design-md](https://github.com/voltagent/awesome-design-md), revisión `fcc70284932276d085f01ef9f83edde90b1258cb`. Es una adaptación para un dashboard; no representa una afiliación con Apple ni una certificación de sus HIG.

- Tipografía del sistema, jerarquía discreta, fondo gris claro y superficies blancas; modo oscuro con superficies diferenciadas.
- Azul como único acento de navegación. Verde, ámbar y rojo se reservan para estados, siempre acompañados de texto o símbolos.
- Tarjetas redondeadas, bordes finos y sombras sutiles. Interacciones de 180–200 ms, desactivadas con `prefers-reduced-motion`.
- Sidebar en escritorio, navegación compacta en tablet y barra superior en móvil. Los gráficos pasan de dos columnas a una.
- Los valores nulos se distinguen de cero. Las referencias temporales y el denominador del Pareto se explican junto al gráfico.
- Las tablas ofrecen desplazamiento horizontal dentro de su contenedor, búsqueda, orden y paginación. Los gráficos tienen tablas alternativas; el diálogo usa foco nativo y cierre con Escape.
- No se utilizan fotos, identidades ni historias clínicas como elementos visuales. Los alias del informe no son identificadores longitudinales.

La paleta y los tamaños viven en `frontend/src/styles.css`; no se descargan fuentes ni recursos gráficos externos. Las capturas de verificación contienen únicamente fixtures sintéticos de pruebas.

El catálogo inicial presenta todos los contratos retornados para el período. Cada fila tiene una acción **Ver contrato**. En móvil se apilan nombre, importes y acción sin ocultar el botón en un desplazamiento horizontal. El detalle ofrece **Volver a contratos** y conserva el filtro del listado.
