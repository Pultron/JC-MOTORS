import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { CreateQuotationInput, Quotation } from '../models/quotation';
import { quotationService } from '../services/quotationService';
import { internalControlService } from '../services/internalControlService';

interface QuotationContextValue {
  quotations: Quotation[];
  isLoading: boolean;
  notice: string | null;
  clearNotice: () => void;
  getQuotation: (id: string) => Promise<Quotation | undefined>;
  createQuotation: (input: CreateQuotationInput) => Promise<Quotation>;
  duplicateQuotation: (id: string) => Promise<Quotation | undefined>;
  approveQuotation: (id: string) => Promise<Quotation | undefined>;
  cancelQuotation: (id: string) => Promise<Quotation | undefined>;
}

const QuotationContext = createContext<QuotationContextValue | null>(null);

export function QuotationProvider({ children }: { children: ReactNode }) {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    quotationService.list().then((results) => {
      if (active) {
        setQuotations(results);
        setIsLoading(false);
      }
    });

    return () => {
      active = false;
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

  const approveQuotation = useCallback(async (id: string) => {
    const quotation = await quotationService.approve(id);
    if (!quotation) return undefined;
    await internalControlService.ensureForQuotation(quotation);
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

  const value = useMemo<QuotationContextValue>(
    () => ({
      quotations,
      isLoading,
      notice,
      clearNotice: () => setNotice(null),
      getQuotation,
      createQuotation,
      duplicateQuotation,
      approveQuotation,
      cancelQuotation,
    }),
    [quotations, isLoading, notice, getQuotation, createQuotation, duplicateQuotation, approveQuotation, cancelQuotation],
  );

  return <QuotationContext.Provider value={value}>{children}</QuotationContext.Provider>;
}

export function useQuotations(): QuotationContextValue {
  const context = useContext(QuotationContext);
  if (!context) throw new Error('useQuotations debe usarse dentro de QuotationProvider');
  return context;
}
