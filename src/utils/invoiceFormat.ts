/**
 * Formato de presentación para valores fiscales. Trabaja sobre el TEXTO del XML:
 * solo agrega separadores de miles y completa a 2 decimales; nunca redondea ni recalcula.
 */
export function formatMoney(value: string): string {
  if (!value) return '';
  const [entero, decimales = ''] = value.split('.');
  const miles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${miles}.${decimales.padEnd(2, '0')}`;
}

/** Cantidad tal como viene en el CFDI: solo agrupa miles, sin agregar ni quitar decimales. */
export function formatSat(value: string): string {
  if (!value) return '';
  const [entero, decimales] = value.split('.');
  const miles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decimales === undefined ? miles : `${miles}.${decimales}`;
}

/** Monto para la URL de verificación del SAT: dos decimales y sin comas. */
export function montoQr(total: string): string {
  const [entero, decimales = ''] = total.split('.');
  return `${entero}.${decimales.padEnd(2, '0').slice(0, 2)}`;
}

/** TasaOCuota 0.160000 → "16.00%" (solo presentación). */
export function formatTasa(tasa: string, tipoFactor: string): string {
  if (!tasa) return '';
  if (tipoFactor === 'Exento') return 'Exento';
  const porcentaje = (Number(tasa) * 100).toFixed(2);
  return `${porcentaje}%`;
}

export function formatFechaHora(iso: string): string {
  return iso.replace('T', ' ');
}

export function uuidCorto(uuid: string): string {
  return uuid.slice(0, 8);
}

export function urlVerificacionSat(args: { uuid: string; rfcEmisor: string; rfcReceptor: string; total: string; selloCFD: string }): string {
  const fe = args.selloCFD.slice(-8);
  return `https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id=${args.uuid}&re=${args.rfcEmisor}&rr=${args.rfcReceptor}&tt=${montoQr(args.total)}&fe=${fe}`;
}

/** Folio interno con cuatro dígitos: 42 → "0042". */
export const formatearFolio = (folio: number): string => String(folio).padStart(4, '0');

/** "Factura Num - 0042" (sin extensión). */
export function nombreArchivoFactura(folio: number): string {
  return `Factura Num - ${formatearFolio(folio)}`;
}
