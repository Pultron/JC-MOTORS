import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, X } from 'lucide-react';
import type { Invoice } from '../../models/invoice';
import { abrirPdf } from '../../services/pdfInvoice';
import { base64ToBytes } from '../../utils/base64';

interface Props {
  invoice: Invoice;
  title: string;
  onDownload: () => void;
  onClose: () => void;
}

/** Páginas del PDF dibujadas con pdf.js: respaldo para webviews que no incrustan PDF en un iframe. */
function PdfPages({ bytes }: { bytes: Uint8Array }) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const pdf = await abrirPdf(bytes);
        for (let n = 1; n <= pdf.numPages; n++) {
          const page = await pdf.getPage(n);
          const viewport = page.getViewport({ scale: 1.6 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = 'fac-modal-page';
          await page.render({ canvas, viewport }).promise;
          if (cancelled) return;
          host.current?.appendChild(canvas);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; host.current?.replaceChildren(); };
  }, [bytes]);

  return (
    <div className="fac-modal-pages" ref={host} data-testid="original-pages">
      {failed && <p className="fac-modal-error">No se pudo mostrar el PDF original. Puedes descargarlo.</p>}
    </div>
  );
}

export function OriginalPreview({ invoice, title, onDownload, onClose }: Props) {
  const esPdf = invoice.archivoTipo === 'pdf';
  const bytes = useMemo(() => base64ToBytes(invoice.archivoOriginal), [invoice.archivoOriginal]);
  const texto = useMemo(() => (esPdf ? '' : new TextDecoder('utf-8').decode(bytes)), [esPdf, bytes]);
  const [url, setUrl] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // La webview de Tauri no siempre incrusta PDF en un iframe: allí se dibujan las páginas con pdf.js.
  const usarCanvas = esPdf && Boolean(window.__TAURI__);

  useEffect(() => {
    if (!esPdf || usarCanvas) return undefined;
    const objectUrl = URL.createObjectURL(new Blob([bytes.slice()], { type: 'application/pdf' }));
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [esPdf, usarCanvas, bytes]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (opener?.isConnected) opener.focus();
    };
  }, [onClose]);

  return (
    <div className="fac-modal" data-testid="original-preview" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="fac-modal-card" role="dialog" aria-modal="true" aria-label={`Original de ${title}`}>
        <header className="fac-modal-head">
          <div className="fac-modal-title"><strong>Original · {title}</strong><span>{invoice.archivoNombre || `original.${invoice.archivoTipo}`}</span></div>
          <div className="fac-bar-actions">
            <button type="button" className="fac-btn-secondary" data-testid="original-download" onClick={onDownload}><Download size={15} aria-hidden="true" />Descargar</button>
            <button type="button" ref={closeRef} className="fac-btn-secondary" data-testid="original-close" onClick={onClose}><X size={15} aria-hidden="true" />Cerrar</button>
          </div>
        </header>
        <div className="fac-modal-body">
          {!esPdf && <pre className="fac-modal-xml" data-testid="original-xml">{texto}</pre>}
          {esPdf && usarCanvas && <PdfPages bytes={bytes} />}
          {esPdf && !usarCanvas && url && <iframe className="fac-modal-frame" title={`Original de ${title}`} src={url} data-testid="original-frame" />}
        </div>
      </div>
    </div>
  );
}
