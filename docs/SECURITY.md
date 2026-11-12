# Seguridad de JC Motors Cotizador

Este documento describe la política de contenido (CSP) y los permisos de Tauri de la aplicación, con la razón de cada decisión. Si cambias cualquiera de los dos archivos de configuración, actualiza este documento y repite la verificación de la sección «Cómo verificar».

Archivos: `src-tauri/tauri.conf.json` (`app.security`), `src-tauri/capabilities/default.json`, `src-tauri/build.rs`, `src-tauri/src/lib.rs`.

## 1. Content Security Policy (#040)

Antes del lote 5 la CSP era `null` (sin restricciones). Cualquier script inyectado —por ejemplo desde el contenido de una factura XML o un respaldo— habría podido ejecutarse y llamar a los comandos de la app.

### Política de producción (`app.security.csp`)

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
font-src 'self' data:;
connect-src 'self' ipc: http://ipc.localhost;
worker-src 'self';
frame-src 'self' blob:;
object-src 'none';
base-uri 'self';
form-action 'none'
```

(En el archivo va en una sola línea.) Se partió de una política estricta y se fue endureciendo: cada directiva está en su valor mínimo que **no produce ninguna violación** en los flujos recorridos en la app compilada.

| Directiva | Valor | Por qué |
|---|---|---|
| `default-src` | `'self'` | Todo lo que no tenga directiva propia solo puede venir de la propia app. |
| `script-src` | `'self'` | Solo el JavaScript empaquetado por Vite. Tauri añade por su cuenta los *hashes* de sus scripts de arranque; no se necesita `'unsafe-inline'` ni `'unsafe-eval'`. |
| `style-src` | `'self' 'unsafe-inline'` | React escribe atributos `style="…"` (anchos, retrasos de animación, posición de la píldora del menú, etc.). Los estilos en línea no ejecutan código; es el único `unsafe-inline` y no está en scripts. |
| `img-src` | `'self' data:` | Logo y recursos empaquetados (`'self'`) y el logo que se convierte a PNG en un canvas para el PDF (`data:`). Ya no se permite `blob:` en imágenes: ningún flujo lo usa. |
| `font-src` | `'self' data:` | Fuentes empaquetadas. Las TTF que usa el PDF se leen con `fetch` (ver `connect-src`). |
| `connect-src` | `'self' ipc: http://ipc.localhost` | `fetch` de las fuentes y del logo del PDF (empaquetados, `'self'`) y el canal IPC de Tauri 2 en Windows (`http://ipc.localhost`) / otros sistemas (`ipc:`), por donde viajan los comandos de guardado. **No hay ningún acceso a Internet.** |
| `worker-src` | `'self'` | PDF.js crea su *worker* desde un archivo empaquetado (`pdf.worker.min.mjs`), mismo origen. Se comprobó que no necesita `blob:`. |
| `frame-src` | `'self' blob:` | La vista previa del PDF de la cotización es un `<iframe>` con una URL `blob:` creada en la propia app. |
| `object-src` | `'none'` | Se comprobó que el visor de PDF funciona en el `<iframe>` sin `<object>`/`<embed>`; se bloquean los plugins. |
| `base-uri` | `'self'` | Impide cambiar la base de las URL relativas con una etiqueta `<base>` inyectada. |
| `form-action` | `'none'` | Ningún formulario envía datos a ningún lado (los envíos los maneja React con `preventDefault`). |

**Prohibido** (y no presente): `'unsafe-eval'`, comodines `*`, `https:` abierto, `data:` en scripts.

**`'wasm-unsafe-eval'`: no se agregó.** Se comprobó en la app compilada que PDF.js lee y renderiza los PDF de factura de prueba (texto, QR, imagen) sin intentar compilar WebAssembly. Si algún día un PDF escaneado con imágenes JPEG 2000 falla, la consola mostrará `Refused to compile or instantiate WebAssembly module`; en ese caso se evaluaría agregarlo **solo** a `script-src` y se documentaría aquí. No se agrega «por si acaso».

### Política de desarrollo (`app.security.devCsp`)

Igual que la de producción, salvo:

| Diferencia | Motivo |
|---|---|
| `script-src 'self' 'unsafe-inline'` | Vite inyecta en desarrollo un script en línea para React Fast Refresh. |
| `connect-src` añade `ws://localhost:5173 http://localhost:5173` | HMR de Vite (WebSocket) y carga de módulos desde el servidor de desarrollo. |

`devCsp` solo se usa con `npm run tauri dev`; no se empaqueta en el instalador. Verificada con `tauri dev` (perfil de WebView2 aislado): los mismos flujos corren sin violaciones; un WebSocket a otro host queda bloqueado.

### Flujos recorridos (app compilada, sin violaciones)

Con `tests/cspFlujos.mjs` contra el ejecutable de Tauri, con perfil de WebView2 aislado:

- inicio y logo en pantalla;
- vista previa del PDF de una cotización de 12 conceptos (2 hojas, logo, fuentes);
- importar factura XML;
- importar factura PDF (PDF.js con su *worker*, jsQR) y ver el original (PDF.js sobre canvas);
- paleta de búsqueda (Ctrl+K);
- lectura de un respaldo en Respaldo → importar;
- tema oscuro del sistema.

