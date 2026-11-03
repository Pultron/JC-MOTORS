/**
 * Guarda un PDF: en Tauri pide la ruta al proceso nativo; en el navegador lo descarga.
 * Devuelve la ruta elegida en Tauri (null si el usuario canceló) o undefined en el navegador.
 */
export async function savePdfFile(
  file: File,
  folio: string,
  command: 'save_quotation_pdf' | 'save_invoice_pdf' | 'save_invoice_xml' ='save_quotation_pdf',
): Promise<string | null | undefined> {
  const tauriInvoke = window.__TAURI__?.core.invoke;
  if (tauriInvoke) {
    const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
    return tauriInvoke<string | null>(command, { folio, bytes });
  }

  const objectUrl = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = file.name;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // El navegador necesita tiempo para leer el blob después del clic.
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  return undefined;
}
