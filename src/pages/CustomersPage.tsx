import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, ClipboardEvent, FormEvent, KeyboardEvent } from 'react';
import { Mail, Pencil, Phone, Plus, Search, Trash2, UserRound, UsersRound, X } from 'lucide-react';
import { useToast } from '../components/ui/Toast';
import type { CustomerProfile, CustomerProfileInput } from '../models/quotation';
import { useCustomers } from '../store/CustomerContext';
import '../styles/clientes.css';

interface CustomerDraft {
  name: string;
  phone: string;
  email: string;
}

interface FlashState {
  id: string;
  kind: 'add' | 'edit';
  seq: number;
}

const emptyDraft = (): CustomerDraft => ({ name: '', phone: '', email: '' });
const FLASH_MS = 2000;
const AVATAR_TONES = ['cli-tone-0', 'cli-tone-1', 'cli-tone-2', 'cli-tone-3'];

const normalize = (value: string) => value
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .trim()
  .toLocaleLowerCase('es-MX');

const onlyDigits = (value: string) => value.replace(/\D/g, '');

/** Agrega los apodos de `texto` (separados por coma) a `actuales` sin repetir, ignorando mayúsculas y acentos. */
function mergeAliases(actuales: string[], texto: string): string[] {
  const seen = new Set(actuales.map(normalize));
  const result = [...actuales];
  for (const piece of texto.split(',')) {
    const alias = piece.trim();
    const key = normalize(alias);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(alias);
  }
  return result;
}

function customerTerms(customer: Pick<CustomerProfile, 'name' | 'aliases'>): string[] {
  return [customer.name, ...customer.aliases].map(normalize);
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((word) => word.charAt(0)).join('').toLocaleUpperCase('es-MX');
}

/** Los ids son cadenas; se reduce a un número estable para repartir el color del avatar. */
function toneFor(id: string): string {
  let sum = 0;
  for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
  return AVATAR_TONES[sum % AVATAR_TONES.length];
}

function matchesSearch(customer: CustomerProfile, search: string): boolean {
  const term = normalize(search);
  if (!term) return true;
  const textual = [customer.name, customer.email ?? '', ...customer.aliases].some((value) => normalize(value).includes(term));
  if (textual) return true;
  // El teléfono se compara solo por dígitos: "5512" encuentra "55 1234 5678".
  const digits = onlyDigits(search);
  return digits.length > 0 && /^[\d\s()+-]+$/.test(search.trim()) && onlyDigits(customer.phone).includes(digits);
}

