import { useMemo, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { AlertTriangle, CalendarDays, Download, ExternalLink, FileText, Plus, Trash2, Upload, X } from 'lucide-react';
import { InvoiceSheet } from '../components/facturas/InvoiceSheet';
import { OriginalPreview } from '../components/facturas/OriginalPreview';
import { RangeCalendar } from '../components/internalControl/RangeCalendar';
import { useToast } from '../components/ui/Toast';
import { useConfirm } from '../hooks/useConfirm';
import { useInvoices } from '../hooks/useInvoices';
import type { ImportOutcome } from '../hooks/useInvoices';
import type { Invoice } from '../models/invoice';
import { generarFacturaPdf } from '../services/invoicePdf';
import { base64ToBytes } from '../utils/base64';
import { rangeLabel } from '../utils/dateRangeUtils';
import type { DateRange } from '../utils/dateRangeUtils';
import { formatearFolio, formatMoney, nombreArchivoFactura } from '../utils/invoiceFormat';
import { savePdfFile } from '../utils/savePdfFile';
import '../styles/facturas.css';

const SIN_RANGO: DateRange = { start: '', end: '' };
/** Fecha de emisión (AAAA-MM-DD) tal como viene en la factura, sin pasar por la zona horaria. */
const diaDeEmision = (invoice: Invoice) => invoice.fechaEmision.slice(0, 10);

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });

function Estado({ estado }: { estado: Invoice['estado'] }) {
  if (estado === 'timbrada') return null;
  return <span className="fac-badge" data-estado={estado}>Cancelada</span>;
}

