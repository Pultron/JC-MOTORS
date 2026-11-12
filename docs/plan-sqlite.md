# Plan: migrar el almacenamiento de localStorage a SQLite (M03)

Estado: **solo plan**. No se tocó código ni dependencias por este punto.

## 1. ¿Se justifica ya?

### Lo que se midió

Medición con registros de ejemplo con la forma real de los modelos (`Quotation`, `CustomerProfile`, `Invoice`), serializados como los guarda la app (JSON en localStorage). La cuota que usa la app para avisar es `ESTIMATED_QUOTA_CHARS = 5 × 1024 × 1024` caracteres (`src/storage/storageUsage.ts`); en WebView2/Chromium la cuota real ronda los 5 millones de caracteres por origen.

| Registro | Tamaño en localStorage |
|---|---|
| Cotización típica (6 conceptos) | ≈ 1.8 KB |
| Cotización grande (12 conceptos) | ≈ 2.9 KB |
| Cliente | ≈ 0.16 KB |
| Factura importada desde XML (original en base64 + campos leídos) | ≈ 10 KB |
| Factura importada desde PDF (original de ≈ 90 KB en base64 + campos) | ≈ 120 KB |

### Crecimiento por año (mezcla 70 % típicas / 30 % grandes, 300 días hábiles)

| Ritmo | Cotizaciones/año | Espacio/año | % de los 5 MB |
|---|---|---|---|
| 5 por día | 1,500 | 3.1 MB | 60 % |
| 10 por día | 3,000 | 6.3 MB | 120 % |
| 20 por día | 6,000 | 12.6 MB | 240 % |

| Facturas importadas | Con PDF original (≈ 90 KB) | Solo XML |
|---|---|---|
| 10 por mes | 14.7 MB/año | 1.3 MB/año |
| 30 por mes | 44.1 MB/año | 3.8 MB/año |

### Conclusión de la medición

- **Las cotizaciones por sí solas** llenan los 5 MB en 1 a 2 años a un ritmo de taller mediano (5-10 por día).
- **Las facturas con PDF original son el verdadero problema**: con 10 PDFs al mes se agotan los 5 MB en unos 4 meses, sin contar nada más. Cada PDF pesa más que 60 cotizaciones.
- Los datos reales del taller **no se leyeron** (no se abrió ningún perfil real); las cifras son de datos de ejemplo. El indicador de uso de la pantalla «Respaldo» muestra el porcentaje real del taller; ese número es el que decide cuándo actuar.

**Se justifica, pero no es urgente si el taller importa pocas facturas en PDF.** Si ya se acerca al 60-70 % en «Respaldo», sí es urgente.

## 2. Opciones

### A. `tauri-plugin-sql` (sqlx)

- **A favor:** menos Rust que escribir; ecosistema oficial; migraciones integradas (`Builder::add_migrations`).
- **En contra:**
  - El frontend ejecuta SQL arbitrario: requiere permisos `sql:allow-execute` / `sql:allow-select`, que no se pueden restringir por tabla ni por sentencia. Contradice el esfuerzo de #041 (capabilities mínimas): cualquier XSS equivale a lectura/escritura total de la base.
  - Las transacciones atómicas (contador de folio) quedan repartidas en llamadas JS separadas; no hay una transacción real entre `select` y `update` sin trucos.
  - Añade `sqlx` (compilación más pesada) y un plugin más que mantener actualizado.

### B. `rusqlite` con comandos propios (recomendada)

- **A favor:**
  - Superficie mínima: comandos tipados (`list_quotations`, `save_quotation`, `next_quotation_folio`, …); la capability solo permite esos comandos.
  - Transacciones reales en Rust: el folio se incrementa y la cotización se guarda en una sola transacción.
  - Validación en el borde: el comando rechaza datos mal formados antes de escribir.
  - `rusqlite` con la feature `bundled` compila SQLite dentro del ejecutable: no depende de nada del sistema; el instalador NSIS no cambia.
- **En contra:** más código Rust propio (≈ 600-900 líneas); hay que mantener los comandos sincronizados con los tipos TypeScript; compilar SQLite necesita compilador de C (MSVC ya presente porque Rust en Windows lo requiere).

**Elección: B.** Las dos opciones son viables, pero B mantiene la política de seguridad del lote (permisos mínimos) y hace atómico lo que debe serlo.

## 3. Esquema propuesto

SQLite en modo `WAL`, `foreign_keys = ON`, `user_version` como versión de esquema. Dinero en **centavos enteros** (`INTEGER`), igual que el código actual (`currencyUtils`).