export function CustomersPage() {
  const { customers, createCustomer, updateCustomer, deleteCustomer } = useCustomers();
  const toast = useToast();
  const [draft, setDraft] = useState<CustomerDraft>(emptyDraft);
  const [aliases, setAliases] = useState<string[]>([]);
  const [aliasText, setAliasText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [flash, setFlash] = useState<FlashState | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const aliasRef = useRef<HTMLInputElement>(null);
  const flashSeq = useRef(0);
  const flashTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  const filteredCustomers = useMemo(() => customers.filter((customer) => matchesSearch(customer, search)), [customers, search]);

  /** El destello se limpia con un temporizador, no con `animationend`: con movimiento reducido ese evento nunca llega. */
  function flashRow(id: string, kind: FlashState['kind']) {
    window.clearTimeout(flashTimer.current);
    flashSeq.current += 1;
    setFlash({ id, kind, seq: flashSeq.current });
    flashTimer.current = window.setTimeout(() => setFlash(null), FLASH_MS);
  }

  function resetForm() {
    setDraft(emptyDraft());
    setAliases([]);
    setAliasText('');
    setEditingId(null);
    setError('');
  }

  function editCustomer(customer: CustomerProfile) {
    setDraft({ name: customer.name, phone: customer.phone, email: customer.email ?? '' });
    setAliases([...customer.aliases]);
    setAliasText('');
    setEditingId(customer.id);
    setDeletingId(null);
    setError('');
    nameRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    nameRef.current?.focus({ preventScroll: true });
  }

  function changeName(event: ChangeEvent<HTMLInputElement>) {
    setDraft((current) => ({ ...current, name: event.target.value }));
    if (error) setError('');
  }

  function changeAliasText(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    if (error) setError('');
    if (!value.includes(',')) {
      setAliasText(value);
      return;
    }
    // Coma tecleada: se confirma lo anterior y lo posterior sigue en el campo. Pegado: se confirma todo.
    const typed = (event.nativeEvent as InputEvent).inputType === 'insertText';
    const lastComma = value.lastIndexOf(',');
    setAliases((current) => mergeAliases(current, typed ? value.slice(0, lastComma) : value));
    setAliasText(typed ? value.slice(lastComma + 1).replace(/^\s+/, '') : '');
  }

  function pasteAliases(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData('text');
    if (!pasted.includes(',')) return;
    event.preventDefault();
    setAliases((current) => mergeAliases(current, `${aliasText} ${pasted}`.trim()));
    setAliasText('');
  }

  function keyAlias(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' && aliasText.trim()) {
      event.preventDefault();
      setAliases((current) => mergeAliases(current, aliasText));
      setAliasText('');
    } else if (event.key === 'Backspace' && !aliasText && aliases.length > 0) {
      setAliases((current) => current.slice(0, -1));
    }
  }

  function removeAlias(alias: string) {
    setAliases((current) => current.filter((item) => item !== alias));
    aliasRef.current?.focus();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    const name = draft.name.trim();
    if (!name) {
      setError('Escribe el nombre del cliente.');
      nameRef.current?.focus();
      return;
    }

    // Lo que quede escrito sin confirmar entra como chip.
    const finalAliases = mergeAliases(aliases, aliasText).filter((alias) => normalize(alias) !== normalize(name));
    const newTerms = [name, ...finalAliases].map(normalize);
    const conflict = customers.find((customer) => customer.id !== editingId
      && customerTerms(customer).some((term) => newTerms.includes(term)));
    if (conflict) {
      setError(`El nombre o apodo ya está registrado para ${conflict.name}.`);
      nameRef.current?.focus();
      return;
    }

    const input: CustomerProfileInput = {
      name,
      phone: draft.phone.trim(),
      ...(draft.email.trim() ? { email: draft.email.trim() } : {}),
      aliases: finalAliases,
    };

    if (editingId) {
      updateCustomer(editingId, input);
      flashRow(editingId, 'edit');
      toast.success({ title: 'Cliente actualizado', description: `Se actualizaron los datos de ${name}.` });
    } else {
      const created = createCustomer(input);
      flashRow(created.id, 'add');
      toast.success({ title: 'Cliente agregado', description: `Se agregó ${name} a la lista de clientes.` });
    }

    resetForm();
  }

  function removeCustomer(customer: CustomerProfile) {
    deleteCustomer(customer.id);
    setDeletingId(null);
    if (editingId === customer.id) resetForm();
    toast.warning({ title: 'Cliente eliminado', description: `Se eliminó ${customer.name} de la lista de clientes.` });
  }

  const editing = editingId !== null;

  return (
    <div className="cli-page" data-testid="clientes-page">
      <header className="cli-header">
        <div className="cli-header-inner">
          <p className="cli-eyebrow">Directorio</p>
          <h1>Clientes</h1>
          <p className="cli-sub">Agrega clientes y sus apodos para encontrarlos rápido al crear una cotización.</p>
        </div>
      </header>

      <div className="cli-body">
        <section className="cli-card cli-card--form" aria-labelledby="cli-form-title">
          <div className="cli-card-head">
            <span className="cli-icon" aria-hidden="true"><UserRound size={17} /></span>
            <div>
              <h2 id="cli-form-title">{editing ? 'Editar cliente' : 'Agregar cliente'}</h2>
              <p>El nombre real se mostrará en la cotización; los apodos solo sirven para buscarlo.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            <div className="cli-group">
              <div className="cli-row" data-invalid={error ? 'true' : undefined}>
                <label htmlFor="cli-name" className="cli-label">Nombre real <span className="cli-req" aria-hidden="true">*</span></label>
                <input ref={nameRef} id="cli-name" data-testid="cli-name" className="cli-input" value={draft.name} onChange={changeName} placeholder="Ej. Jesús Pérez" required aria-required="true" aria-invalid={error ? 'true' : undefined} autoComplete="off" />
                {error && <span role="alert" className="cli-error" data-testid="cli-error">{error}</span>}
              </div>
              <div className="cli-row">
                <label htmlFor="cli-phone" className="cli-label">Teléfono</label>
                <input id="cli-phone" data-testid="cli-phone" className="cli-input" type="tel" value={draft.phone} onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))} placeholder="55 1234 5678" autoComplete="off" />
              </div>
              <div className="cli-row">
                <label htmlFor="cli-email" className="cli-label">Correo</label>
                <input id="cli-email" data-testid="cli-email" className="cli-input" type="email" value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} placeholder="cliente@correo.com" autoComplete="off" />
                <span className="cli-aux">Opcional</span>
              </div>
              <div className="cli-row cli-row--chips">
                <label htmlFor="cli-alias-input" className="cli-label">Apodos</label>
                <div className="cli-chips" data-testid="cli-chips">
                  {aliases.map((alias) => (
                    <span key={normalize(alias)} className="cli-chip" data-testid="cli-chip">
                      {alias}
                      <button type="button" aria-label={`Quitar apodo ${alias}`} onClick={() => removeAlias(alias)}><X size={9} strokeWidth={3.4} aria-hidden="true" /></button>
                    </span>
                  ))}
                  <input ref={aliasRef} id="cli-alias-input" data-testid="cli-alias-input" className="cli-input cli-input--chip" value={aliasText} onChange={changeAliasText} onKeyDown={keyAlias} onPaste={pasteAliases} placeholder={aliases.length === 0 ? 'Ej. Chuy, Chucho' : undefined} autoComplete="off" />
                </div>
                <span className="cli-aux">Enter o coma para separar</span>
              </div>
            </div>

            <div className="cli-foot">
              {editing && <button type="button" className="cli-btn cli-btn--secondary" data-testid="cli-cancel" onClick={resetForm}>Cancelar</button>}
              <button type="submit" className="cli-btn cli-btn--primary" data-testid="cli-submit">
                <Plus size={16} aria-hidden="true" />{editing ? 'Guardar cambios' : 'Agregar cliente'}
              </button>
            </div>
          </form>
        </section>

        <section className="cli-card cli-card--list" aria-labelledby="cli-list-title">
          <div className="cli-card-head">
            <span className="cli-icon" aria-hidden="true"><UsersRound size={17} /></span>
            <div>
              <h2 id="cli-list-title">Clientes</h2>
              <p data-testid="cli-count">{customers.length} {customers.length === 1 ? 'cliente disponible' : 'clientes disponibles'} para cotizar.</p>
            </div>
          </div>

          <div className="cli-search">
            <Search size={15} aria-hidden="true" />
            <input type="search" data-testid="cli-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre, apodo o teléfono" aria-label="Buscar clientes" autoComplete="off" />
            {search && <button type="button" data-testid="cli-search-clear" aria-label="Borrar búsqueda" onClick={() => setSearch('')}><X size={12} strokeWidth={3} aria-hidden="true" /></button>}
          </div>

          <div className="cli-list">
            {filteredCustomers.map((customer) => {
              const flashing = flash?.id === customer.id ? flash : null;
              const confirming = deletingId === customer.id;
              const className = ['cli-item', editingId === customer.id && 'is-editing', confirming && 'is-confirming', flashing && 'is-flash', flashing?.kind === 'add' && 'is-new'].filter(Boolean).join(' ');
              return (
                <article key={customer.id} className={className} data-testid="cli-row" data-id={customer.id}>
                  {flashing && <span key={flashing.seq} className="cli-flash" aria-hidden="true" />}
                  <span className={`cli-avatar ${toneFor(customer.id)}`} aria-hidden="true">{initials(customer.name)}</span>
                  <div className="cli-info">
                    <h3>{customer.name}{editingId === customer.id && <span className="cli-editing-badge">Editando</span>}</h3>
                    {(customer.phone || customer.email) && (
                      <div className="cli-contact">
                        {customer.phone && <span><Phone size={13} aria-hidden="true" />{customer.phone}</span>}
                        {customer.email && <span><Mail size={13} aria-hidden="true" />{customer.email}</span>}
                      </div>
                    )}
                    <div className="cli-aliases">
                      {customer.aliases.length > 0
                        ? customer.aliases.map((alias) => <span key={alias} className="cli-pill">{alias}</span>)
                        : <span className="cli-none">Sin apodos</span>}
                    </div>
                  </div>
                  {confirming ? (
                    <div className="cli-actions cli-swap" role="group" aria-label={`Confirmar eliminación de ${customer.name}`}>
                      <span className="cli-confirm-text">¿Eliminar a {customer.name}?</span>
                      <button type="button" className="cli-btn cli-btn--secondary cli-btn--sm" data-testid="cli-delete-cancel" onClick={() => setDeletingId(null)}>Cancelar</button>
                      <button type="button" className="cli-btn cli-btn--danger cli-btn--sm" data-testid="cli-delete-confirm" onClick={() => removeCustomer(customer)}>Eliminar</button>
                    </div>
                  ) : (
                    <div className="cli-actions cli-swap">
                      <button type="button" className="cli-btn cli-btn--secondary cli-btn--sm" data-testid="cli-edit" onClick={() => editCustomer(customer)}><Pencil size={13} aria-hidden="true" />Editar</button>
                      <button type="button" className="cli-btn cli-btn--ghost-danger cli-btn--sm" data-testid="cli-delete" aria-label={`Eliminar a ${customer.name}`} onClick={() => setDeletingId(customer.id)}><Trash2 size={13} aria-hidden="true" />Eliminar</button>
                    </div>
                  )}
                </article>
              );
            })}
            {filteredCustomers.length === 0 && (
              <div className="cli-empty" data-testid="cli-empty">
                <span aria-hidden="true"><Search size={20} /></span>
                <strong>{customers.length === 0 ? 'Aún no hay clientes' : 'Sin resultados'}</strong>
                <p>{customers.length === 0 ? 'Agrega tu primer cliente con el formulario de arriba.' : 'Prueba con otro nombre, apodo o teléfono.'}</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
