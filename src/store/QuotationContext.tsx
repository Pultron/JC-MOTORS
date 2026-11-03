import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { CreateQuotationInput, Quotation } from '../models/quotation';
import { quotationService } from '../services/quotationService';
import { internalControlService } from '../services/internalControlService';
import { useToast } from '../components/ui/Toast';

interface QuotationContextValue {
  quotations: Quotation[];
  isLoading: boolean;
  getQuotation: (id: string) => Promise<Quotation | undefined>;
  createQuotation: (input: CreateQuotationInput) => Promise<Quotation>;
  updateQuotation: (id: string, input: CreateQuotationInput) => Promise<Quotation | undefined>;
  /** `silent` omite el aviso del store cuando la pantalla muestra el suyo. */
  duplicateQuotation: (id: string, options?: { silent?: boolean }) => Promise<Quotation | undefined>;
  approveQuotation: (id: string) => Promise<Quotation | undefined>;
  cancelQuotation: (id: string) => Promise<Quotation | undefined>;
  deleteCancelledQuotation: (id: string) => Promise<boolean>;
}

const QuotationContext = createContext<QuotationContextValue | null>(null);

export function QuotationProvider({ children }: { children: ReactNode }) {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    let active = true;
    const refresh = () => quotationService.list().then((results) => {
      if (active) {
        setQuotations(results);
        setIsLoading(false);
      }
    });
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 60_000);

    return () => {
      active = false;
      window.clearInterval(timer);
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

  const duplicateQuotation = useCallback(async (id: string, options?: { silent?: boolean }) => {
    const quotation = await quotationService.duplicate(id);
    if (quotation) {
      setQuotations(await quotationService.list());
      if (!options?.silent) toast.success({ title: 'Cotización creada', description: `Se creó la cotización ${quotation.folio}.` });
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

  const cancelQuotation = useCallback(async (id: string) => {
    const quotation = await quotationService.cancel(id);
    if (!quotation) return undefined;
    setQuotations(await quotationService.list());
    toast.warning({ title: 'Cotización cancelada', description: `La cotización ${quotation.folio} fue cancelada.` });
    return quotation;
  }, [toast]);

  const deleteCancelledQuotation = useCallback(async (id: string) => {
    const quotation = await quotationService.deleteCancelled(id);
    if (!quotation) return false;
    setQuotations(await quotationService.list());
    toast.success({ title: 'Cotización eliminada', description: `La cotización ${quotation.folio} se eliminó permanentemente.` });
    return true;
  }, [toast]);

  const value = useMemo<QuotationContextValue>(
    () => ({
      quotations,
      isLoading,
      getQuotation,
      createQuotation,
      updateQuotation,
      duplicateQuotation,
      approveQuotation,
      cancelQuotation,
      deleteCancelledQuotation,
    }),
    [quotations, isLoading, getQuotation, createQuotation, updateQuotation, duplicateQuotation, approveQuotation, cancelQuotation, deleteCancelledQuotation],
  );

  return <QuotationContext.Provider value={value}>{children}</QuotationContext.Provider>;
}

export function useQuotations(): QuotationContextValue {
  const context = useContext(QuotationContext);
  if (!context) throw new Error('useQuotations debe usarse dentro de QuotationProvider');
  return context;
}
