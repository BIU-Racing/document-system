// Hebrew text with embedded English, numbers and units keeps its reading order (lib/bidi.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { isolateLtr, stripIsolates } from '../lib/bidi.ts';

const L = '⁦', P = '⁩';
test('numbers with units become one left-to-right run; punctuation stays in the Hebrew sentence', () => {
  assert.equal(isolateLtr('למתח של 588 V נדרש לפחות 294 kΩ.'), `למתח של ${L}588 V${P} נדרש לפחות ${L}294 kΩ${P}.`);
  assert.equal(isolateLtr('הוזן 250 kΩ (425.17 Ω/V).'), `הוזן ${L}250 kΩ (425.17 Ω/V)${P}.`);
  assert.equal(isolateLtr('חורג מ־EV 6.3.3: למתח'), `חורג מ־${L}EV 6.3.3${P}: למתח`);
  assert.equal(isolateLtr('ה־IMD חייב 500 Ω/V'), `ה־${L}IMD${P} חייב ${L}500 Ω/V${P}`);
});
test('a colon or comma ends a run; formula symbols keep a calculation together', () => {
  assert.equal(isolateLtr('תקנון 2027: 2 חריגות'), `תקנון ${L}2027${P}: ${L}2${P} חריגות`);
  assert.equal(isolateLtr('חורג מ־T 11.6.6: 12 A × 588 V = 7.056 kW.'), `חורג מ־${L}T 11.6.6${P}: ${L}12 A × 588 V = 7.056 kW${P}.`);
  assert.equal(isolateLtr('בקבצים ESF, ASES או SES'), `בקבצים ${L}ESF, ASES${P} או ${L}SES${P}`);
  assert.equal(isolateLtr('בתבנית הרשמית: "Tube OD, mm" (Your Tube).'), `בתבנית הרשמית: "${L}Tube OD, mm${P}" ${L}(Your Tube)${P}.`);
  assert.equal(isolateLtr('נדרש 294 kΩ, הוזן 250'), `נדרש ${L}294 kΩ${P}, הוזן ${L}250${P}`);
});
test('parentheses around Hebrew stay balanced', () => {
  assert.equal(isolateLtr('90% (כלל ישן)'), `${L}90%${P} (כלל ישן)`);
  assert.equal(stripIsolates(isolateLtr('(עמוד 83, Formula Student Rules 2027)')), '(עמוד 83, Formula Student Rules 2027)');
});
test('idempotent and loss-free', () => {
  const text = 'חורג מ־T 11.6.6: 12 A × 588 V = 7.056 kW (מותר עד 5 kW).';
  assert.equal(isolateLtr(isolateLtr(text)), isolateLtr(text));
  assert.equal(stripIsolates(isolateLtr(text)), text);
  assert.equal(isolateLtr('טקסט בעברית בלבד'), 'טקסט בעברית בלבד');
});
