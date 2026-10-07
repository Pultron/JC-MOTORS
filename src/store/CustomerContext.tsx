import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { CustomerProfile, CustomerProfileInput } from '../models/quotation';
import { customerService } from '../services/customerService';
import { createId } from '../utils/quotation';

interface CustomerContextValue {
  customers: CustomerProfile[];
  createCustomer: (input: CustomerProfileInput) => CustomerProfile;
  updateCustomer: (id: string, input: CustomerProfileInput) => void;
  deleteCustomer: (id: string) => void;
}

const CustomerContext = createContext<CustomerContextValue | null>(null);
export function CustomerProvider({ children }: { children: ReactNode }) {
  const [customers, setCustomers] = useState<CustomerProfile[]>(customerService.list);

  useEffect(() => {
    try { customerService.save(customers); } catch { /* La edición sigue disponible durante esta sesión. */ }
  }, [customers]);

  const createCustomer = useCallback((input: CustomerProfileInput) => {
    const customer: CustomerProfile = { ...input, id: createId(), aliases: [...input.aliases] };
    setCustomers((current) => [customer, ...current]);
    return customer;
  }, []);

  const updateCustomer = useCallback((id: string, input: CustomerProfileInput) => {
    setCustomers((current) => current.map((customer) => customer.id === id
      ? { ...input, id, aliases: [...input.aliases] }
      : customer));
  }, []);

  const deleteCustomer = useCallback((id: string) => {
    setCustomers((current) => current.filter((customer) => customer.id !== id));
  }, []);

  const value = useMemo(() => ({ customers, createCustomer, updateCustomer, deleteCustomer }), [
    customers,
    createCustomer,
    updateCustomer,
    deleteCustomer,
  ]);

  return <CustomerContext.Provider value={value}>{children}</CustomerContext.Provider>;
}

export function useCustomers(): CustomerContextValue {
  const context = useContext(CustomerContext);
  if (!context) throw new Error('useCustomers debe usarse dentro de CustomerProvider');
  return context;
}