```sql
CREATE TABLE settings (            -- ajustes del taller (businessInfo), clave/valor JSON
  key TEXT PRIMARY KEY, value TEXT NOT NULL
);

CREATE TABLE counters (            -- contadores de folio
  name TEXT PRIMARY KEY,           -- 'quotation' | 'invoice'
  last_number INTEGER NOT NULL
);

CREATE TABLE customers (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', email TEXT,
  aliases TEXT NOT NULL DEFAULT '[]'          -- JSON; son pocos y solo se usan para buscar
);
CREATE INDEX customers_phone ON customers(phone);

CREATE TABLE vehicles (            -- hoy es un objeto dentro de la cotización; se normaliza
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  make TEXT NOT NULL, model TEXT NOT NULL, year INTEGER, plates TEXT NOT NULL DEFAULT '',
  UNIQUE (customer_id, plates, make, model)
);

CREATE TABLE quotations (
  id TEXT PRIMARY KEY, folio TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL, customer_email TEXT,   -- copia congelada: la cotización no cambia si editan al cliente
  vehicle_id INTEGER REFERENCES vehicles(id), vehicle_make TEXT, vehicle_model TEXT, vehicle_year INTEGER, vehicle_plates TEXT,
  status TEXT NOT NULL CHECK (status IN ('Pendiente','Aprobada','Cancelada','Vencida')),
  include_vat INTEGER NOT NULL, validity_days INTEGER NOT NULL,
  labor_discount_type TEXT NOT NULL, labor_discount_value INTEGER NOT NULL,
  approved_at TEXT, public_notes TEXT NOT NULL DEFAULT '', customer_notes TEXT NOT NULL DEFAULT '',
  total_cents INTEGER NOT NULL                                                          -- solo para listados y verificación
);
CREATE INDEX quotations_created ON quotations(created_at DESC);
CREATE INDEX quotations_status ON quotations(status);

CREATE TABLE quotation_items (
  id TEXT PRIMARY KEY, quotation_id TEXT NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  position INTEGER NOT NULL, type TEXT NOT NULL CHECK (type IN ('labor','part')),
  description TEXT NOT NULL, quantity REAL NOT NULL, sale_unit_price_cents INTEGER NOT NULL, amount_cents INTEGER NOT NULL
);

CREATE TABLE invoices (
  uuid TEXT PRIMARY KEY, folio INTEGER NOT NULL UNIQUE, fecha_emision TEXT NOT NULL,
  emisor_rfc TEXT, emisor_nombre TEXT, receptor_rfc TEXT, receptor_nombre TEXT,
  total TEXT NOT NULL,                       -- texto exacto del CFDI, sin redondear
  estado TEXT NOT NULL, data TEXT NOT NULL   -- el resto del modelo como JSON
);
CREATE TABLE invoice_files (                 -- los originales salen de la fila principal
  invoice_uuid TEXT PRIMARY KEY REFERENCES invoices(uuid) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('pdf','xml')), name TEXT NOT NULL, content BLOB NOT NULL   -- binario real, sin el 33 % de base64
);

CREATE TABLE templates (id TEXT PRIMARY KEY, name TEXT NOT NULL, items TEXT NOT NULL);       -- plantillas de conceptos
CREATE TABLE internal_costs (
  quote_id TEXT PRIMARY KEY REFERENCES quotations(id) ON DELETE CASCADE,
  data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL                     -- costos y gastos internos
);
CREATE TABLE quote_drafts (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
```

Notas de diseño:

- **Contadores:** `UPDATE counters SET last_number = last_number + 1 WHERE name = ? RETURNING last_number` dentro de la misma transacción que el `INSERT` de la cotización. Hoy el contador vive en una clave aparte de localStorage; si falla la escritura entre las dos, se pierde o se repite un folio.
- **Cliente congelado en la cotización:** se conserva la copia de nombre/teléfono/correo como hoy, para que editar o borrar a un cliente nunca cambie una cotización ya emitida.
- **Originales de facturas en `BLOB`:** quitan ~33 % de base64 y sacan los 90 KB de cada PDF de las consultas de listado.
- **Datos poco consultados** (`aliases`, `templates.items`, `internal_costs.data`) se dejan como JSON: no hay consultas sobre ellos y normalizarlos solo añadiría riesgo.

## 4. Aprovechar los repositorios existentes

Ya existen interfaces: `QuotationRepository`, `InvoiceRepository`, `InternalControlRepository` y el repositorio de costos internos, cada una con su `LocalStorage*Repository`. El plan:

