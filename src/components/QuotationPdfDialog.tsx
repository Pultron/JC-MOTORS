import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Loader2, Printer, Share2, X } from 'lucide-react';
import { Button } from './Button';
import type { PublicQuotation } from '../models/quotation';
import type { QuotationLogo } from '../utils/pdfQuotation';

type PdfModule = typeof import('../utils/pdfQuotation');

interface QuotationPdfDialogProps {
  quotation: PublicQuotation | null;
  onClose: () => void;
}

interface Preview {
  blob: Blob;
  url: string;
}

export function QuotationPdfDialog({ quotation, onClose }: QuotationPdfDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pdfModule, setPdfModule] = useState<PdfModule | null>(null);
  const [logo, setLogo] = useState<QuotationLogo | null | undefined>();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  // jsPDF pesa ~160 kB: se carga sólo cuando el usuario pide ver un PDF.
  useEffect(() => {
    let active = true;
    void import('../utils/pdfQuotation').then((module) => {
      if (!active) return;
      setPdfModule(module);
      void module.loadLogoDataUrl().then((dataUrl) => {
        if (active) setLogo(dataUrl ?? null);
      });
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!quotation || !pdfModule || logo === undefined) return;
    const blob = pdfModule.buildQuotationPdf(quotation, logo ?? undefined).output('blob');
    const url = URL.createObjectURL(blob);
    setPreview({ blob, url });
    return () => URL.revokeObjectURL(url);
  }, [quotation, pdfModule, logo]);

  const file = useMemo(() => {
    if (!preview || !quotation) return null;
    return new File([preview.blob], `${quotation.folio}.pdf`, { type: 'application/pdf' });
  }, [preview, quotation]);

  const canShare = file !== null && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });

  function handlePrint() {
    if (!preview) return;
    const printWindow = window.open(preview.url, '_blank');
    if (!printWindow) {
      setError('El navegador bloqueó la ventana de impresión. Usa «Descargar PDF» y ábrelo con un lector.');
      return;
    }
    printWindow.addEventListener('load', () => {
      printWindow.focus();
      printWindow.print();
    }, { once: true });
  }

  async function handleShare() {
    if (!file) return;
    setError('');
    try {
      await navigator.share({ files: [file], title: `Cotización ${quotation?.folio ?? ''}` });
    } catch {
      /* el usuario cerró la hoja de compartir: no es un error */
    }
  }

  function handleDownload() {
    if (!file) return;
    setError('');
    const objectUrl = URL.createObjectURL(file);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = file.name;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="quotation-pdf-title"
      onClose={onClose}
      className="m-auto flex h-[86vh] w-[min(96vw,900px)] max-w-none flex-col overflow-hidden rounded-2xl border-0 bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-navy-950/60"
    >
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 id="quotation-pdf-title" className="text-lg font-bold text-navy-950">Vista previa del PDF</h2>
          <p className="mt-0.5 text-sm text-slate-500">Cotización {quotation?.folio} · así se verá el documento que recibe el cliente.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar vista previa" className="icon-button -mr-2 -mt-1">
          <X size={18} />
        </button>
      </div>

      <div className="min-h-0 flex-1 bg-slate-100 p-4">
        {preview ? (
          <iframe
            src={preview.url}
            title={`Vista previa del PDF de la cotización ${quotation?.folio ?? ''}`}
            className="size-full rounded-lg border border-slate-200 bg-white"
          />
        ) : (
          <div className="flex size-full items-center justify-center gap-2 text-sm text-slate-500">
            <Loader2 size={18} className="animate-spin" />
            Generando el PDF…
          </div>
        )}
      </div>

      {error && <p role="alert" className="border-t border-slate-100 bg-rose-50 px-5 py-2.5 text-sm text-rose-700">{error}</p>}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
        <Button
          variant="secondary"
          disabled={!canShare}
          title={canShare ? undefined : 'Compartir archivos no está disponible en este equipo.'}
          icon={<Share2 size={16} />}
          onClick={() => void handleShare()}
        >
          Compartir
        </Button>
        <Button variant="secondary" disabled={!file} icon={<Download size={16} />} onClick={handleDownload}>Descargar PDF</Button>
        <Button variant="primary" disabled={!preview} icon={<Printer size={16} />} onClick={handlePrint}>Imprimir</Button>
      </div>
    </dialog>
  );
}
