import { shareStatusOf } from './shareStatus';
import type { ShareRecord } from './shareStatus';

// ---- Filter ----------------------------------------------------------------------------------------------------

export type ShareFilter = 'todas' | 'compartidas' | 'sin-compartir' | 'whatsapp' | 'correo';

export const SHARE_FILTERS: readonly ShareFilter[] = ['todas', 'compartidas', 'sin-compartir', 'whatsapp', 'correo'];

export const SHARE_FILTER_LABEL: Record<ShareFilter, string> = {
  todas: 'Todas',
  compartidas: 'Compartidas',
  'sin-compartir': 'Sin compartir',
  whatsapp: 'WhatsApp',
  correo: 'Correo',
};

/** Unknown or absent URL values fall back to "todas". */
export function shareFilterFromParam(value: string | null): ShareFilter {
  const normalized = value?.trim().toLowerCase();
  return SHARE_FILTERS.find((entry) => entry === normalized) ?? 'todas';
}

export function matchesShareFilter(record: ShareRecord, filter: ShareFilter): boolean {
  if (filter === 'todas') return true;
  const status = shareStatusOf(record);
  if (filter === 'sin-compartir') return status.kind === 'none';
  if (status.kind === 'none') return false;
  if (filter === 'compartidas') return true;
  return status.medium === (filter === 'whatsapp' ? 'whatsapp' : 'email');
}

export function filterByShare<T extends ShareRecord>(quotations: readonly T[], filter: ShareFilter): T[] {
  return filter === 'todas' ? [...quotations] : quotations.filter((quotation) => matchesShareFilter(quotation, filter));
}

/** Empty-state title for a share filter that matched nothing. */
export function shareFilterEmptyTitle(filter: ShareFilter): string {
  switch (filter) {
    case 'sin-compartir': return 'No hay cotizaciones sin compartir';
    case 'compartidas': return 'No hay cotizaciones compartidas';
    case 'whatsapp': return 'No hay cotizaciones compartidas por WhatsApp';
    case 'correo': return 'No hay cotizaciones compartidas por correo';
    default: return 'No hay cotizaciones';
  }
}
