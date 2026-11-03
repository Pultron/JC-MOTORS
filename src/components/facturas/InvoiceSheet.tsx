import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { Invoice, InvoiceImpuesto } from '../../models/invoice';
import {
  CLAVE_UNIDAD, EXPORTACION, FORMA_PAGO, IMPUESTO, METODO_PAGO, OBJETO_IMP, REGIMEN_FISCAL, TIPO_COMPROBANTE, USO_CFDI, conDescripcion,
} from '../../services/satCatalogs';
import { formatearFolio, formatFechaHora, formatMoney, formatSat, urlVerificacionSat } from '../../utils/invoiceFormat';
import { numeroALetras } from '../../utils/numeroALetras';

function etiquetaImpuesto(impuesto: InvoiceImpuesto): string {
  const nombre = IMPUESTO[impuesto.impuesto] ?? impuesto.impuesto;
  const tasa = impuesto.tasaOCuota && impuesto.tipoFactor !== 'Exento' ? ` ${(Number(impuesto.tasaOCuota) * 100).toFixed(2)}%` : '';
  return `${impuesto.tipo === 'Retención' ? 'Impuestos retenidos' : 'Impuestos trasladados'} ${nombre}${tasa}`;
}

/** Mismos criterios que services/invoicePdf.ts: impuestos propios del concepto o, si no hay, los del resumen en el primero. */
function impuestosDelConcepto(invoice: Invoice, indice: number): InvoiceImpuesto[] {
  if (invoice.conceptos.some((concepto) => concepto.impuestos && concepto.impuestos.length > 0)) return invoice.conceptos[indice].impuestos ?? [];
  return indice === 0 ? invoice.impuestos : [];
}

function Dato({ rotulo, valor, mono, testId }: { rotulo: string; valor: string; mono?: boolean; testId?: string }) {
  return (
    <div className="inv-dato">
      <small>{rotulo}</small>
      <span className={mono ? 'inv-mono' : undefined} data-testid={testId}>{valor || ' '}</span>
    </div>
  );
}

function Titulo({ children }: { children: string }) {
  return <p className="inv-titulo"><span>{children}</span><i /></p>;
}

