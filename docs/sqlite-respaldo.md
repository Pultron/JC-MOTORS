# SQLite local + respaldo `.jcm` (diseño y contrato)

Sigue `docs/plan-sqlite.md` (opción B: `rusqlite` con comandos propios). Este documento fija las decisiones de implementación.

## 1. Estrategia para lo asíncrono (sin reescribir pantallas)

Todo el acceso a datos de la app pasa por `src/storage/safeStorage.ts` (`readRaw/writeRaw/removeRaw/listKeys/getStorage`). Por eso:

1. **Arranque asíncrono con pantalla de carga.** `main.tsx` espera `bootData()` (abre la base, decide backend, migra si toca, carga todo en memoria) y solo entonces importa `App` (los servicios se crean ya con el backend decidido).
2. **Espejo en memoria.** Con SQLite activo, `safeStorage` usa un `Storage` enrutado: las claves del negocio viven en un `Map` en memoria cargado desde Rust (`db_load_snapshot`); las preferencias de interfaz (`sidebarTheme`) y las copias de cuarentena `jc-motors:backup:*` siguen en `localStorage`.
3. **Escritura con confirmación.** `setItem/removeItem` actualizan la memoria al instante (las lecturas siguen siendo síncronas) y encolan el cambio; una cola serializada los manda a Rust en lotes (`db_apply`, UNA transacción por lote; contador de folio y cotización del mismo guardado viajan juntos).
   - Los repositorios `Sqlite*Repository` (mismas interfaces, extienden a los `LocalStorage*`) esperan la confirmación del lote antes de resolver: si falla, la memoria vuelve al último estado confirmado y el método lanza (la pantalla ya muestra su error).
   - Los servicios síncronos (clientes, plantillas, borradores, datos del taller): escritura optimista; si el lote falla, se revierte la memoria, se emite un aviso (toast) y se recarga la vista para que la pantalla vuelva a leer lo confirmado.
4. **Una sola fábrica** (`repositoryFactory`) decide `Sqlite*` o `LocalStorage*`. Fuera de Tauri (navegador, tests) siempre `LocalStorage*`.

## 2. Base de datos

- Archivo `<datos>/jcmotors.db`, `<datos>` = `app_data_dir()` (o `JCM_DATA_DIR` si está definida: SOLO para pruebas aisladas).
- `PRAGMA journal_mode=WAL; foreign_keys=ON; busy_timeout=5000`. Versión de esquema en `PRAGMA user_version`, migraciones numeradas en Rust (`MIGRATIONS: [&str]`, la i-ésima lleva de la versión i a i+1). Versión actual: 1.
- `PRAGMA integrity_check` al abrir. Si no es `ok`: se renombra a `jcmotors.db.corrupt-<fecha>` y se crea una base nueva vacía (el estado devuelve `corruptMovedTo`).
- **Fuente de verdad para reconstruir = columna `data` (JSON exacto del registro)**, con `serde_json` `preserve_order`. Las columnas relacionales (folio, fecha, estado, total en centavos, nombres…) son derivadas: sirven para consultas y para VERIFICAR la migración. Esto garantiza cero pérdida (campos desconocidos, objetos incompletos de fixtures).

Tablas (todas `STRICT` no es obligatorio):

