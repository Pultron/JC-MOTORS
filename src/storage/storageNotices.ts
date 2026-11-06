export interface StorageNotice {
  level: 'success' | 'info' | 'warning' | 'error';
  title: string;
  description?: string;
}

type Listener = (notice: StorageNotice) => void;

const MAX_PENDING = 20;
const listeners = new Set<Listener>();
let pending: StorageNotice[] = [];

/** Los repositorios no son React: publican avisos aquí y StorageNoticeBridge los convierte en Toast. */
export function emitStorageNotice(notice: StorageNotice): void {
  if (listeners.size === 0) {
    pending = [...pending, notice].slice(-MAX_PENDING);
    return;
  }
  listeners.forEach((listener) => listener(notice));
}

/** Entrega primero los avisos emitidos antes de que React estuviera montado (arranque, migración). */
export function subscribeStorageNotices(listener: Listener): () => void {
  listeners.add(listener);
  const queued = pending;
  pending = [];
  queued.forEach(listener);
  return () => { listeners.delete(listener); };
}
