// QA audit 2026-11 (docs/qa/2026-11-export-translation-audit.md).
// These checks read the OFFICIAL template XML directly (formulas, unit labels) instead of
// trusting the project's own mapping. Known defects are recorded as `todo` so CI stays green
// while the defect is visible in every test run; when a defect is fixed, the todo test starts
// passing and should be turned into a normal test.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';
import { validateLiterals } from '../lib/local-translation.mjs';

const load = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const templates = load('private-data/official-workbook-templates.json');
const entries = load('data/coverage.normalized.json').entries;
const coordinator = load('data/coordinator.normalized.json');
const parts = Object.fromEntries(['esf', 'ases'].map(kind => [kind, unzipSync(Buffer.from(templates[kind].base64, 'base64'))]));
function sharedStrings(kind) {
  const xml = parts[kind]['xl/sharedStrings.xml'] ? strFromU8(parts[kind]['xl/sharedStrings.xml']) : '';
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => [...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map(t => t[1]).join(''));
}
function sheetXml(kind, name) { const s = templates[kind].sheets.find(x => x.name === name); return strFromU8(parts[kind][s.path]); }
function cellText(kind, sheet, ref) {
  const m = new RegExp(`<c r="${ref}"([^>]*?)(?:/>|>([\\s\\S]*?)</c>)`).exec(sheetXml(kind, sheet));
  if (!m) return '';
  const v = /<v>([^<]*)<\/v>/.exec(m[2] ?? '')?.[1] ?? '';
  return /t="s"/.test(m[1]) ? sharedStrings(kind)[Number(v)] : v;
}
function formulasComparing(kind, sheet, ref) {
  const xml = sheetXml(kind, sheet), hits = [];
  for (const m of xml.matchAll(/<c r="([A-Z]+\d+)"[^>]*>\s*<f>([^<]*)<\/f>/g)) {
    const body = m[2].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/ISBLANK\([^)]*\)/g, '');
    if (new RegExp(`(?<![A-Z$])${ref}(?!\\d)\\s*(?:[<>]=?|=\\s*\\d)`).test(body)) hits.push(`${m[1]}: =${body}`);
  }
  return hits;
}

test('control: Excel-side checks exist for the numeric-as-text cells (template evidence)', () => {
  assert.match(formulasComparing('esf', 'PrechargeDischarge', 'D14').join(), /D14 < 90/);
  assert.match(formulasComparing('esf', 'Accumulator', 'O24').join(), /O24<10/);
});

// Defect QA-01: numeric quantities collected as free text are written as inline strings.
// In Excel any text compares greater than any number, so "80" < 90 is FALSE and the
// precharge check shows OK for a failing 80 % ratio (verified in Microsoft Excel).
const NUMERIC_AS_TEXT = [
  ['esf', 'Accumulator', 'O12'], ['esf', 'Accumulator', 'O13'], ['esf', 'Accumulator', 'O24'],
  ['esf', 'PrechargeDischarge', 'D14'], ['esf', 'Shutdown Circuit', 'D5'], ['esf', 'Shutdown Circuit', 'K6'], ['esf', 'Other', 'D6'],
  ['ases', 'EV5.5.1&2 EV4.4 ACPS TSPS sidex', 'E14'], ['ases', 'EV5.5.1&2 EV4.4 ACPS TSPS rearx', 'E14'],
];
test('QA-01 cells compared numerically by the template are mapped as numeric inputs', { todo: 'QA-01: still mapped as text_with_source' }, () => {
  const wrong = NUMERIC_AS_TEXT.filter(([kind, sheet, ref]) => {
    assert.ok(formulasComparing(kind, sheet, ref).length, `${sheet}!${ref} has a numeric check`);
    const e = entries.find(x => x.official.document.toLowerCase() === kind && x.official.sheet === sheet && x.official.ranges[0] === ref);
    return e && e.inputSchema.type !== 'number_with_unit_and_source';
  });
  assert.deepEqual(wrong, []);
});

// Defect QA-02: charger power unit. Template Charging!E10 says kW; the app asks for W.
test('QA-02 charger power is requested in the template unit', { todo: 'QA-02: app asks for W, template expects kW' }, () => {
  assert.equal(cellText('esf', 'Charging', 'E10'), 'kW');
  const field = coordinator.find(f => f.id === 'LC-ESF-S06-D10');
  assert.equal(field.unit, 'kW');
});

// Defect QA-03: the literal validator lets a superscript unit disappear (mm² -> mm).
// Observed with the real model: "שטח החתך 35 mm²" -> "cut area 35 mm".
test('QA-03 translation validator rejects a changed unit (mm² -> mm)', { todo: 'QA-03: superscripts are not protected literals' }, () => {
  assert.equal(validateLiterals('שטח החתך 35 mm²', 'cut area 35 mm').ok, false);
});

// Defect QA-04: an omitted sentence without numbers or Latin literals passes validation.
test('QA-04 translation validator rejects a translation that drops a sentence', { todo: 'QA-04: no completeness check' }, () => {
  const source = 'המכסה נסגר בברגים ננעלים. מערכת הקירור אינה משתמשת בנוזל מוליך.';
  assert.equal(validateLiterals(source, 'The lid is closed with locking bolts.').ok, false);
});
