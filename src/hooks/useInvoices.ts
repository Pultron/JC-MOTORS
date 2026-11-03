import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Invoice } from '../models/invoice';
import { CfdiParseError } from '../services/cfdiParser';
import { asegurarContadorMinimo, siguienteFolio } from '../services/folioService';
import { leerFactura } from '../services/invoiceReader';
import { LocalStorageInvoiceRepository } from '../repositories/LocalStorageInvoiceRepository';

export type ImportOutcome =
  | { file: string; status: 'imported'; invoice: Invoice }
  | { file: string; status: 'duplicate'; invoice: Invoice }
  | { file: string; status: 'error'; message: string };

export function useInvoices() {
  const repository = useRef(new LocalStorageInvoiceRepository()).current;
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  const refresh = useCallback(async () => {
    const all = await repository.getAll();
    // Facturas guardadas antes de existir el folio interno: se numeran en orden de importación.
    const sinFolio = all.filter((invoice) => !invoice.folio).sort((a, b) => a.importadoEn.localeCompare(b.importadoEn));
    if (sinFolio.length > 0) {
      asegurarContadorMinimo(Math.max(0, ...all.map((invoice) => invoice.folio ?? 0)));
      for (const invoice of sinFolio) await repository.update({ ...invoice, folio: siguienteFolio() });
      setInvoices(await repository.getAll());
      return;
    }
    setInvoices(all);
  }, [repository]);

  useEffect(() => { void refresh(); }, [refresh]);

  const importFiles = useCallback(async (files: File[]): Promise<ImportOutcome[]> => {
    const outcomes: ImportOutcome[] = [];
    for (const file of files) {
      try {
        const lectura = await leerFactura(file);
        const existente = await repository.getById(lectura.datos.uuid);
        if (existente) { outcomes.push({ file: file.name, status: 'duplicate', invoice: existente }); continue; }
        // El folio se consume solo cuando ya sabemos que la factura es nueva y legible.
        const saved = await repository.save({ ...lectura.datos, folio: siguienteFolio() });
        outcomes.push({ file: file.name, status: saved.duplicate ? 'duplicate' : 'imported', invoice: saved.invoice });
      } catch (error) {
        const message = error instanceof CfdiParseError ? error.message
          : error instanceof DOMException && error.name === 'QuotaExceededError' ? 'No hay espacio de almacenamiento para guardar este archivo.'
          : 'No se pudo leer el archivo.';
        outcomes.push({ file: file.name, status: 'error', message });
      }
    }
    await refresh();
    return outcomes;
  }, [repository, refresh]);

  const remove = useCallback(async (uuid: string) => {
    await repository.delete(uuid);
    await refresh();
  }, [repository, refresh]);

  return useMemo(() => ({ invoices, importFiles, remove }), [invoices, importFiles, remove]);
}
