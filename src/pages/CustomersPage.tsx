import { useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Mail, Pencil, Phone, Plus, Search, Trash2, UserRound, X } from 'lucide-react';
import { Button } from '../components/Button';
import { PageHeader } from '../components/PageHeader';
import { SectionCard } from '../components/SectionCard';
import type { CustomerProfile, CustomerProfileInput } from '../models/quotation';
import { useCustomers } from '../store/CustomerContext';

interface CustomerDraft {
  name: string;
  phone: string;
  email: string;
  aliases: string;
}

const emptyDraft = (): CustomerDraft => ({ name: '', phone: '', email: '', aliases: '' });

const normalize = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLocaleLowerCase('es-MX');

function parseAliases(value: string, customerName: string): string[] {
  const seen = new Set([normalize(customerName)]);
  return value.split(',').map((alias) => alias.trim()).filter((alias) => {
    const key = normalize(alias);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function customerTerms(customer: Pick<CustomerProfile, 'name' | 'aliases'>): string[] {
  return [customer.name, ...customer.aliases].map(normalize);
}

export function CustomersPage() {
  const { customers, createCustomer, updateCustomer, deleteCustomer } = useCustomers();
  const [draft, setDraft] = useState<CustomerDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const filteredCustomers = useMemo(() => {
    const term = normalize(search);
    if (!term) return customers;
    return customers.filter((customer) => [customer.name, customer.phone, customer.email ?? '', ...customer.aliases]
      .some((value) => normalize(value).includes(term)));
  }, [customers, search]);

  function resetForm() {
    setDraft(emptyDraft());
    setEditingId(null);
    setError('');
  }

  function editCustomer(customer: CustomerProfile) {
    setDraft({
      name: customer.name,
      phone: customer.phone,
      email: customer.email ?? '',
      aliases: customer.aliases.join(', '),
    });
    setEditingId(customer.id);
    setError('');
    setNotice('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');

    const name = draft.name.trim();
    if (!name) {
      setError('Escribe el nombre real del cliente.');
      return;
    }

    const aliases = parseAliases(draft.aliases, name);
    const newTerms = [name, ...aliases].map(normalize);
    const conflict = customers.find((customer) => customer.id !== editingId
      && customerTerms(customer).some((term) => newTerms.includes(term)));
    if (conflict) {
      setError(`El nombre o apodo ya está registrado para ${conflict.name}.`);
      return;
    }

    const input: CustomerProfileInput = {
      name,
      phone: draft.phone.trim(),
      ...(draft.email.trim() ? { email: draft.email.trim() } : {}),
      aliases,
    };

    if (editingId) {
      updateCustomer(editingId, input);
      setNotice(`Se actualizaron los datos de ${name}.`);
    } else {
      createCustomer(input);
      setNotice(`Se agregó ${name} a los clientes de prueba.`);
    }

    resetForm();
  }

  function removeCustomer(customer: CustomerProfile) {
    deleteCustomer(customer.id);
    if (editingId === customer.id) resetForm();
    setNotice(`Se eliminó ${customer.name} de los clientes de prueba.`);
  }

  return (
    <>
      <PageHeader eyebrow="Directorio" title="Clientes" description="Agrega clientes y sus apodos para encontrarlos rápido al crear una cotización." />

      <div className="space-y-5">
        <SectionCard
          title={editingId ? 'Editar cliente' : 'Agregar cliente'}
          description="El nombre real se mostrará en la cotización; los apodos solo sirven para buscarlo."
          icon={<UserRound size={19} />}
        >
          <form onSubmit={handleSubmit} noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre real *" className="sm:col-span-2">
                <input className="form-input" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Ej. Jesús Pérez" />
              </Field>
              <Field label="Teléfono">
                <input className="form-input" type="tel" value={draft.phone} onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))} placeholder="55 1234 5678" />
              </Field>
              <Field label="Correo electrónico" hint="Opcional">
                <input className="form-input" type="email" value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} placeholder="cliente@correo.com" />
              </Field>
              <Field label="Apodos" hint="Separados por coma" className="sm:col-span-2">
                <input className="form-input" value={draft.aliases} onChange={(event) => setDraft((current) => ({ ...current, aliases: event.target.value }))} placeholder="Ej. Chuy, Chucho" />
              </Field>
            </div>
            {error && <p role="alert" className="mt-3 text-sm font-medium text-rose-600">{error}</p>}
            {notice && <p role="status" className="mt-3 text-sm font-medium text-emerald-700">{notice}</p>}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              {editingId && <Button type="button" variant="ghost" icon={<X size={16} />} onClick={resetForm}>Cancelar edición</Button>}
              <Button type="submit" variant="primary" icon={editingId ? <Pencil size={16} /> : <Plus size={16} />}>
                {editingId ? 'Guardar cambios' : 'Agregar cliente'}
              </Button>
            </div>
          </form>
        </SectionCard>

        <SectionCard title="Clientes de prueba" description={`${customers.length} ${customers.length === 1 ? 'cliente' : 'clientes'} disponibles para cotizar.`}>
          <label className="relative mb-4 block">
            <Search size={17} aria-hidden="true" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="form-input pl-10" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre, apodo o teléfono" />
          </label>

          <div className="divide-y divide-slate-100">
            {filteredCustomers.map((customer) => (
              <article key={customer.id} className="flex flex-col gap-3 py-4 first:pt-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h3 className="font-semibold text-navy-950">{customer.name}</h3>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    {customer.phone && <span className="inline-flex items-center gap-1.5"><Phone size={13} />{customer.phone}</span>}
                    {customer.email && <span className="inline-flex items-center gap-1.5"><Mail size={13} />{customer.email}</span>}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {customer.aliases.length > 0
                      ? customer.aliases.map((alias) => <span key={alias} className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700">{alias}</span>)
                      : <span className="text-xs text-slate-400">Sin apodos</span>}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button type="button" variant="secondary" icon={<Pencil size={15} />} onClick={() => editCustomer(customer)}>Editar</Button>
                  <Button type="button" variant="danger" icon={<Trash2 size={15} />} aria-label={`Eliminar a ${customer.name}`} onClick={() => removeCustomer(customer)}>Eliminar</Button>
                </div>
              </article>
            ))}
            {filteredCustomers.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No se encontraron clientes.</p>}
          </div>
          <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-400">Los cambios son temporales y se borran al cerrar la aplicación. Al volver a abrirla aparecerán de nuevo los clientes de ejemplo.</p>
        </SectionCard>
      </div>
    </>
  );
}

interface FieldProps {
  label: string;
  children: ReactNode;
  hint?: string;
  className?: string;
}

function Field({ label, children, hint, className = '' }: FieldProps) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-1.5 flex items-center justify-between gap-2 text-xs font-semibold text-slate-600">{label}{hint && <span className="font-normal text-slate-400">{hint}</span>}</span>
      {children}
    </label>
  );
}
