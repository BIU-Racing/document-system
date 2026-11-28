// Ranges, products and ratios between numbers stay one protected placeholder, so the model
// cannot drop the – / × / '/' between two placeholders (found on production texts, 28.11.2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareTranslation, restoreTranslation } from '../lib/local-translation.mjs';

test('a range, product or ratio is masked as one placeholder', () => {
  const cases = [
    ['עודכנה ב־25–26.10.2026 בלבד', '25–26.10.2026'],
    ['12×12S4P = 144S4P; ‏576 תאים', '12×12S4P = 144S4P'],
    ['48×71g, ללא שאר חלקי הסגמנט', '48×71g'],
    ['יציאה 400–680VDC/14A ו־20A', '400–680VDC/14A'],
    ['מידות 264.5×252×100mm ומשקל', '264.5×252×100mm'],
  ];
  for (const [text, literal] of cases) {
    const prepared = prepareTranslation(text);
    assert.ok(prepared.replacements.some(r => r.value === literal), `${literal} in ${text}: ${prepared.replacements.map(r => r.value)}`);
  }
});

test('the restored English keeps the exact range when the model keeps its placeholder', () => {
  const prepared = prepareTranslation('התצורה עודכנה ב־25–26.10.2026.');
  const marker = prepared.replacements.find(r => r.value === '25–26.10.2026').marker;
  const restored = restoreTranslation(prepared, `The configuration was updated on ${marker}.`);
  assert.equal(restored.ok, true, restored.failures?.join());
  assert.equal(restored.text, 'The configuration was updated on 25–26.10.2026.');
});

test('a Hebrew word between numbers still splits them (only symbols join)', () => {
  const prepared = prepareTranslation('בין 12 ל־24 וולט');
  assert.deepEqual(prepared.replacements.map(r => r.value), ['12', '24']);
});