1. **Etapa 0 (preparatoria, sin SQLite):** los datos que hoy **no** pasan por un repositorio (clientes vía `customerService`, plantillas vía `quoteTemplateService`, contadores vía `folioService`, `businessInfo`) se mueven detrás de interfaces equivalentes. Importante: `customerService.list` es **síncrono** y `CustomerContext` depende de ello; SQLite es asíncrono, así que este paso cambia el contrato a `Promise` y es donde más puede romperse la interfaz.
2. Nuevas clases `SqliteQuotationRepository`, `SqliteInvoiceRepository`, … que implementan **las mismas interfaces** y llaman a los comandos de Tauri.
3. Un único punto de composición elige la implementación (`StorageBackend = 'localStorage' | 'sqlite'`), de modo que se puede volver atrás cambiando una constante y los datos de localStorage siguen intactos (ver §5).
4. Fuera de Tauri (`npm run dev` en navegador, tests) se sigue usando `LocalStorage*Repository`: los tests existentes no cambian.

## 5. Migración única de datos, con verificación

Ocurre **una sola vez**, en el primer arranque de la versión con SQLite, y nunca borra nada de localStorage por sí sola.

1. Detectar `PRAGMA user_version = 0` + datos presentes en localStorage → ofrecer la migración con un diálogo claro («Se actualizará el almacenamiento. Tus datos actuales se conservan»).
2. **Respaldo previo obligatorio:** exportar el respaldo JSON del lote 1 (mismo formato y verificación) antes de empezar; si falla, no se migra.
3. Leer todo con los `LocalStorage*Repository` actuales y escribir en SQLite **dentro de una sola transacción**.
4. **Verificación antes de confirmar** (todo debe coincidir o se hace `ROLLBACK`):
   - conteo por tabla = conteo por clave de localStorage (cotizaciones, conceptos, clientes, facturas, plantillas, costos);
   - suma de `total_cents` de cotizaciones = suma de totales calculados con `calculateQuotationTotals` sobre los datos originales;
   - suma de totales de facturas (texto → centavos) igual;
   - contadores de folio ≥ el mayor folio existente;
   - para una muestra de registros (primero, último y 20 al azar), comparación campo por campo del objeto reconstruido contra el original.
5. Solo si todo coincide: `COMMIT`, marcar `user_version = 1` y guardar en `settings` la fecha y los conteos de la migración.
6. **Las claves de localStorage se conservan** (solo lectura) hasta que el usuario pulse «Ya comprobé mis datos, liberar espacio» en la pantalla de Respaldo (al menos 30 días recomendados). Ese botón borra solo las claves migradas y exige confirmación.
7. Si el taller ya está al 100 % de localStorage y la app no puede escribir, el plan sigue funcionando: la migración solo **lee** de localStorage.

## 6. Dónde vive la base, instalación y respaldo

- **Ubicación:** `app.path().app_data_dir()` → `%APPDATA%\mx.jcmotors.cotizador\jc-motors.db` (carpeta del identificador de la app). No dentro de la carpeta de instalación.
- **Actualizar con NSIS:** el instalador reemplaza el directorio de instalación; los datos en `%APPDATA%` no se tocan. Hoy los datos están en el perfil de WebView2 (`%LOCALAPPDATA%\mx.jcmotors.cotizador\EBWebView`), que tampoco se borra al actualizar.
- **Desinstalar:** `installer-hooks.nsh` actual no borra datos de usuario; conviene **dejarlo así** (o preguntar explícitamente) para que reinstalar no pierda el taller. Documentarlo en la pantalla de Respaldo.
- **Respaldo exportable:** el formato JSON del lote 1 se conserva como formato de intercambio y para restaurar. El comando de exportar lee de SQLite y produce el mismo JSON; el de importar valida y escribe en una transacción. Adicional recomendado: copia automática del `.db` con `VACUUM INTO` antes de cada actualización de esquema.
- **Corrupción:** `PRAGMA integrity_check` al abrir; si falla, no se sobrescribe: se renombra el archivo a `jc-motors.db.corrupt-<fecha>` y se ofrece restaurar el último respaldo.

## 7. CSP, capabilities, riesgos y reversa

