const UNIDADES = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE'];
const VEINTES = ['VEINTE', 'VEINTIUNO', 'VEINTIDOS', 'VEINTITRES', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISEIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
const DECENAS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

function menorDeMil(n: number): string {
  if (n === 100) return 'CIEN';
  const partes: string[] = [];
  const c = Math.floor(n / 100);
  const resto = n % 100;
  if (c) partes.push(CENTENAS[c]);
  if (resto) {
    if (resto <= 20) partes.push(UNIDADES[resto]);
    else if (resto < 30) partes.push(VEINTES[resto - 20]);
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      partes.push(u ? `${DECENAS[d]} Y ${UNIDADES[u]}` : DECENAS[d]);
    }
  }
  return partes.join(' ');
}

function enteroALetras(n: number): string {
  if (n === 0) return 'CERO';
  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const partes: string[] = [];
  if (millones) partes.push(millones === 1 ? 'UN MILLON' : `${enteroALetras(millones).replace(/UNO$/, 'UN')} MILLONES`);
  if (miles) partes.push(miles === 1 ? 'MIL' : `${menorDeMil(miles).replace(/UNO$/, 'UN')} MIL`);
  if (resto) partes.push(menorDeMil(resto));
  return partes.join(' ');
}

/**
 * Importe con letra a partir del texto del XML (sin pasar por coma flotante):
 * "25018.88" → "VEINTICINCO MIL DIECIOCHO PESOS 88/100 M.N."
 */
export function numeroALetras(monto: string | number, moneda = 'MXN'): string {
  const [enteroTexto, decimalesTexto = ''] = String(monto).trim().split('.');
  const entero = Number(enteroTexto || '0');
  const centavos = decimalesTexto.padEnd(2, '0').slice(0, 2);
  const nombre = moneda === 'MXN' ? 'PESOS' : moneda === 'USD' ? 'DOLARES' : moneda;
  const sufijo = moneda === 'MXN' ? 'M.N.' : moneda === 'USD' ? 'USD' : moneda;
  const unidad = entero === 1 && moneda === 'MXN' ? 'PESO' : nombre;
  const letras = entero === 1 ? 'UN' : enteroALetras(entero);
  // "UN MILLON DE PESOS": el complemento "DE" aplica a millones exactos.
  const de = entero > 0 && entero % 1_000_000 === 0 ? ' DE' : '';
  return `${letras}${de} ${unidad} ${centavos}/100 ${sufijo}`;
}
