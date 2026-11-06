# Integración de configuración PFGP para Eklipse

Entrega para integrar en `eklipse-back-v1`, rama `sln`, módulo `8004/sln/apps/estadistico-pfgp`, revisado en commit `7ab7479cd04418233db4af5acbbd5b0e4b6d88bd`. No es un servidor independiente ni se despliega desde este proyecto.

## Perfil del proyecto de destino

NestJS 10 / TypeORM 0.3 / SQL Server; TypeScript con decoradores y metadatos, `BaseSource` para la conexión del contexto autenticado, `CommonGuards` y autoridades del proyecto. El lockfile de referencia resuelve Nest 10.3.4, TypeORM 0.3.20, TypeScript 5.4.2, class-validator 0.14.1 y class-transformer 0.5.1. Las comprobaciones aisladas usan esas versiones.

El servicio configura un `GENDETCON` existente mediante `EKSLNCHPTCONT` y `EKSLNAGRUCONT`. El DTO valida la entrada; el controlador conserva los guardas; el servicio concentra referencias, permiso de escritura y transacción. Los helpers amplían ambos lectores sin eliminar su lista heredada y separan contratos por ID del detalle. No se introducen dependencias de ejecución adicionales.

## Archivos a incorporar

1. Copiar el contenido de `src/` a `8004/sln/apps/estadistico-pfgp/src/`, conservando los directorios. Son cinco archivos nuevos. No copiar `tests/stubs`, `tsconfig.json`, `package.json` o `build` al módulo productivo.
2. Revisar `readers-and-module.patch` y, desde la raíz del repositorio de Eklipse, ejecutar `git apply --check <ruta-al-parche>` antes de `git apply <ruta-al-parche>`. Modifica el módulo, ambos servicios de lectura y la fábrica de contratos facturados. Registra servicio/controlador, amplía los códigos elegibles y separa contratos por detalle. Si la rama cambió, adaptar los cambios sobre su versión actual.
3. Registrar una autoridad específica de configuración PFGP en el mecanismo de permisos de Eklipse y asignarla al usuario autorizado. Configurar `PFGP_CONTRACT_WRITE_AUTHORITY` en ese backend con su código real. Ambos endpoints requieren esa autoridad y la existente `ESTADISTICO_PFGP`. Sin la nueva autoridad configurada, responden 503 y no escriben.
4. Validar en staging las tablas, tipos y precisiones reales, los permisos, la transacción y la concurrencia. La entidad de origen omite la precisión de `CANTEVENTOS`; esta integración declara `decimal(18,2)`. Si el esquema físico difiere, alinear el contrato en NestJS, Python y frontend antes de habilitarlo.
5. Compilar y ejecutar las pruebas del proyecto Eklipse, publicar el endpoint por el procedimiento habitual y configurar **solo en el backend local** `EKLIPSE_CONTRACTS_URL=https://<backend>/v1/pfgp/contratos`. Utiliza el `EKLIPSE_TOKEN` existente; no se envían credenciales al navegador.

Rutas externas: `GET /v1/pfgp/contratos/opciones?centroId=99` y `POST /v1/pfgp/contratos` (201). Centro 99 es obligatorio y no se inventa una columna de centro en las tablas PFGP.

Archivos nuevos, relativos al directorio `src/` del módulo:

```text
application/dto/crear-contrato-pfgp.dto.ts
infrastructure/services/contratos-pfgp.service.ts
infrastructure/services/configured-contract-codes.ts
infrastructure/services/group-by-contract-detail.ts
presentation/controllers/contratos-pfgp.controller.ts
```

Archivos existentes modificados por el parche, relativos al mismo directorio:

```text
estadistico-pfgp.module.ts
infrastructure/services/facturado/fetch.impl.ts
infrastructure/services/acostado/fetch.impl.ts
infrastructure/factories/facturado/facturas-to-contratos.ts
```

## Comportamiento y límites

- Una configuración por detalle contractual. Una petición concurrente que encuentre el checkpoint existente devuelve 409. La transacción `SERIALIZABLE` mantiene `UPDLOCK, HOLDLOCK` sobre la fila de `GENDETCON` hasta terminar; los hijos se insertan en esa misma transacción. Esto coordina escritores que usan este servicio; no sustituye una restricción única frente a escritores externos.
- Dinero como cadenas, máximo cuatro decimales; cantidades de eventos positivas con dos. SQL recibe parámetros enlazados y realiza la conversión, sin pasar los importes por `Number`.
- EVENTOS (ID 1) es sintético. No se exigen presupuestos iguales a la suma de límites. No se crean maestros, agrupadores, servicios ni asociaciones de clasificación.
- Las fechas se registran. El lector heredado no selecciona por vigencia; no se admiten renovaciones hasta corregir esa selección. La unión de códigos conserva este comportamiento y no afirma que una consulta histórica tenga presupuesto temporalmente validado.
- Facturado y acostado se agrupan por ID del detalle `GENDETCON`, con su código y nombre; el checkpoint se busca por ese ID. Dos detalles del mismo maestro o con etiquetas coincidentes permanecen separados. La consolidación de facturas se limita al contrato en proceso para evitar modificar repetidamente los demás. Este cambio no demuestra la causa de la discrepancia monetaria documentada en Municipios.
- Un contrato sin facturas puede no aparecer en el catálogo analítico; `opciones` permite comprobar su existencia como configuración.
- No hay reintento automático de POST. Una respuesta perdida puede corresponder a una transacción confirmada: el frontend exige comprobar el estado antes de otro envío.

## Comprobaciones reproducibles

Desde esta carpeta: `npm ci --ignore-scripts`, `npm run check` y `npm test`. Las pruebas emplean límites externos simulados y no se conectan a SQL Server. Comprueban DTO, permisos del servicio, errores, parámetros decimales, lógica transaccional, unión de códigos y agrupación por detalle. No acreditan el comportamiento de los guardas reales, el esquema, los bloqueos ni el rollback del motor: estos puntos requieren staging. El parche puede comprobarse sin aplicarlo con `git apply --check` sobre el commit indicado.

Resultado del 5 de noviembre de 2026: **13 pruebas aprobadas**, comprobación TypeScript correcta y `git apply --check` aprobado. Además se ejecutaron los lectores de referencia parcheados en memoria con ORM simulados: facturado conserva detalles, presupuestos, recuperación y varias facturas del segundo contrato; acostado resuelve los presupuestos por ID de detalle con y sin snapshot. Los controles negativos con el código original reprodujeron los defectos corregidos. El clon de referencia permaneció intacto. La compilación en el proyecto completo y la validación SQL siguen pendientes de integración.

Contrato de API, errores, pasos y comprobaciones pendientes: [documentación del proyecto](../../docs/REGISTRO_CONTRATOS_PFGP.md). Referencias de API: [ValidationPipe de NestJS](https://docs.nestjs.com/techniques/validation) y [transacciones de TypeORM](https://typeorm.io/docs/advanced-topics/transactions/).

Para reproducir las regresiones de los lectores: `npm run test:reference -- <ruta-al-checkout-original-de-Eklipse>`. Requiere el commit de referencia sin el parche aplicado. Lee las fuentes, aplica los cambios únicamente en memoria y ejecuta casos sintéticos con dependencias simuladas; incluye controles negativos sobre las fuentes originales. No modifica el checkout ni accede a bases de datos.
