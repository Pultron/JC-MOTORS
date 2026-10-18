import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, CircleAlert, Info, TriangleAlert, X } from 'lucide-react';
import './toast.css';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastOptions {
  type: ToastType;
  title: string;
  message?: string;
}

interface ToastEntry extends ToastOptions {
  id: number;
  duration: number;
}

interface ToastContextValue {
  showToast: (options: ToastOptions) => void;
  toasts: ToastEntry[];
  removeToast: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);
const icons = { success: Check, error: CircleAlert, warning: TriangleAlert, info: Info };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(0);

  const showToast = useCallback(({ type, title, message }: ToastOptions) => {
    const entry: ToastEntry = { id: ++nextId.current, type, title, message, duration: type === 'error' ? 6000 : 4000 };
    setToasts((current) => [...current, entry].slice(-3));
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  return <ToastContext.Provider value={{ showToast, toasts, removeToast }}>{children}</ToastContext.Provider>;
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast debe usarse dentro de ToastProvider');
  return context.showToast;
}

export function ToastViewport() {
  const context = useContext(ToastContext);
  const [modalTarget, setModalTarget] = useState<HTMLDialogElement | null>(null);
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
  if (!context) throw new Error('ToastViewport debe usarse dentro de ToastProvider');
  const content = (
    <div className={`toast-viewport${modalTarget ? ' toast-viewport-modal' : ''}`} aria-label="Notificaciones">
      {context.toasts.map((toast) => <ToastCard key={toast.id} toast={toast} onRemove={context.removeToast} />)}
    </div>
  );
  return modalTarget ? createPortal(content, modalTarget) : content;
}

function ToastCard({ toast, onRemove }: { toast: ToastEntry; onRemove: (id: number) => void }) {
  const [leaving, setLeaving] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const remaining = useRef(toast.duration);
  const paused = hovered || focused;
  const Icon = icons[toast.type];

  useEffect(() => {
    if (paused || leaving) return;
    const started = performance.now();
    const timer = window.setTimeout(() => setLeaving(true), remaining.current);
    return () => {
      remaining.current = Math.max(0, remaining.current - (performance.now() - started));
      window.clearTimeout(timer);
    };
  }, [paused, leaving]);

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => onRemove(toast.id), 180);
    return () => window.clearTimeout(timer);
  }, [leaving, onRemove, toast.id]);

  return (
    <div
      className={`toast-card toast-${toast.type}`}
      data-leaving={leaving}
      data-paused={paused}
      role={toast.type === 'error' || toast.type === 'warning' ? 'alert' : 'status'}
      aria-live={toast.type === 'error' || toast.type === 'warning' ? 'assertive' : 'polite'}
      aria-atomic="true"
      style={{ '--toast-duration': `${toast.duration}ms` } as CSSProperties}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
    >
      <div className="toast-content">
        <span className="toast-icon" aria-hidden="true"><Icon size={20} strokeWidth={2.5} /></span>
        <div className="toast-copy"><strong>{toast.title}</strong>{toast.message && <p>{toast.message}</p>}</div>
        <button type="button" className="toast-close" aria-label={`Cerrar notificación: ${toast.title}`} onClick={() => setLeaving(true)}><X size={17} /></button>
      </div>
      <span className="toast-progress" aria-hidden="true" />
    </div>
  );
}
