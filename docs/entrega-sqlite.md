# Entrega: SQLite local + respaldo `.jcm`

Rama `sqlite-respaldo`. Diseño y contrato: [sqlite-respaldo.md](sqlite-respaldo.md). Capturas: [capturas-sqlite/](capturas-sqlite/).

## Cómo se verificó

- **App compilada**: `npm run tauri build` (NSIS) y `node tests/sqliteE2E.mjs` (script manual, no está en `npm test`). Lanza `jc-motors-cotizador.exe` con un perfil de WebView2 (`WEBVIEW2_USER_DATA_FOLDER`) y una carpeta de datos (`JCM_DATA_DIR`) propios por prueba, dentro de una carpeta temporal. Controla la app por CDP y maneja los diálogos nativos «Guardar como» / «Abrir» con UI Automation + SendKeys (`tests/sqliteDialog.ps1`). No se tocaron datos reales.
- **Unitarias**: `npm run build` y `npm test` (262/262), y `cargo test` en `src-tauri` (13 pruebas; las corrió el paso del backend).
- No hubo violaciones de CSP en ninguna de las corridas del script (el arnés las registra y no imprimió ninguna).

## Estado por paso

| Paso | Estado | Archivos | Cómo se probó |
|---|---|---|---|
| Base `jcmotors.db` (WAL, FK, `user_version`, migraciones numeradas, `integrity_check`) | Hecho y verificado en app compilada | `src-tauri/src/db.rs`, `store.rs`, `error.rs` | T1 (se crea y migra); `cargo test` (esquema, base corrupta apartada) |
| Facturas (PDF/XML) como archivos + ruta relativa + SHA-256 | Hecho y verificado en app compilada | `files.rs`, `store.rs` | T1/T3/T6: los 8 archivos en `<datos>/facturas/` con el mismo hash que el original |
| Contadores de folio (solo suben, independientes) | Hecho y verificado en app compilada | `store.rs`, `folioService` sin cambios | T1 (contadores = origen); T3 (siguiente folio JC-0046 al crear una cotización tras restaurar); T5 (no bajan al restaurar) |
| Capa de datos: `Sqlite*Repository` + fábrica + espejo en memoria | Hecho y verificado en app compilada (flujos de T1, T3, T5) | `src/storage/sqliteStorage.ts`, `tauriDb.ts`, `dataBoot.ts`, `safeStorage.ts`, `src/repositories/Sqlite*`, `repositoryFactory.ts`, `main.tsx` | 17 pruebas Node con base falsa + las E2E. El **revertido por fallo de escritura** (memoria vuelve y aparece aviso) solo está probado en Node, no en la app compilada |
| Migración única desde localStorage | Hecho y verificado en app compilada | `migrate.rs`, `dataBoot.ts` | T1: 40 cotizaciones, 12 clientes, 3 plantillas, 5 costos, 5 controles, 8 facturas; cada clave reconstruida es igual a la de origen, totales iguales al centavo, contadores y hashes iguales, `localStorage` intacto, respaldo `pre-migracion-*.json` creado |
| Migración fallida a mitad | Hecho y verificado en app compilada | `migrate.rs` (gancho `JCM_TEST_FAIL_MIGRATION`) | T2: ROLLBACK (base vacía, sin archivos huérfanos), app sigue con localStorage, toast visible; la siguiente apertura sin el gancho migra bien |
| Exportar `.jcm` (VACUUM INTO, zip, manifest, temporal + renombrar + re-verificar) | Hecho y verificado en app compilada | `backup.rs`, `SqliteBackupPage.tsx` | T3: diálogo nativo manejado; el zip trae `manifest.json`, `jcmotors.db` y `facturas/*`; hashes del manifest coinciden; sin `.tmp` residual; toast «Respaldo guardado (27.8 KB)» con la ruta |
| Restaurar `.jcm` (bienvenida y pantalla Respaldo) | Hecho y verificado en app compilada | `backup.rs`, `RestoreFlow.tsx`, `BienvenidaPage.tsx` | T3: datos y perfil borrados → bienvenida → restaurar: conteos, totales, folios, hashes de PDFs y siguiente folio idénticos |
| Rechazo de archivos malos (dañado, otra app, versión más nueva, hash alterado) | Hecho y verificado en app compilada | `backup.rs` | T4: los cuatro se rechazan con mensaje claro, sin llegar al resumen, base vacía y sin carpetas temporales |
| Restauración que falla a la mitad | Hecho y verificado en app compilada | `backup.rs` (gancho `JCM_TEST_FAIL_RESTORE`) | T5: datos actuales idénticos tras el fallo, sin `.old/.new`; reintento sin gancho restaura 40 cotizaciones, el contador no baja y existe `pre-restauracion-*.db` |
| Restaurar JSON del lote 1 | Hecho y verificado en app compilada | `backup.rs` | T6 |
| Copias automáticas diarias (7) | Hecho; creación verificada en app compilada, **rotación a 7 solo con `cargo test`** | `backup.rs` | En la pantalla Respaldo aparece «Copias automáticas … (1)» tras abrir |
| Pantalla Respaldo (último respaldo «hoy/hace N días», guía, espacio) y recordatorio de 7 días | Hecho y verificado en app compilada (pantalla); recordatorio solo con pruebas Node | `SqliteBackupPage.tsx`, `backupFormat.ts`, `BackupReminder.tsx` | Capturas 02 y 03; `tests/backupFormat.mjs`, `tests/backup.mjs` |
| CSP sin cambios; capabilities solo con los comandos nuevos | Hecho y verificado en app compilada | `capabilities/default.json`, `build.rs`, `docs/SECURITY.md` | La app compilada ejecutó 10 de los 11 comandos nuevos sin errores de permisos (`backup_discard` no se invocó en las pruebas); sin violaciones de CSP |
| Instalador NSIS no borra datos | Hecho por inspección del script; **actualización real no probada** | — | Ver abajo |

