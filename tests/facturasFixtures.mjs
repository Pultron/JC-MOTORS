const base64 = (length, seed) => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let state = seed;
  let out = '';
  for (let i = 0; i < length; i++) { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; out += alphabet[(state >>> 20) % 64]; }
  return out;
};

const money = (n) => n.toFixed(2);

/** CFDI 4.0 sintético con el emisor del taller. `conceptos` controla el largo del documento. */
export function cfdiXml({ uuid, conceptos = 1, receptor = 'Refaccionaria El Águila, S.A. de C.V.' }) {
  const items = Array.from({ length: conceptos }, (_, i) => {
    const base = 1000 + i * 137.5;
    return {
      descripcion: `Servicio de afinación mayor número ${i + 1}: cambio de bujías, filtros de aceite y aire, limpieza de cuerpo de aceleración e inyectores, revisión de frenos y suspensión delantera`,
      base,
      iva: base * 0.16,
    };
  });
  const subtotal = items.reduce((sum, item) => sum + item.base, 0);
  const iva = items.reduce((sum, item) => sum + item.iva, 0);
  const total = subtotal + iva;
  const selloCFD = base64(344, 7);
  const selloSAT = base64(344, 11);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" Version="4.0" Fecha="2026-10-28T10:15:30" SubTotal="${money(subtotal)}" Total="${money(total)}" Moneda="MXN" FormaPago="03" MetodoPago="PUE" TipoDeComprobante="I" LugarExpedicion="80000" NoCertificado="00001000000504465028" Exportacion="01" Sello="${base64(344, 3)}">
  <cfdi:Emisor Rfc="LAVJ800101AB1" Nombre="Juan Carlos Lara Vidaño" RegimenFiscal="626"/>
  <cfdi:Receptor Rfc="AAA010101AAA" Nombre="${receptor}" DomicilioFiscalReceptor="80020" RegimenFiscalReceptor="601" UsoCFDI="G03"/>
  <cfdi:Conceptos>
${items.map((item) => `    <cfdi:Concepto ClaveProdServ="78181500" Cantidad="1" ClaveUnidad="E48" Unidad="Servicio" Descripcion="${item.descripcion}" ValorUnitario="${money(item.base)}" Importe="${money(item.base)}" ObjetoImp="02"><cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Base="${money(item.base)}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${money(item.iva)}"/></cfdi:Traslados></cfdi:Impuestos></cfdi:Concepto>`).join('\n')}
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="${money(iva)}"><cfdi:Traslados><cfdi:Traslado Base="${money(subtotal)}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${money(iva)}"/></cfdi:Traslados></cfdi:Impuestos>
  <cfdi:Complemento><tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="1.1" UUID="${uuid}" FechaTimbrado="2026-10-28T10:16:02" RfcProvCertif="SPR190613I52" SelloCFD="${selloCFD}" NoCertificadoSAT="00001000000505211816" SelloSAT="${selloSAT}"/></cfdi:Complemento>
</cfdi:Comprobante>
`;
  return { xml, uuid, total: money(total), selloCFD, selloSAT, cadenaOriginal: `||1.1|${uuid}|2026-10-28T10:16:02|SPR190613I52|${selloCFD}|00001000000505211816||` };
}

export const UUID_1 = '6B1F2C4A-9D3E-4F7A-8B21-0C5D7E9A1F34';
export const UUID_8 = 'A9C3E1B7-52D4-4E86-9F10-3B7C8D2E4A65';

export const UUID_C = 'C4D5E6F7-1A2B-4C3D-8E9F-0A1B2C3D4E5F';
export const UUID_SCAN = 'D0D0D0D0-0000-4000-8000-000000000000';
export const UUID_D = 'D1000000-0000-4000-8000-00000000000D';
export const UUID_E = 'E2000000-0000-4000-8000-00000000000E';
export const UUID_F = 'F3000000-0000-4000-8000-00000000000F';
export const UUID_G = 'A4000000-0000-4000-8000-000000000010';