| Tabla | Clave | Columnas derivadas + `data` |
|---|---|---|
| `quotations` | `id` | `position`, `folio`, `created_at`, `status`, `customer_id`, `customer_name`, `total_cents`, `data` |
| `quotation_items` | `id`+`quotation_id` (FK CASCADE) | `position`, `type`, `description`, `quantity`, `sale_unit_price_cents`, `amount_cents` |
| `customers` | `id` | `position`, `name`, `phone`, `data` |
| `vehicles` | autoinc | `customer_id`, `make`, `model`, `year`, `plates` (derivada de cotizaciones; se reconstruye en cada escritura de cotizaciones; **no** se usa para leer) |
| `invoices` | `uuid` | `position`, `folio`, `fecha_emision`, `total_text`, `total_cents`, `estado`, `data` (con `archivoOriginal` vacío cuando el original está en archivo) |
| `invoice_files` | `invoice_uuid` (FK CASCADE) | `kind` (pdf/xml), `name`, `rel_path`, `sha256`, `size_bytes` |
| `templates` | `id` | `position`, `name`, `data` |
| `internal_costs` | `quote_id` | `position`, `data` |
| `internal_controls` | `quotation_id` | `position`, `data` |
| `quote_drafts` | `id` | `position`, `data` |
| `settings` | `key` | `value` (JSON/texto): datos del taller, autoguardado, esquema, último respaldo |
| `counters` | `name` (`quotation`/`invoice`) | `last_number` (solo sube) |
| `meta` | `key` | `value`: `initialized`, `local_migration` (JSON con fecha y conteos), `created_at` |

Mapeo clave de almacenamiento → tabla (`position` = índice en el arreglo, así `db_load_snapshot` devuelve el arreglo en el MISMO orden):

| Clave `jc-motors:…:v1` | Destino | Identidad |
|---|---|---|
| `quotations` | `quotations` (+ `quotation_items`, `vehicles`) | `id` |
| `customers` | `customers` | `id` |
| `templates` | `templates` | `id` |
| `internal-controls` | `internal_controls` | `quotationId` |
| `internal-costs` | `internal_costs` | `quoteId` |
| `invoices` | `invoices` (+ `invoice_files`) | `uuid` |
| `quote-drafts` | `quote_drafts` | `id` |
| `quotation-folio` (`{"lastNumber":n}`) | `counters.quotation` | — |
| `invoice-folio` (`"n"`) | `counters.invoice` | — |
| `business-info`, `quote-autosave`, `meta:schema`, `meta:last-backup`, `meta:migration` | `settings` (valor tal cual) | clave |

Reglas de escritura (`db_apply`):
- Lista: JSON debe ser arreglo de objetos con identidad string única; si no → error y NADA se escribe. Se hace diff por identidad: se inserta/actualiza lo que cambió (comparando el JSON canónico con `data`), se borra lo ausente, se reordena `position`.
- Contadores: `UPDATE counters SET last_number = MAX(last_number, ?) WHERE name = ? RETURNING last_number`: **nunca retroceden**. Además, al escribir cotizaciones/facturas el contador sube a `MAX(contador, folio más alto de la lista)` (`JC-0007` → 7). Cotizaciones y facturas son contadores independientes.
- Borrar una clave (`value: null`): vacía la lista / borra el ajuste (los contadores no se borran).
- Facturas: `archivoOriginal` (base64) → se decodifica, se calcula SHA-256, se escribe `<datos>/facturas/<uuid>.<pdf|xml>` (temporal + rename) y en `invoice_files` quedan SOLO ruta relativa (`facturas/<uuid>.pdf`) + hash. Si el base64 no es válido o no hay `uuid` seguro para nombre de archivo, el valor se queda en línea dentro de `data` (nunca se pierde). Si el hash del archivo ya guardado coincide, no se reescribe. Al borrar la factura se borra su archivo DESPUÉS de confirmar la transacción.
- `db_load_snapshot`: reconstruye cada clave; reinyecta `archivoOriginal` leyendo el archivo (si falta o su hash no coincide, se devuelve igual lo que haya y se deja registro en stderr; nunca se aborta la carga).

## 3. Comandos Tauri (todos devuelven `Result<_, String>` con mensajes en español)

Los nombres se agregan a `build.rs` y a `capabilities/default.json` como `allow-<nombre-con-guiones>`. SOLO estos (más los 4 `save_*` existentes):