## Estrategia elegida para lo asíncrono

Todo el acceso a datos pasa por `safeStorage`, así que no se tocó ninguna pantalla:

1. `main.tsx` muestra «Cargando JC Motors…», espera `bootData()` (abre la base, migra si toca, carga todo en memoria) y solo entonces importa `App`.
2. Con SQLite activo, `safeStorage` usa un almacén enrutado: las claves del negocio viven en un `Map` en memoria (lecturas síncronas, como antes); el tema de la barra lateral y las cuarentenas siguen en `localStorage`.
3. Las escrituras actualizan la memoria y se mandan a Rust en lotes, una transacción por lote (contador y cotización del mismo guardado van juntos). Los `Sqlite*Repository` esperan la confirmación; si falla, la memoria vuelve a lo confirmado y el método lanza. Los servicios síncronos (clientes, plantillas, borradores) escriben de forma optimista: si falla, se revierte, sale un aviso y la vista se recarga.
4. `data` (JSON exacto) es la fuente para reconstruir; las columnas relacionales son derivadas, para consultar y verificar la migración. Así no se pierde ningún campo.

## Instalador NSIS y los datos

Leído del `installer.nsi` generado (`src-tauri/target/release/nsis/x64/installer.nsi`):

- Los datos viven en `%APPDATA%\mx.jcmotors.cotizador\` (`jcmotors.db`, `facturas\`, `respaldos-auto\`), fuera de `$INSTDIR`.
- **Actualizar**: el instalador solo escribe en `$INSTDIR`; no toca `%APPDATA%`.
- **Desinstalar**: solo borra `$INSTDIR`, accesos directos y claves de registro. Borra `%APPDATA%\mx.jcmotors.cotizador` y `%LOCALAPPDATA%\mx.jcmotors.cotizador` **únicamente** si el usuario marca la casilla «Eliminar datos de la aplicación», que Tauri agrega a la pantalla de confirmación. La casilla se crea sin marca (`CreateWindowEx` sin `BS_CHECKED`), así que por defecto **no se borra nada**. En desinstalación silenciosa/pasiva esa pantalla se omite y tampoco se borra.
- Aviso para el taller: si alguien marca esa casilla, se pierde la base. Conviene decirlo en el uso diario: «No marques "Eliminar datos" al desinstalar».
- `installer-hooks.nsh` no se modificó.

## Lista de comprobación manual (lo que NO se pudo verificar)

1. **Actualizar con el instalador encima de una versión con datos** (T7): no se ejecutó, porque el instalador escribe accesos directos del escritorio/menú Inicio, el registro de usuario y la ruta de instalación, y habría modificado la instalación real. En una PC de prueba: instalar la versión anterior, abrirla y guardar una cotización; instalar encima esta versión; comprobar que abre sin la pantalla de bienvenida, que las cotizaciones siguen y que `%APPDATA%\mx.jcmotors.cotizador\jcmotors.db` conserva su fecha.
2. **Desinstalar con la casilla desmarcada** y reinstalar: la carpeta `%APPDATA%\mx.jcmotors.cotizador` debe seguir ahí y la app debe abrir con los datos.
3. **Primera apertura real con tus datos**: antes de instalar, exporta un respaldo JSON desde la versión actual a una USB. Tras instalar, comprueba el toast/estado, que existe `respaldos-auto\pre-migracion-*.json` y que Historial, Clientes y Facturas se ven igual. Los datos de `localStorage` se conservan intactos como reserva.
4. **Exportar a una USB real** y retirarla a mitad: el flujo escribe a `.tmp` y renombra, pero solo se probó contra una carpeta local.
5. **Restaurar en otra computadora distinta** (no solo otra carpeta de datos).
6. **Rotación de copias automáticas a 7 y recordatorio de «Hace N días»** en la app compilada con fechas reales (solo cubiertos por `cargo test` y pruebas Node).
7. **Fallo real de escritura** en la base (disco lleno / archivo bloqueado): el revertido y el aviso solo se probaron con una base falsa en Node.
8. **Copia automática al cerrar** la app: no existe; solo al abrir (cerrar no es un evento fiable en Tauri/WebView2).
9. **Rendimiento con miles de cotizaciones**: cada escritura de una lista manda el arreglo completo por IPC; no se midió con 20,000 cotizaciones (lo pedía el plan).

## Notas

- Los ganchos `JCM_TEST_FAIL_MIGRATION` y `JCM_TEST_FAIL_RESTORE` solo actúan si también está definida `JCM_DATA_DIR`; sin ella son inertes.
- `docs/capturas-sqlite/03-respaldo-exportado.png` muestra en el toast la ruta temporal de la prueba (incluye el nombre de usuario de Windows de la máquina de pruebas).
- `tests/sqliteE2E.mjs` necesita sesión interactiva con la ventana de la app en primer plano (SendKeys). Uso: `E2E_WORK=<carpeta vacía> node tests/sqliteE2E.mjs [T1 … T6]`.
