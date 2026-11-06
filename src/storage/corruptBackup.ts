import { emitStorageNotice } from './storageNotices';
import { listKeys, readRaw, writeRaw } from './safeStorage';
import { BACKUP_PREFIX } from './storageKeys';

export interface GuardedReadOptions {
  /** Segmento de la clave de respaldo: jc-motors:backup:<backupName>:<timestamp>. */
  backupName: string;
  /** Texto del aviso al usuario, p. ej. "Los costos internos estaban dañados; se guardó una copia de respaldo". */
  damagedMessage: string;
}

export type GuardedRead<T> =
  | { status: 'missing' }
  | { status: 'ok'; value: T }
  | { status: 'corrupt' };

const reportedThisSession = new Set<string>();

function fingerprint(raw: string): string {
  let hash = 5381;
  for (let index = 0; index < raw.length; index += 1) hash = ((hash * 33) ^ raw.charCodeAt(index)) >>> 0;
  return `${raw.length}:${hash}`;
}

/**
 * Copia el texto crudo dañado a una clave de respaldo ANTES de que el repositorio devuelva su valor por defecto
 * (la siguiente escritura sobrescribiría la evidencia). No duplica copias idénticas ni dentro ni entre sesiones.
 */
export function quarantineCorrupt(key: string, raw: string, { backupName, damagedMessage }: GuardedReadOptions): void {
  const signature = `${key}|${fingerprint(raw)}`;
  if (reportedThisSession.has(signature)) return;
  reportedThisSession.add(signature);

  const prefix = `${BACKUP_PREFIX}${backupName}:`;
  const alreadySaved = listKeys().some((candidate) => candidate.startsWith(prefix) && readRaw(candidate) === raw);
  let saved = alreadySaved;
  if (!alreadySaved) {
    try {
      writeRaw(`${prefix}${Date.now()}`, raw);
      saved = true;
    } catch { /* Almacenamiento lleno: se avisa abajo. */ }
  }

  emitStorageNotice({
    level: 'warning',
    title: 'Datos dañados',
    description: saved ? damagedMessage : `${damagedMessage.split(';')[0]}; no se pudo guardar la copia de respaldo porque el almacenamiento está lleno.`,
  });
}

/** Lee y valida JSON. Si está dañado o no tiene la forma esperada, lo respalda y avisa; nunca lanza. */
export function readGuardedJson<T>(
  key: string,
  options: GuardedReadOptions,
  validate: (value: unknown) => value is T,
): GuardedRead<T> {
  const raw = readRaw(key);
  if (raw === null || raw.trim() === '') return { status: 'missing' };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (validate(parsed)) return { status: 'ok', value: parsed };
  } catch { /* JSON inválido: se trata igual que una forma inesperada. */ }
  quarantineCorrupt(key, raw, options);
  return { status: 'corrupt' };
}