| Comando | Qué hace |
|---|---|
| `db_open() -> DbStatus` | abre/crea la base, migra esquema, integrity_check. `DbStatus { initialized: bool, schemaVersion, localMigrationDone: bool, corruptMovedTo: Option<String>, dataDir: String }`. Es el único que abre la conexión (en estado administrado `Mutex<Option<Connection>>`). |
| `db_load_snapshot() -> HashMap<String,String>` | todas las claves reconstruidas (ver §2). |
| `db_apply(changes: Vec<{key, value: Option<String>}>) -> ()` | una transacción; error ⇒ rollback total (y archivos de factura nuevos de ese lote se limpian). |
| `db_mark_initialized() -> ()` | «Empezar desde cero»: `meta.initialized=1` (+ contadores en 0). |
| `db_migrate_from_local(keys: HashMap<String,String>) -> MigrationReport` | ver §4. |
| `db_usage() -> Usage { dbBytes, filesBytes, filesCount, autoBytes, autoCount }` | para la pantalla Respaldo. |
| `db_auto_backup() -> Option<String>` | copia diaria (ver §6). |
| `backup_export() -> Option<ExportResult { path, sizeBytes, exportedAt, counts }>` | ver §5. |
| `backup_pick() -> Option<PickedBackup>` | diálogo «Abrir», valida y deja el respaldo en una carpeta temporal DENTRO de `<datos>` (guardada en estado administrado `Staged`; JS nunca da rutas). |
| `backup_apply() -> RestoreResult { quotations, customers, invoices, lastQuotationFolio, lastInvoiceFolio }` | aplica el respaldo preparado por `backup_pick`. |
| `backup_discard() -> ()` | descarta lo preparado. |

`window.__TAURI__.core.invoke` (ya existe `withGlobalTauri`). CSP sin cambios.

## 4. Migración única desde localStorage

`bootData()`: si `!initialized` y existen datos `jc-motors:*` de negocio en `localStorage` (cualquier clave de `BACKUP_EXPORT_KEYS` distinta de `sidebarTheme` con contenido, ya normalizadas con `migrateStorageKeys()`), llama `db_migrate_from_local` con TODAS esas claves (+ `quote-drafts`, `quote-autosave`, `meta:schema`, `meta:last-backup`):

1. Escribe `respaldos-auto/pre-migracion-<AAAA-MM-DD-HHmmss>.json` con el formato del lote 1 (`{app:"jc-motors", schemaVersion:1, exportedAt, claves:{<solo BACKUP_EXPORT_KEYS presentes>}}`). Si falla ⇒ aborta sin tocar nada.
2. UNA transacción que importa todo (misma lógica de `db_apply`, facturas a archivos).
3. Verificación DENTRO de la transacción, antes de `COMMIT`: (a) filas por entidad == longitud de cada arreglo; (b) suma de `total_cents` de cotizaciones == suma de `round(total*100)` de los datos de origen, y lo mismo para facturas (texto → centavos); (c) contadores == `max(contador de origen, folio más alto)`; (d) cada archivo de factura se vuelve a leer y su SHA-256 == el del base64 de origen; (e) `db_load_snapshot`-equivalente: cada clave de lista reconstruida es JSON-semánticamente igual (`serde_json::Value ==`) a la de origen.
4. Todo cuadra ⇒ `meta.initialized=1`, `meta.local_migration={date,counts}`, `COMMIT`. Cualquier fallo ⇒ `ROLLBACK`, se borran los archivos escritos en esa corrida, se devuelve `Err(detalle)`; el frontend deja el backend en `localStorage`, avisa con toast y escribe el detalle en `console`.
5. `localStorage` NO se toca. La próxima apertura, si la migración falló, vuelve a intentarlo.
6. Gancho de prueba (SOLO si `JCM_DATA_DIR` está definida): `JCM_TEST_FAIL_MIGRATION=1` provoca un error a mitad de la transacción.

## 5. Respaldo `.jcm` (zip)

