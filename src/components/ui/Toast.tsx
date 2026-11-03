import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { AnimationEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Info, TriangleAlert, X } from 'lucide-react';

export type ToastType = 'success' | 'info' | 'warning' | 'error';

export interface ToastInput {
  title: string;
  description?: string;
}

export interface ToastApi {
  success: (input: ToastInput) => void;
  info: (input: ToastInput) => void;
  warning: (input: ToastInput) => void;
  error: (input: ToastInput) => void;
}

interface ToastEntry extends ToastInput {
  id: number;
  type: ToastType;
  state: 'in' | 'out';
}

interface ToastState {
  toasts: ToastEntry[];
  dismiss: (id: number) => void;
  remove: (id: number) => void;
}

const MAX_VISIBLE = 3;
const ToastApiContext = createContext<ToastApi | null>(null);
const ToastStateContext = createContext<ToastState | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(0);

  const push = useCallback((type: ToastType, { title, description }: ToastInput) => {
    const id = ++nextId.current;
    setToasts((current) => {
      const last = current[current.length - 1];
      // Un toast idéntico justo después del anterior se descarta en lugar de duplicarse.
      if (last && last.state === 'in' && last.type === type && last.title === title && last.description === description) return current;
      return [...current, { id, type, title, description, state: 'in' as const }].slice(-MAX_VISIBLE);
    });
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.map((toast) => (toast.id === id && toast.state === 'in' ? { ...toast, state: 'out' } : toast)));
  }, []);

  const remove = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const api = useMemo<ToastApi>(() => ({
    success: (input) => push('success', input),
    info: (input) => push('info', input),
    warning: (input) => push('warning', input),
    error: (input) => push('error', input),
  }), [push]);

  const state = useMemo(() => ({ toasts, dismiss, remove }), [toasts, dismiss, remove]);

  return (
    <ToastApiContext.Provider value={api}>
      <ToastStateContext.Provider value={state}>{children}</ToastStateContext.Provider>
    </ToastApiContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastApiContext);
  if (!api) throw new Error('useToast debe usarse dentro de ToastProvider');
  return api;
}

export function ToastViewport() {
  const state = useContext(ToastStateContext);
  const [modalTarget, setModalTarget] = useState<HTMLDialogElement | null>(null);

  // Un <dialog> modal nativo vive en la capa superior: el viewport debe montarse dentro para verse encima.
  useEffect(() => {
    const updateTarget = () => {
      const openDialogs = document.querySelectorAll<HTMLDialogElement>('dialog[open]');
      setModalTarget(openDialogs[openDialogs.length - 1] ?? null);
    };
    updateTarget();
    const observer = new MutationObserver(updateTarget);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
    return () => observer.disconnect();
  }, []);

  if (!state) throw new Error('ToastViewport debe usarse dentro de ToastProvider');

  const content = (
    <div className="toast-viewport" role="status" aria-live="polite" aria-label="Notificaciones">
      {state.toasts.map((toast) => <ToastCard key={toast.id} toast={toast} onDismiss={state.dismiss} onRemove={state.remove} />)}
    </div>
  );
  return modalTarget ? createPortal(content, modalTarget) : content;
}

function Badge({ type }: { type: ToastType }) {
  return (
    <span className="toast-badge" aria-hidden="true">
      {type === 'success' && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
          <path className="mac-draw" d="M5 12.5l4.5 4.5L19 7" pathLength="1" />
        </svg>
      )}
      {type === 'info' && <Info size={12} strokeWidth={3} />}
      {type === 'warning' && <TriangleAlert size={12} strokeWidth={3} />}
      {type === 'error' && <X size={12} strokeWidth={3.4} />}
    </span>
  );
}

interface ToastCardProps {
  toast: ToastEntry;
  onDismiss: (id: number) => void;
  onRemove: (id: number) => void;
}

function ToastCard({ toast, onDismiss, onRemove }: ToastCardProps) {
  function handleAnimationEnd(event: AnimationEvent<HTMLDivElement>) {
    // El cierre automático lo dispara la barra: pausarla en hover pausa el cierre sin temporizadores.
    // pop y draw burbujean desde los hijos y se ignoran.
    if (event.animationName === 'shrink') onDismiss(toast.id);
    else if (event.animationName === 'toastOut') onRemove(toast.id);
  }

  return (
    <div className="toast" data-testid="toast" data-type={toast.type} data-state={toast.state} onAnimationEnd={handleAnimationEnd}>
      <div className="toast-app" aria-hidden="true">
        <img src="/jc-motors-logo.png" alt="" />
        <Badge type={toast.type} />
      </div>
      <div className="toast-text">
        <div className="toast-head">
          <strong className="toast-title">{toast.title}</strong>
          <span className="toast-time" aria-hidden="true">ahora</span>
        </div>
        {toast.description && <p className="toast-body">{toast.description}</p>}
      </div>
      <button type="button" data-testid="toast-close" className="toast-close" aria-label="Cerrar notificación" onClick={() => onDismiss(toast.id)}>
        <X size={10} strokeWidth={3.2} aria-hidden="true" />
      </button>
      <div className="toast-track" aria-hidden="true"><div className="tbar" /></div>
    </div>
  );
}