**CSP (#040):** no cambia. SQLite vive en Rust; el WebView solo habla con comandos por IPC (`ipc:` / `http://ipc.localhost`, ya permitidos en `connect-src`). Con la opción A habría que revisar de nuevo; con B no.

**Capabilities (#041):** se agregan solo los comandos nuevos al manifiesto de la app (`allow-list-quotations`, `allow-save-quotation`, …), mismos criterios que los cuatro actuales. Sin `sql:*` y sin acceso a archivos desde el frontend.

**Riesgos:**

| Riesgo | Mitigación |
|---|---|
| Pérdida o corrupción de datos reales en la migración | Respaldo previo obligatorio, transacción única, verificación por conteos y sumas, localStorage intacto |
| `customerService` síncrono rompe la UI al hacerse asíncrono | Etapa 0 aislada, con tests, antes de tocar SQLite |
| Divergencia entre tipos TS y estructuras Rust | Tests de ida y vuelta (objeto → comando → objeto) con los fixtures existentes |
| Compilar SQLite alarga el build / falla en otra máquina | `rusqlite` con `bundled`; probar el build de NSIS en limpio |
| El usuario borra `%APPDATA%` o reinstala en otro equipo | Respaldo JSON recordado por `BackupReminder` (ya existe) |
| Dos instancias abiertas | WAL + `busy_timeout`; Tauri `single-instance` como mejora opcional |

**Plan de reversa:** (1) mientras no se pulse «liberar espacio», volver atrás es cambiar `StorageBackend` a `'localStorage'`; los datos originales siguen ahí. (2) Lo escrito en SQLite después de migrar no se vuelve a localStorage automáticamente: antes de volver, exportar el respaldo JSON desde SQLite e importarlo con el flujo normal. (3) Se mantiene el exportador JSON sin cambios.

## 8. Esfuerzo por etapas y pruebas

| Etapa | Contenido | Esfuerzo estimado |
|---|---|---|
| 0 | Repositorios para clientes, plantillas, folios y ajustes; `Promise` en clientes | 2-3 días |
| 1 | Crate/módulo Rust: apertura, `user_version`, migraciones de esquema, `integrity_check` | 1-2 días |
| 2 | Comandos de cotizaciones, conceptos, clientes, contadores (con transacción de folio) | 3-4 días |
| 3 | Comandos de facturas y archivos (BLOB), plantillas, costos, borradores | 2-3 días |
| 4 | `Sqlite*Repository` + selector de backend | 2 días |
| 5 | Migración con verificación y UI (diálogo, informe, botón «liberar espacio») | 3 días |
| 6 | Respaldo/restauración desde SQLite, NSIS, pruebas en instalador limpio y en actualización | 2-3 días |
| Total | | **≈ 15-20 días de trabajo** |

**Plan de pruebas:**

- Rust: pruebas unitarias de cada comando con base en memoria; la transacción de folio con hilos concurrentes (sin duplicados ni saltos).
- Contrato: los mismos tests de repositorio que hoy corren contra `LocalStorage*Repository` corren contra `Sqlite*Repository` (misma batería, dos implementaciones).
- Migración: fixtures con 1,000 cotizaciones y 200 facturas (el script de `tests/historialPerf.mjs` ya siembra datos); caso de datos dañados; caso de localStorage lleno; caso de corte a la mitad (matar la app durante la migración → no queda nada a medias).
- Rendimiento: abrir Historial y buscar con 20,000 cotizaciones.
- Instalador: instalar encima de la versión anterior con datos reales de prueba, desinstalar y reinstalar, verificar que los datos persisten.
- Manual en la app compilada: todos los flujos del paso de humo (cotizar, PDF, factura, respaldo).

## 9. Recomendación

**Después, no ahora, y con un paso intermedio barato que se puede hacer ya.**

1. **No migrar ahora.** Es el cambio de mayor riesgo posible en una app con datos reales y sin copia en la nube; ~15-20 días, y los costos de un error (perder cotizaciones o folios fiscales repetidos) superan el beneficio mientras haya margen.
2. **Sí vigilar el número:** si la pantalla «Respaldo» muestra **más del 60 %** de uso, o el taller importa más de unas 10 facturas en PDF al mes, planear la migración ese trimestre; al **80 %** hacerla ya (a partir de ahí un error de cuota ya puede bloquear el guardado de una cotización).
3. **Paso intermedio recomendado (1 día, bajo riesgo):** dejar de guardar el PDF original dentro de localStorage cuando ya se guardó el XML/los campos leídos, o permitir descartarlo desde la factura. Es la mayor parte del consumo y retrasa la migración mucho tiempo.
4. **Cuando se haga: opción B (rusqlite con comandos propios)**, empezando por la Etapa 0 (repositorios para todo), que además mejora el código aunque nunca se llegue a SQLite.
5. **«Nunca» no es sensato** si el taller crece: la cuota de localStorage es un techo duro, y hoy no hay manera de aumentarla.