export function FacturasPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { invoices, importFiles, remove } = useInvoices();
  const [rango, setRango] = useState<DateRange>(SIN_RANGO);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [originalOpen, setOriginalOpen] = useState(false);
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
  const [flashUuid, setFlashUuid] = useState<string | null>(null);
  const [docKey, setDocKey] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtraPorFecha = Boolean(rango.start && rango.end);
  const visibles = useMemo(() => invoices.filter((invoice) => {
    if (!filtraPorFecha) return true;
    const dia = diaDeEmision(invoice);
    return dia >= rango.start && dia <= rango.end;
  }), [invoices, rango, filtraPorFecha]);
  const selected = invoices.find((invoice) => invoice.uuid === selectedUuid);

  function select(uuid: string) {
    if (uuid === selectedUuid) return;
    setSelectedUuid(uuid);
    setDocKey((key) => key + 1);
  }

  /** Cambia el rango; si la factura abierta queda fuera, se pasa a la primera visible (o a ninguna). */
  function aplicarRango(next: DateRange) {
    setRango(next);
    setCalendarOpen(false);
    const enRango = (invoice: Invoice) => !next.start || !next.end || (diaDeEmision(invoice) >= next.start && diaDeEmision(invoice) <= next.end);
    if (selected && enRango(selected)) return;
    const primera = invoices.find(enRango);
    setSelectedUuid(primera?.uuid ?? null);
    setOriginalOpen(false);
    if (primera) setDocKey((key) => key + 1);
  }

  function announceImported(imported: Invoice[]) {
    if (imported.length === 0) return;
    const last = imported[imported.length - 1];
    setRango(SIN_RANGO);
    setSelectedUuid(last.uuid);
    setDocKey((key) => key + 1);
    setFlashUuid(last.uuid);
    window.setTimeout(() => setFlashUuid(null), 1700);
    toast.success({
      title: imported.length === 1 ? `${nombreArchivoFactura(last.folio)} lista` : `${imported.length} facturas listas`,
      description: imported.length === 1 ? last.receptor.nombre : imported.map((invoice) => nombreArchivoFactura(invoice.folio)).join(', '),
    });
  }

  function reportOutcome(outcome: ImportOutcome) {
    if (outcome.status === 'error') toast.error({ title: 'No se pudo importar la factura', description: `${outcome.file}: ${outcome.message}` });
    else if (outcome.status === 'duplicate') toast.warning({ title: 'Factura ya importada', description: `${nombreArchivoFactura(outcome.invoice.folio)} ya existe con ese folio fiscal; no se duplicó ni se consumió folio.` });
  }

  async function handleFiles(list: FileList | File[]) {
    const files = Array.from(list);
    if (files.length === 0) return;
    setReading(true);
    let outcomes: ImportOutcome[];
    try {
      outcomes = await importFiles(files);
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
    outcomes.forEach(reportOutcome);
    announceImported(outcomes.flatMap((outcome) => (outcome.status === 'imported' ? [outcome.invoice] : [])));
  }

  async function eliminar() {
    if (!selected) return;
    const accepted = await confirm({
      title: '¿Eliminar esta factura?',
      description: `Se borrará ${nombreArchivoFactura(selected.folio)} de ${selected.receptor.nombre}. Su folio interno no se reutilizará. Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar',
      tone: 'danger',
    });
    if (!accepted) return;
    await remove(selected.uuid);
    setSelectedUuid(null);
    setOriginalOpen(false);
    toast.success({ title: 'Factura eliminada', description: nombreArchivoFactura(selected.folio) });
  }

  async function descargarOriginal() {
    if (!selected?.archivoOriginal) return;
    const esPdf = selected.archivoTipo === 'pdf';
    const file = new File([base64ToBytes(selected.archivoOriginal)], selected.archivoNombre || `original.${selected.archivoTipo}`, { type: esPdf ? 'application/pdf' : 'application/xml' });
    try {
      const path = await savePdfFile(file, `${nombreArchivoFactura(selected.folio)} original`, esPdf ? 'save_invoice_pdf' : 'save_invoice_xml');
      if (path !== null) toast.success({ title: 'Original guardado', description: path ?? file.name });
    } catch (error) {
      toast.error({ title: 'No se pudo guardar el original', description: error instanceof Error ? error.message : undefined });
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    void handleFiles(event.dataTransfer.files);
  }

  async function descargar() {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const { file, nombre } = await generarFacturaPdf(selected);
      const path = await savePdfFile(file, nombre.replace(/\.pdf$/, ''), 'save_invoice_pdf');
      if (path !== null) toast.success({ title: 'PDF de la factura guardado', description: path ?? file.name });
    } catch (error) {
      toast.error({ title: 'No se pudo generar el PDF', description: error instanceof Error ? error.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fac-page" data-testid="facturas-page">
      <section className="fac-list">
        <header className="fac-list-head">
          <h1>Facturas</h1>
          <button type="button" className="fac-btn-primary" data-testid="upload-button" onClick={() => inputRef.current?.click()}>
            <Plus size={16} strokeWidth={2.4} aria-hidden="true" />Subir factura
          </button>
        </header>
        <div className="fac-filter">
          <span className="fac-filter-label">Filtrar por fechas</span>
          <div className="fac-range-wrap">
            <button type="button" className="fac-range-btn" data-testid="date-filter" data-active={filtraPorFecha} aria-expanded={calendarOpen} onClick={() => setCalendarOpen((open) => !open)}>
              <CalendarDays size={15} aria-hidden="true" />
              <span>{filtraPorFecha ? rangeLabel(rango) : 'Todas las fechas'}</span>
            </button>
            {filtraPorFecha && (
              <button type="button" className="fac-range-clear" data-testid="date-filter-clear" aria-label="Quitar filtro de fechas" onClick={() => aplicarRango(SIN_RANGO)}><X size={14} aria-hidden="true" /></button>
            )}
            {calendarOpen && <RangeCalendar value={rango} onCancel={() => setCalendarOpen(false)} onApply={aplicarRango} />}
          </div>
          <span className="fac-count" data-testid="invoice-count">{filtraPorFecha ? `${visibles.length} de ${invoices.length}` : `${invoices.length}`} {invoices.length === 1 ? 'factura' : 'facturas'}</span>
        </div>
        <div
          className="fac-drop"
          data-reading={reading}
          data-dragging={dragging}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          {reading && <span className="fac-progress" data-testid="reading-progress" aria-hidden="true" />}
          <Upload size={22} aria-hidden="true" />
          <p>{reading ? 'Leyendo factura…' : <>Arrastra tu factura en <strong>PDF</strong></>}</p>
          <span>o haz clic para seleccionar</span>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.xml,application/pdf,text/xml,application/xml"
            multiple
            hidden
            data-testid="xml-input"
            onChange={(event) => event.target.files && void handleFiles(event.target.files)}
          />
        </div>
        <ul className="fac-rows" data-testid="invoice-list">
          {visibles.map((invoice, i) => (
            <li key={invoice.uuid} style={{ animationDelay: `${i * 50}ms` }} className={flashUuid === invoice.uuid ? 'is-flash' : undefined}>
              <button type="button" data-testid="invoice-row" data-uuid={invoice.uuid} data-selected={invoice.uuid === selectedUuid} onClick={() => select(invoice.uuid)}>
                <span className="fac-row-top"><span className="fac-row-uuid">Nº {formatearFolio(invoice.folio)}{invoice.selloIncompleto && <span className="fac-dot-warn" title="El sello digital no se extrajo completo; el PDF generado no será válido para imprimir" data-testid="row-sello-dot" />}</span><span className="fac-row-date">{formatDate(invoice.fechaEmision)}</span></span>
                <span className="fac-row-name">{invoice.receptor.nombre}</span>
                <span className="fac-row-bottom"><Estado estado={invoice.estado} /><strong>${formatMoney(invoice.total)}</strong></span>
              </button>
            </li>
          ))}
          {visibles.length === 0 && <li className="fac-empty-list">{invoices.length === 0 ? 'Aún no hay facturas importadas.' : 'Ninguna factura con fecha de emisión en ese rango.'}</li>}
        </ul>
      </section>

      <section className="fac-preview">
        {selected ? (
          <>
            <header className="fac-bar">
              <div className="fac-bar-title"><strong>{nombreArchivoFactura(selected.folio)} · {selected.receptor.nombre}</strong><Estado estado={selected.estado} /></div>
              <div className="fac-bar-actions">
                <button type="button" className="fac-btn-secondary" data-testid="download-pdf" disabled={busy} onClick={() => void descargar()}><Download size={15} aria-hidden="true" />Descargar PDF</button>
                <button type="button" className="fac-btn-secondary" data-testid="view-original" disabled={!selected.archivoOriginal} onClick={() => setOriginalOpen(true)}><ExternalLink size={15} aria-hidden="true" />Ver original</button>
                <button type="button" className="fac-btn-secondary fac-btn-danger" data-testid="delete-invoice" aria-label="Eliminar factura" onClick={() => void eliminar()}><Trash2 size={15} aria-hidden="true" />Eliminar</button>
              </div>
            </header>
            {selected.selloIncompleto && (
              <div className="fac-doubt" data-testid="doubt-banner">
                <AlertTriangle size={15} aria-hidden="true" />
                <span>El sello digital no se extrajo completo; el PDF generado no será válido para imprimir.</span>
              </div>
            )}
            <div className="fac-scroll">
              <div className="fac-sheet-wrap" data-anim={docKey % 2} key={selected.uuid}><InvoiceSheet invoice={selected} /></div>
            </div>
          </>
        ) : (
          <div className="fac-empty">
            <FileText size={44} strokeWidth={1.4} aria-hidden="true" />
            <strong>Ninguna factura seleccionada</strong>
            <span>Sube un PDF o un XML, o elige una de la lista</span>
          </div>
        )}
      </section>

      {originalOpen && selected?.archivoOriginal && (
        <OriginalPreview invoice={selected} title={nombreArchivoFactura(selected.folio)} onDownload={() => void descargarOriginal()} onClose={() => setOriginalOpen(false)} />
      )}
    </div>
  );
}