Además se comprobó que la política **sí se aplica**: un `fetch` a `https://…`, un script en línea y una imagen remota quedan bloqueados.

**No verificado en la app compilada** (los abre el sistema operativo, no la página): el diálogo «Guardar como» al descargar PDF, XML y respaldo; el botón **Imprimir** (`window.open` de una URL `blob:`); instalar, actualizar y desinstalar con el instalador NSIS (el instalador **sí compila**, pero no se ejecutó). Ver la lista de comprobación manual en la entrega del lote.

## 2. Permisos de Tauri (#041)

Antes del lote 5 la capability `default` solo tenía `core:default` (permisos de ventana, eventos, rutas, menús…) que la app no usaba. Ahora:

```json
{
  "identifier": "default",
  "windows": ["main"],
  "permissions": [
    "allow-save-quotation-pdf",
    "allow-save-invoice-pdf",
    "allow-save-invoice-xml",
    "allow-save-backup-json"
  ]
}
```

| Permiso | Para qué sirve | Quién lo usa |
|---|---|---|
| `allow-save-quotation-pdf` | Comando de Rust `save_quotation_pdf`: abre «Guardar como», valida que los bytes sean un PDF (`%PDF-`) y los escribe donde el usuario elija. | `QuotationPdfDialog`, `useQuotationPdfDownload` (vía `savePdfFile`) |
| `allow-save-invoice-pdf` | `save_invoice_pdf`: igual, para el PDF de una factura y el PDF original importado. | `FacturasPage` |
| `allow-save-invoice-xml` | `save_invoice_xml`: guarda el XML original de una factura. | `FacturasPage` |
| `allow-save-backup-json` | `save_backup_json`: guarda el respaldo (exige que empiece con `{`). | `BackupPage` |

Principios:

- **Sin acceso libre al disco.** No hay `fs:*`, `shell:*` ni `dialog:*` para el WebView. El diálogo «Guardar como» lo abre **Rust** (`tauri_plugin_dialog` se usa solo desde `lib.rs`), así que el JavaScript solo puede entregar bytes y un nombre; el usuario decide la ruta y la extensión se fuerza desde Rust. El nombre del archivo se limpia a caracteres ASCII seguros y 80 caracteres.
- **Solo la ventana `main`.** La app tiene una sola ventana.
- **Sin `core:default`.** La app no usa eventos, ventanas ni rutas desde JavaScript (solo `window.__TAURI__.core.invoke` de sus propios comandos). Se comprobó que sin él la app arranca y todos los flujos funcionan.
- **Cómo se declaran.** `build.rs` lista los comandos en el *app manifest* de Tauri; el build genera un permiso por comando en `src-tauri/permissions/autogenerated/` (versionado para poder revisarlo). Agregar un comando nuevo exige: la función en `lib.rs`, su nombre en `build.rs`, y su permiso en la capability. Sin esos tres pasos, el comando queda **denegado**.

### Comprobación en la app compilada

`tests/tauriCapabilities.mjs` invoca desde la página:

- los 4 comandos propios → llegan al código de Rust (rechazan los datos de prueba a propósito antes de abrir el diálogo);
- `plugin:dialog|open`, `plugin:dialog|save`, `plugin:fs|read_text_file`, `plugin:window|close`, `plugin:app|version`, `plugin:event|listen`, `plugin:path|resolve_directory` y un comando inexistente → **«not allowed by ACL»**.

## 3. Mensajes de error (#042)

Las pantallas y avisos no muestran textos técnicos. `src/utils/userMessage.ts` convierte cualquier error en un mensaje genérico en español según el contexto («No se pudo generar el PDF. Intenta de nuevo.»); el detalle va a `console.error` con el contexto. Los errores de validación que ya son mensajes para la persona (`UserMessageError`, `BackupError`, `CfdiParseError`, `DraftStorageFullError`) se muestran tal cual.

## 4. Dependencias (#043, #044, #045)

- Las dependencias críticas (`jspdf`, `react`, `react-dom`, `react-router`, `vite`, `tailwindcss`, `@tailwindcss/vite`, `@tauri-apps/cli`) están fijadas a versión exacta; `.npmrc` tiene `save-exact=true`. `package-lock.json` y `Cargo.lock` están versionados. **Subir versiones es una decisión aparte**, con su propia prueba.
- Objetivo de compilación: Windows `chrome105` (WebView2); otros sistemas `safari15`.
- `crypto.randomUUID` existe desde Safari 15.4: `createId` conserva un respaldo con `crypto.getRandomValues` (nunca `Math.random`).

## 5. Cómo verificar después de cambiar algo

1. `npm run build` y `npm test`.
2. Compilar: `cd src-tauri && npx tauri build --no-bundle`.
3. Abrir el `.exe` con un **perfil de WebView2 aislado** (así nunca se tocan los datos reales del taller):
   `WEBVIEW2_USER_DATA_FOLDER=<carpeta temporal>` y `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9224`.
4. `APP_URL=http://tauri.localhost CDP_PORT=9224 node --experimental-strip-types --loader ./tests/ts-loader.mjs tests/cspFlujos.mjs` → debe decir «SIN violaciones de CSP».
5. `CDP_PORT=9224 node tests/tauriCapabilities.mjs`.
6. Revisar a mano lo que depende del sistema operativo (guardar como, imprimir, instalador).
