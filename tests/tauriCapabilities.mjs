import assert from 'node:assert/strict';
import { connect } from './cdpClient.mjs';

// #041: en la app COMPILADA, los comandos propios están permitidos y cualquier otra API de Tauri está denegada.
// Los comandos reciben bytes inválidos a propósito: fallan en Rust ANTES de abrir el diálogo "Guardar como".
//   WEBVIEW2_USER_DATA_FOLDER=<temporal> WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9224
const c = await connect(Number(process.env.CDP_PORT ?? 9224));
const call = (cmd, args = {}) => c.evaluate(`window.__TAURI__.core.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)}).then((v) => ({ ok: true, v }), (e) => ({ ok: false, e: String(e) }))`);
try {
  assert.equal(await c.evaluate('Boolean(window.__TAURI__?.core?.invoke)'), true, 'La app no está corriendo bajo Tauri');

  // Permitidos: llegan al código de Rust y este rechaza el contenido (no el permiso).
  const allowed = [
    ['save_quotation_pdf', /PDF válido/],
    ['save_invoice_pdf', /PDF válido/],
    ['save_backup_json', /respaldo generado no es válido/],
  ];
  for (const [cmd, expected] of allowed) {
    const r = await call(cmd, { folio: 'x', bytes: [1, 2, 3] });
    assert.equal(r.ok, false, cmd);
    assert.match(r.e, expected, `${cmd} debe llegar a Rust: ${r.e}`);
    assert.doesNotMatch(r.e, /not allowed|no permitido|ACL/i, `${cmd} fue bloqueado por permisos: ${r.e}`);
  }
  // save_invoice_xml no valida el contenido: se prueba con nombre inválido (solo símbolos) -> error de Rust antes del diálogo.
  const xml = await call('save_invoice_xml', { folio: '???', bytes: [1] });
  assert.equal(xml.ok, false);
  assert.match(xml.e, /nombre del archivo no es válido/, `save_invoice_xml debe llegar a Rust: ${xml.e}`);

  // Compartir: llegan a Rust, que rechaza los datos inválidos ANTES de tocar el disco, el portapapeles o abrir nada.
  const share = [
    ['save_shared_pdf', { filenameBase: 'x', bytes: [1, 2, 3] }, /PDF válido/],
    ['copy_file_to_clipboard', { path: 'C:/Windows/win.ini' }, /ruta del archivo no es válida/],
    ['reveal_in_folder', { path: 'C:/Windows/win.ini' }, /ruta del archivo no es válida/],
    ['open_whatsapp', { phone: '123', text: 'x' }, /10 dígitos/],
    ['open_mailto', { email: 'malo', subject: 's', body: 'b' }, /correo no es válido/],
    ['open_gmail', { email: 'malo', subject: 's', body: 'b' }, /correo no es válido/],
  ];
  for (const [cmd, args, expected] of share) {
    const r = await call(cmd, args);
    assert.equal(r.ok, false, cmd);
    assert.match(r.e, expected, `${cmd} debe llegar a Rust: ${r.e}`);
    assert.doesNotMatch(r.e, /not allowed|no permitido|ACL/i, `${cmd} fue bloqueado por permisos: ${r.e}`);
  }

  // Cierre de ventana: set_close_guard solo recibe un booleano (desactivado aquí para no interferir).
  const guard = await call('set_close_guard', { active: false });
  assert.equal(guard.ok, true, `set_close_guard debe estar permitido: ${guard.e}`);
  // close_app_window cierra la app, así que NO se invoca; solo se verifica su permiso de forma estática (capabilitiesStatic.mjs).

  // Denegados: todo lo demás que Tauri expone por IPC.
  const denied = [
    ['plugin:dialog|open', {}], ['plugin:dialog|save', {}], ['plugin:fs|read_text_file', { path: 'C:/Windows/win.ini' }],
    ['plugin:window|close', { label: 'main' }], ['plugin:app|version', {}], ['plugin:event|listen', { event: 'x', target: { kind: 'Any' }, handler: 1 }],
    ['plugin:path|resolve_directory', { directory: 21 }], ['plugin:opener|open_url', { url: 'https://example.com' }], ['plugin:opener|open_path', { path: 'C:/Windows' }],
    ['plugin:shell|open', { path: 'https://example.com' }], ['comando_que_no_existe', {}],
  ];
  const results = [];
  for (const [cmd, args] of denied) {
    const r = await call(cmd, args);
    results.push(`${cmd}: ${r.ok ? 'PERMITIDO' : r.e.slice(0, 90)}`);
    assert.equal(r.ok, false, `${cmd} no debería estar permitido`);
  }
  console.log(results.join('\n'));
  console.log('OK: solo los comandos propios están permitidos');
} finally {
  c.close();
}