/** Misma composición que el PDF (services/invoicePdf.ts): lo que se ve es lo que se descarga. */
export function InvoiceSheet({ invoice }: { invoice: Invoice }) {
  const [qr, setQr] = useState('');
  const url = invoice.urlQrOriginal ?? urlVerificacionSat({
    uuid: invoice.uuid, rfcEmisor: invoice.emisor.rfc, rfcReceptor: invoice.receptor.rfc, total: invoice.total, selloCFD: invoice.timbre.selloCFD,
  });

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(url, { width: 400, margin: 1, errorCorrectionLevel: 'M' }).then((data) => { if (active) setQr(data); });
    return () => { active = false; };
  }, [url]);

  const totalesFilas = invoice.impuestos.length > 0
    ? invoice.impuestos.map((impuesto) => ({ label: etiquetaImpuesto(impuesto), value: formatMoney(impuesto.importe) }))
    : [{ label: 'Impuestos trasladados', value: formatMoney(invoice.totalImpuestosTrasladados) }];

  return (
    <article className="inv-sheet" data-testid="invoice-sheet">
      <div className="inv-band"><span /><span /></div>
      <div className="inv-body">
        <header className="inv-head">
          <img src="/jc-motors-logo.png" alt="JC Motors" className="inv-logo" />
          <div className="inv-brandblock">
            <strong className="inv-brand">JC Motors</strong>
            <span className="inv-sub">Taller Automotriz · Culiacán, Sinaloa, México</span>
          </div>
          <div className="inv-title">
            <strong>FACTURA</strong>
            <span className="inv-folio-interno"><small>FOLIO INTERNO</small><b className="inv-mono" data-testid="invoice-folio">{formatearFolio(invoice.folio)}</b></span>
          </div>
        </header>
        <hr className="inv-rule" />

        <section className="inv-grid">
          <div>
            <Dato rotulo="RFC emisor" valor={invoice.emisor.rfc} mono />
            <Dato rotulo="Nombre emisor" valor={invoice.emisor.nombre} />
            <Dato rotulo="RFC receptor" valor={invoice.receptor.rfc} mono testId="invoice-receptor-rfc" />
            <Dato rotulo="Nombre receptor" valor={invoice.receptor.nombre} />
            <Dato rotulo="Código postal del receptor" valor={invoice.receptor.codigoPostal} mono />
            <Dato rotulo="Régimen fiscal receptor" valor={conDescripcion(REGIMEN_FISCAL, invoice.receptor.regimenFiscal)} />
            <Dato rotulo="Uso CFDI" valor={conDescripcion(USO_CFDI, invoice.receptor.usoCFDI)} />
          </div>
          <div>
            <Dato rotulo="Folio fiscal:" valor={invoice.uuid} mono testId="invoice-uuid" />
            <Dato rotulo="No. de serie del CSD" valor={invoice.serieCSD} mono />
            <Dato rotulo="Código postal, fecha y hora de emisión" valor={`${invoice.lugarExpedicion} ${formatFechaHora(invoice.fechaEmision)}`} mono />
            <Dato rotulo="Efecto de comprobante" valor={conDescripcion(TIPO_COMPROBANTE, invoice.efectoComprobante)} />
            <Dato rotulo="Régimen fiscal" valor={conDescripcion(REGIMEN_FISCAL, invoice.emisor.regimenFiscal)} />
            <Dato rotulo="Exportación" valor={conDescripcion(EXPORTACION, invoice.exportacion)} />
          </div>
        </section>

        <Titulo>CONCEPTOS</Titulo>
        <table className="inv-grid-table">
          <colgroup>{[19, 21, 14, 15, 24, 18, 22, 21, 28].map((w, i) => <col key={i} style={{ width: `${(w / 182) * 100}%` }} />)}</colgroup>
          <thead>
            <tr>
              <th>Clave del producto y/o servicio</th><th>No. identificación</th><th>Cantidad</th><th>Clave de unidad</th><th>Unidad</th>
              <th>Valor unitario</th><th>Importe</th><th>Descuento</th><th>Objeto impuesto</th>
            </tr>
          </thead>
          {invoice.conceptos.map((concepto, i) => {
            const impuestos = impuestosDelConcepto(invoice, i);
            return (
              <tbody key={i}>
                <tr>
                  <td className="inv-mono">{concepto.claveProdServ}</td>
                  <td className="inv-mono">{concepto.noIdentificacion}</td>
                  <td className="r">{concepto.cantidad}</td>
                  <td className="inv-mono">{concepto.claveUnidad}</td>
                  <td>{concepto.unidad || CLAVE_UNIDAD[concepto.claveUnidad]}</td>
                  <td className="r">{formatSat(concepto.valorUnitario)}</td>
                  <td className="r">{formatSat(concepto.importe)}</td>
                  <td className="r">{formatSat(concepto.descuento ?? '')}</td>
                  <td>{OBJETO_IMP[concepto.objetoImp] ?? concepto.objetoImp}</td>
                </tr>
                <tr>
                  <td className="lbl">Descripción</td>
                  <td colSpan={4}>{concepto.descripcion}</td>
                  <td colSpan={4} className="inv-nested">
                    <table>
                      <colgroup>{[18, 22, 21, 28].map((w, i) => <col key={i} style={{ width: `${(w / 89) * 100}%` }} />)}</colgroup>
                      <thead><tr><th>Impuesto</th><th>Tipo</th><th className="r">Base</th><th className="r">Tasa o cuota</th></tr></thead>
                      <tbody>
                        {(impuestos.length > 0 ? impuestos : [null]).map((impuesto, k) => (
                          <tr key={k}>
                            <td className="inv-mono">{impuesto ? conDescripcion(IMPUESTO, impuesto.impuesto) : ''}</td>
                            <td>{impuesto?.tipo}</td>
                            <td className="r">{impuesto ? formatSat(impuesto.base) : ''}</td>
                            <td className="r inv-mono">{impuesto?.tasaOCuota}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td className="lbl" colSpan={2}>Número de pedimento</td><td colSpan={2} />
                  <td className="lbl" colSpan={3}>Número de cuenta predial</td><td colSpan={2} />
                </tr>
              </tbody>
            );
          })}
        </table>

        <section className="inv-pay">
          <div>
            <Dato rotulo="Moneda" valor={invoice.moneda} />
            <Dato rotulo="Forma de pago" valor={conDescripcion(FORMA_PAGO, invoice.formaPago)} />
            <Dato rotulo="Método de pago" valor={conDescripcion(METODO_PAGO, invoice.metodoPago)} />
            <Dato rotulo="Importe con letra" valor={numeroALetras(invoice.total, invoice.moneda)} />
          </div>
          <div className="inv-totals">
            <div><span>Subtotal</span><span>{formatMoney(invoice.subtotal)}</span></div>
            {totalesFilas.map((fila, i) => <div key={i}><span>{fila.label}</span><span>{fila.value}</span></div>)}
            <div className="inv-total"><span>TOTAL</span><strong data-testid="invoice-total">${formatMoney(invoice.total)}</strong></div>
          </div>
        </section>

        <Titulo>Sello digital del CFDI</Titulo>
        <code className="inv-seal" data-testid="seal-cfd">{invoice.timbre.selloCFD}</code>
        <Titulo>Sello digital del SAT</Titulo>
        <code className="inv-seal" data-testid="seal-sat">{invoice.timbre.selloSAT}</code>

        <section className="inv-cert">
          <div className="inv-qr">{qr && <img src={qr} alt="Código QR de verificación SAT" />}</div>
          <div className="inv-cert-main">
            <Titulo>Cadena original del complemento de certificación digital del SAT</Titulo>
            <code className="inv-seal" data-testid="seal-cadena">{invoice.timbre.cadenaOriginal}</code>
          </div>
        </section>
        <section className="inv-cert-grid">
          <Dato rotulo="RFC del proveedor de certificación" valor={invoice.timbre.rfcProvCertif} mono />
          <Dato rotulo="Fecha y hora de certificación" valor={formatFechaHora(invoice.timbre.fechaCertificacion)} mono />
          <Dato rotulo="No. de serie del certificado SAT" valor={invoice.timbre.noCertificadoSAT} mono />
        </section>

        <footer className="inv-foot"><span>Este documento es una representación impresa de un CFDI</span></footer>
      </div>
      <div className="inv-band inv-band--bottom"><span /><span /></div>
    </article>
  );
}
