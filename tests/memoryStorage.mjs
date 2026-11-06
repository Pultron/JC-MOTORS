/** localStorage en memoria con key()/length/removeItem y una cuota simulable (en caracteres de clave + valor). */
export function installMemoryStorage() {
  const data = new Map();
  const control = { quota: Infinity };
  const used = () => [...data].reduce((sum, [key, value]) => sum + key.length + value.length, 0);
  const storage = {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => {
      const next = String(value);
      const delta = key.length + next.length - (data.has(key) ? key.length + data.get(key).length : 0);
      if (used() + delta > control.quota) throw new DOMException('Quota exceeded', 'QuotaExceededError');
      data.set(key, next);
    },
    removeItem: (key) => { data.delete(key); },
    clear: () => { data.clear(); },
    key: (index) => [...data.keys()][index] ?? null,
    get length() { return data.size; },
  };
  globalThis.localStorage = storage;
  return { data, control, storage };
}
