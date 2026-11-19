import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { CreateQuotationInput, Quotation, ShareMedium } from '../models/quotation';
import { quotationService } from '../services/quotationService';
import { isDeletableStatus } from '../models/quotation';
import { removeInternalRecordsOf } from '../services/internalRecordsCleanup';
import { internalControlService } from '../services/internalControlService';
import { useToast } from '../components/ui/Toast';
import { STORAGE_KEYS } from '../storage/storageKeys';

interface QuotationContextValue {
  quotations: Quotation[];
  isLoading: boolean;
  getQuotation: (id: string) => Promise<Quotation | undefined>;
  createQuotation: (input: CreateQuotationInput) => Promise<Quotation>;
  updateQuotation: (id: string, input: CreateQuotationInput) => Promise<Quotation | undefined>;
  approveQuotation: (id: string) => Promise<Quotation | undefined>;
  /** Approved quotations need a reason; pending ones may omit it. Rejects (and changes nothing) if the write fails. */
  cancelQuotation: (id: string, reason?: string) => Promise<Quotation | undefined>;
  deleteQuotationPermanently: (id: string) => Promise<boolean>;
  /** Records the share silently (no toast: the share sheet is the feedback). */
  markQuotationShared: (id: string, via: ShareMedium) => Promise<Quotation | undefined>;
  /** Completes the customer's phone/email on the quotation itself; returns the updated quotation. */
  updateQuotationContact: (id: string, contact: { phone?: string; email?: string }) => Promise<Quotation | undefined>;
}

const QuotationContext = createContext<QuotationContextValue | null>(null);

export function QuotationProvider({ children }: { children: ReactNode }) {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    let active = true;
    const refresh = () => { void quotationService.list().then((results) => {
      if (active) {
        setQuotations(results);
        setIsLoading(false);
      }
    }); };
    refresh();

    // Las mutaciones de este contexto ya actualizan el estado. Estos eventos cubren lo que no controla:
    // otra ventana que escribe en el mismo almacenamiento, y las cotizaciones que vencen con el tiempo (se
    // recalculan al volver a la ventana en lugar de leer cada minuto).
    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === STORAGE_KEYS.quotations) refresh();
    };
    const handleVisibility = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('storage', handleStorage);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      active = false;
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const getQuotation = useCallback((id: string) => quotationService.getById(id), []);

  const createQuotation = useCallback(async (input: CreateQuotationInput) => {
    const quotation = await quotationService.create(input);
    setQuotations(await quotationService.list());
    toast.success({ title: 'Cotización guardada', description: `La cotización ${quotation.folio} se guardó correctamente.` });
    return quotation;
  }, [toast]);

  const updateQuotation = useCallback(async (id: string, input: CreateQuotationInput) => {
    const quotation = await quotationService.update(id, input);
    if (quotation) {
      setQuotations(await quotationService.list());
      toast.success({ title: 'Cotización actualizada', description: `La cotización ${quotation.folio} se actualizó correctamente.` });
    }
    return quotation;
  }, [toast]);

  const approveQuotation = useCallback(async (id: string) => {
    const quotation = await quotationService.approve(id);
    if (!quotation) return undefined;
    await internalControlService.ensureForQuotation(quotation);
    setQuotations(await quotationService.list());
    toast.success({ title: 'Cotización aprobada', description: `La cotización ${quotation.folio} fue aprobada y enviada a Control interno.` });
    return quotation;
  }, [toast]);

  const cancelQuotation = useCallback(async (id: string, reason?: string) => {
    const quotation = await quotationService.cancel(id, reason);
    if (!quotation) return undefined;
    setQuotations(await quotationService.list());
    toast.warning({
      title: 'Cotización cancelada',
      description: quotation.statusBeforeCancel === 'Aprobada' ? `${quotation.folio} salió de Control interno.` : `La cotización ${quotation.folio} fue cancelada.`,
    });
    return quotation;
  }, [toast]);

  const deleteQuotationPermanently = useCallback(async (id: string) => {
    // Internal costs go first: if they cannot be removed the quotation stays, so no cost data is left without its quotation.
    const target = await quotationService.getById(id);
    if (!target || !isDeletableStatus(target.status)) return false;
    await removeInternalRecordsOf(id);
    const quotation = await quotationService.deletePermanently(id);
    if (!quotation) return false;
    setQuotations(await quotationService.list());
    toast.success({ title: 'Cotización eliminada', description: `La cotización ${quotation.folio} se eliminó permanentemente.` });
    return true;
  }, [toast]);

  const markQuotationShared = useCallback(async (id: string, via: ShareMedium) => {
    const quotation = await quotationService.markShared(id, via);
    if (quotation) setQuotations(await quotationService.list());
    return quotation;
  }, []);

  const updateQuotationContact = useCallback(async (id: string, contact: { phone?: string; email?: string }) => {
    const quotation = await quotationService.updateCustomerContact(id, contact);
    if (quotation) setQuotations(await quotationService.list());
    return quotation;
  }, []);

  const value = useMemo<QuotationContextValue>(
    () => ({
      quotations,
      isLoading,
      getQuotation,
      createQuotation,
      updateQuotation,
      approveQuotation,
      cancelQuotation,
      deleteQuotationPermanently,
      markQuotationShared,
      updateQuotationContact,
    }),
    [quotations, isLoading, getQuotation, createQuotation, updateQuotation, approveQuotation, cancelQuotation, deleteQuotationPermanently, markQuotationShared, updateQuotationContact],
  );

  return <QuotationContext.Provider value={value}>{children}</QuotationContext.Provider>;
}

export function useQuotations(): QuotationContextValue {
  const context = useContext(QuotationContext);
  if (!context) throw new Error('useQuotations debe usarse dentro de QuotationProvider');
  return context;
}
