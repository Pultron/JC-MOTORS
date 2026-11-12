import assert from 'node:assert/strict';
import { test } from 'node:test';
import { numeroALetras } from '../src/utils/numeroALetras.ts';

const casos = [
  [0, 'CERO PESOS 00/100 M.N.'],
  ['0.00', 'CERO PESOS 00/100 M.N.'],
  ['1.00', 'UN PESO 00/100 M.N.'],
  [16, 'DIECISÉIS PESOS 00/100 M.N.'],
  [21, 'VEINTIÚN PESOS 00/100 M.N.'],
  [22, 'VEINTIDÓS PESOS 00/100 M.N.'],
  [23, 'VEINTITRÉS PESOS 00/100 M.N.'],
  [26, 'VEINTISÉIS PESOS 00/100 M.N.'],
  [31, 'TREINTA Y UN PESOS 00/100 M.N.'],
  [100, 'CIEN PESOS 00/100 M.N.'],
  [101, 'CIENTO UN PESOS 00/100 M.N.'],
  [121, 'CIENTO VEINTIÚN PESOS 00/100 M.N.'],
  ['1,000.00'.replace(',', ''), 'MIL PESOS 00/100 M.N.'],
  ['1500.50', 'MIL QUINIENTOS PESOS 50/100 M.N.'],
  ['21000', 'VEINTIÚN MIL PESOS 00/100 M.N.'],
  ['31000', 'TREINTA Y UN MIL PESOS 00/100 M.N.'],
  ['100000', 'CIEN MIL PESOS 00/100 M.N.'],
  ['121000', 'CIENTO VEINTIÚN MIL PESOS 00/100 M.N.'],
  ['25018.88', 'VEINTICINCO MIL DIECIOCHO PESOS 88/100 M.N.'],
  ['1000000', 'UN MILLÓN DE PESOS 00/100 M.N.'],
  ['1500000', 'UN MILLÓN QUINIENTOS MIL PESOS 00/100 M.N.'],
  ['1000001', 'UN MILLÓN UN PESOS 00/100 M.N.'],
  ['2000000.01', 'DOS MILLONES DE PESOS 01/100 M.N.'],
  ['21000000', 'VEINTIÚN MILLONES DE PESOS 00/100 M.N.'],
  ['999999.99', 'NOVECIENTOS NOVENTA Y NUEVE MIL NOVECIENTOS NOVENTA Y NUEVE PESOS 99/100 M.N.'],
];

for (const [monto, esperado] of casos) {
  test(`#023 ${monto} → ${esperado}`, () => assert.equal(numeroALetras(monto), esperado));
}

test('#023 ninguna leyenda trae palabras sin acento ni formas inválidas', () => {
  for (let n = 0; n < 2000; n += 1) {
    const texto = numeroALetras(n);
    assert.doesNotMatch(texto, /DIECISEIS|VEINTIDOS|VEINTITRES|VEINTISEIS|VEINTIUN|UNO PESO|UNO MIL/, `${n}: ${texto}`);
    assert.doesNotMatch(texto, /\bUNO\b/, `${n}: ${texto}`);
  }
});

test('#023 dólares con acento y singular', () => {
  assert.equal(numeroALetras('1.00', 'USD'), 'UN DÓLAR 00/100 USD');
  assert.equal(numeroALetras('16.5', 'USD'), 'DIECISÉIS DÓLARES 50/100 USD');
});