`backup_export`:
1. `VACUUM INTO` a un temporal (nunca se copia el archivo vivo).
2. Zip con `manifest.json`, `jcmotors.db`, `facturas/*`. Manifest: `{app:"jc-motors", format:"jcm", schemaVersion (user_version), appVersion (CARGO_PKG_VERSION), exportedAt (ISO UTC), counts:{quotations,customers,invoices,templates,internalCosts,internalControls}, totalsCents:{quotations,invoices}, lastFolio:{quotation,invoice}, files:{"jcmotors.db":sha256,"facturas/x.pdf":sha256,…}}`.
3. Diálogo nativo «Guardar como» (Rust), nombre por defecto `Respaldo JC Motors AAAA-MM-DD HHmm.jcm` (hora local), carpeta inicial Descargas.
4. Escribe a `<destino>.tmp` en la carpeta destino, lo cierra, lo REABRE, recalcula todos los hashes contra el manifest y solo entonces lo renombra al nombre final. Si algo falla borra el temporal.

`backup_pick` (validación, sin tocar los datos actuales):
- `.jcm`: es zip válido, `manifest.json` con `app=="jc-motors"`, `format=="jcm"`; `schemaVersion` > actual ⇒ `Err("Este respaldo es de una versión más nueva; actualiza el sistema primero.")`; hash de cada archivo; extrae a `<datos>/tmp-restore-<id>/`; abre la `jcmotors.db` extraída, `PRAGMA integrity_check == ok`; si su versión es menor, aplica las migraciones a esa copia. Devuelve resumen `{kind:"jcm", fileName, exportedAt, quotations, customers, invoices, lastQuotationFolio, lastInvoiceFolio, hasCurrentData}`.
- `.json` (lote 1): `app=="jc-motors"`, `schemaVersion<=1`, `claves` mapa de strings ⇒ mismo resumen (`kind:"json"`), conteos leídos de las claves.
- Mensajes de error en español: no es de esta app, dañado/hash no coincide, versión más nueva, formato no reconocido.

`backup_apply`:
- Si hay datos actuales: antes guarda `respaldos-auto/pre-restauracion-<fecha>.db` (+ no borra nada). 
- `.jcm`: reemplazo atómico: copia la base extraída a `jcmotors.db.new`, sube los contadores a `MAX(actual, respaldo)` (los folios nunca bajan), intercambia por renombres (`facturas`→`facturas.old`, nueva→`facturas`, cierra conexión, `jcmotors.db`→`.old`, `.new`→`jcmotors.db`), reabre, `integrity_check`. Cualquier fallo ⇒ deshace los renombres y reabre la base anterior; los datos actuales quedan intactos. Al éxito borra `.old` y la carpeta temporal.
- `.json`: importa todo en UNA transacción reemplazando (lista vacía + import), contadores `MAX(actual, archivo, folio más alto)`, facturas a archivos; rollback si algo falla.
- Gancho de prueba (SOLO con `JCM_DATA_DIR`): `JCM_TEST_FAIL_RESTORE=1` falla a mitad (tras mover los archivos, antes de terminar) para probar la reversa.
- Tras el éxito el frontend recarga la ventana; un toast pendiente (en `sessionStorage`) muestra «Respaldo restaurado: N cotizaciones, N clientes, N facturas».

## 6. Copias automáticas

`db_auto_backup`: al abrir la app, si no hay ya `auto-AAAA-MM-DD-*.db` de hoy en `respaldos-auto/`, `VACUUM INTO respaldos-auto/auto-AAAA-MM-DD-HHmm.db`; conserva las 7 `auto-*` más recientes (los `pre-migracion-*` y `pre-restauracion-*` no entran en la rotación). Aviso en pantalla: «Estas copias te protegen si la base se daña, pero no si la computadora falla. Para eso exporta a una USB.» (Solo al abrir: cerrar la app no es un evento fiable en Tauri/WebView2; se documenta.)

## 7. Instalador NSIS

Los datos viven en `%APPDATA%\mx.jcmotors.cotizador\` (`app_data_dir`), fuera de `$INSTDIR`. El instalador actualiza/borra solo `$INSTDIR`; Tauri/NSIS ofrece la casilla «Eliminar datos de la aplicación» solo en el desinstalador (`DeleteAppDataCheckbox`, desmarcada por defecto en la versión actual de tauri-bundler); se debe verificar contra el `.nsi` generado y documentar el resultado.
