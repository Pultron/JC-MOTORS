import type { CampoDudoso, InvoiceBorrador } from '../models/invoice';

const UUID_RE = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;
/** Firma RSA de 2048 bits: siempre 344 caracteres de base64. */
export const selloValido = (sello: string): boolean => sello.length === 344 && /^[A-Za-z0-9+/]+={0,2}$/.test(sello);

const SELLO_RE = /^[A-Za-z0-9+/=]{344}$/;
const BASE64_RE = /^[A-Za-z0-9+/=]*$/;

const centavos = (valor: string): number => Math.round(Number(valor.replace(/,/g, '')) * 100);

/** Un sello es una firma RSA de 2048 bits en base64: siempre mide 344 caracteres. */
function validarSello(campo: string, nombre: string, sello: string): CampoDudoso | null {
  if (!sello) return { campo, motivo: `${nombre} no se encontró en el documento` };
  if (!BASE64_RE.test(sello)) return { campo, motivo: `${nombre} contiene caracteres que no son base64` };
  if (!SELLO_RE.test(sello)) return { campo, motivo: `${nombre} tiene ${sello.length} caracteres, se esperaban 344` };
  return null;
}

/**
 * Reglas de integridad que no dependen de cómo se maquetó el PDF. También se usa en el modal de
 * revisión, así que se reevalúa mientras el usuario corrige.
 */
export function validarIntegridad(invoice: InvoiceBorrador): CampoDudoso[] {
  const dudas: Array<CampoDudoso | null> = [];
  dudas.push(validarSello('timbre.selloCFD', 'El sello digital del CFDI', invoice.timbre.selloCFD));
  dudas.push(validarSello('timbre.selloSAT', 'El sello digital del SAT', invoice.timbre.selloSAT));

  const cadena = invoice.timbre.cadenaOriginal;
  if (!(cadena.startsWith('||') && cadena.endsWith('||') && cadena.length > 4)) {
    dudas.push({ campo: 'timbre.cadenaOriginal', motivo: 'La cadena original debe empezar y terminar con ||' });
  }
  if (!UUID_RE.test(invoice.uuid)) dudas.push({ campo: 'uuid', motivo: 'El folio fiscal no tiene formato de UUID' });

  if (invoice.subtotal && invoice.total) {
    const suma = centavos(invoice.subtotal) + centavos(invoice.totalImpuestosTrasladados || '0') - centavos(invoice.totalImpuestosRetenidos || '0');
    if (!Number.isFinite(suma) || Math.abs(suma - centavos(invoice.total)) > 1) {
      dudas.push({ campo: 'total', motivo: 'Subtotal + impuestos no coincide con el total' });
    }
  } else {
    dudas.push({ campo: 'total', motivo: 'Faltan el subtotal o el total' });
  }
  return dudas.filter((duda): duda is CampoDudoso => duda !== null);
}

export const CAMPOS_DE_INTEGRIDAD = ['timbre.selloCFD', 'timbre.selloSAT', 'timbre.cadenaOriginal', 'uuid', 'total'];

export function sinDuplicados(dudas: CampoDudoso[]): CampoDudoso[] {
  const vistos = new Set<string>();
  return dudas.filter((duda) => (vistos.has(duda.campo) ? false : (vistos.add(duda.campo), true)));
}
