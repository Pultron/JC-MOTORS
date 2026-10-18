import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { CreateQuotationInput, Quotation, QuotationStatus } from '../models/quotation';
import { quotationService } from '../services/quotationService';

interface QuotationContextValue {
  quotations: Quotation[];
  isLoading: boolean;
  notice: string | null;
  clearNotice: () => void;
  getQuotation: (id: string) => Promise<Quotation | undefined>;
  createQuotation: (input: CreateQuotationInput) => Promise<Quotation>;
  updateQuotation: (id: string, input: CreateQuotationInput) => Promise<Quotation | undefined>;
  duplicateQuotation: (id: string) => Promise<Quotation | undefined>;
  approveQuotation: (id: string) => Promise<Quotation | undefined>;
  cancelQuotation: (id: string) => Promise<Quotation | undefined>;
  setProgress: (id: string, status: QuotationStatus) => Promise<Quotation | undefined>;
}

const QuotationContext = createContext<QuotationContextValue | null>(null);

export function QuotationProvider({ children }: { children: ReactNode }) {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void quotationService.list().then((results) => {
        if (active) {
          setQuotations((current) => JSON.stringify(current) === JSON.stringify(results) ? current : results);
          setIsLoading(false);
        }
      });
    };
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    const onVisible = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const getQuotation = useCallback((id: string) => quotationService.getById(id), []);

  const createQuotation = useCallback(async (input: CreateQuotationInput) => {
    const quotation = await quotationService.create(input);
    setQuotations(await quotationService.list());
    setNotice(`La cotización ${quotation.folio} se guardó correctamente.`);
    return quotation;
  }, []);

  const duplicateQuotation = useCallback(async (id: string) => {
    const quotation = await quotationService.duplicate(id);
    if (quotation) {
      setQuotations(await quotationService.list());
      setNotice(`Se creó la cotización ${quotation.folio}.`);
    }
    return quotation;
  }, []);

  const updateQuotation = useCallback(async (id: string, input: CreateQuotationInput) => {
    const quotation = await quotationService.update(id, input);
    if (quotation) {
      setQuotations(await quotationService.list());
      setNotice(`La cotización ${quotation.folio} se actualizó sin cambiar su folio.`);
    }
    return quotation;
  }, []);

  const approveQuotation = useCallback(async (id: string) => {
    const quotation = await quotationService.approve(id);
    if (!quotation) return undefined;
    setQuotations(await quotationService.list());
    setNotice(`La cotización ${quotation.folio} fue aprobada y enviada a Control interno.`);
    return quotation;
  }, []);

  const cancelQuotation = useCallback(async (id: string) => {
    const quotation = await quotationService.cancel(id);
    if (!quotation) return undefined;
    setQuotations(await quotationService.list());
    setNotice(`La cotización ${quotation.folio} fue cancelada.`);
    return quotation;
  }, []);

  const setProgress = useCallback(async (id: string, status: QuotationStatus) => {
    const quotation = await quotationService.setProgress(id, status);
    if (quotation) {
      setQuotations(await quotationService.list());
      setNotice(`La cotización ${quotation.folio} pasó a ${status}.`);
    }
    return quotation;
  }, []);

  const value = useMemo<QuotationContextValue>(
    () => ({
      quotations,
      isLoading,
      notice,
      clearNotice: () => setNotice(null),
      getQuotation,
      createQuotation,
      updateQuotation,
      duplicateQuotation,
      approveQuotation,
      cancelQuotation,
      setProgress,
    }),
    [quotations, isLoading, notice, getQuotation, createQuotation, updateQuotation, duplicateQuotation, approveQuotation, cancelQuotation, setProgress],
  );

  return <QuotationContext.Provider value={value}>{children}</QuotationContext.Provider>;
}

export function useQuotations(): QuotationContextValue {
  const context = useContext(QuotationContext);
  if (!context) throw new Error('useQuotations debe usarse dentro de QuotationProvider');
  return context;
}
