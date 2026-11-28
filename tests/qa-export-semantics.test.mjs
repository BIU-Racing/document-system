// QA audit 2026-11 (docs/qa/2026-11-export-translation-audit.md).
// Regression tests for the Excel export defects QA-01 (numeric values exported as text) and
// QA-02 (charger power W vs kW). Expectations come from the OFFICIAL template XML and an
// independent list below, not from the project's own mapping table. The template's own
// PASS/FAIL formulas are evaluated with Excel comparison semantics (text > any number).
// QA-03/QA-04 are translation defects deliberately left for the translation-quality work.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Module, { createRequire } from 'node:module';
import { unzipSync, strFromU8 } from 'fflate';
import { validateLiterals } from '../lib/local-translation.mjs';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const built = esbuild.buildSync({ entryPoints: ['lib/official-workbooks.ts'], bundle: true, platform: 'node', format: 'cjs', target: 'node22', write: false, logLevel: 'silent' });
const mod = new Module(path.resolve('lib/qa-semantics-test.cjs'), null); mod.filename = path.resolve('lib/qa-semantics-test.cjs'); mod.paths = Module._nodeModulePaths(path.resolve('lib')); mod._compile(built.outputFiles[0].text, mod.filename);
const { buildOfficialWorkbook } = mod.exports;

const load = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const templates = load('private-data/official-workbook-templates.json');
const entries = load('data/coverage.normalized.json').entries;
const coordinator = load('data/coordinator.normalized.json');
const systems = load('data/systems.normalized.json');
require('./route-raw-data.cjs').routeRawData(entries, coordinator, systems);
const fieldsOf = id => id === 'COORDINATOR' ? coordinator : systems.find(s => s.id === id).fields;
const canonical = v => Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => JSON.stringify(k) + ':' + canonical(x)).join(',') + '}' : JSON.stringify(v) ?? 'null';
const sha = v => crypto.createHash('sha256').update(v).digest('hex');

// ---------- workbook reading (independent of lib/official-workbooks.ts) ----------
function book(bytes, kind) {
  const parts = unzipSync(bytes);
  const shared = parts['xl/sharedStrings.xml'] ? [...strFromU8(parts['xl/sharedStrings.xml']).matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => [...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map(t => t[1]).join('')) : [];
  const names = Object.fromEntries([...strFromU8(parts['xl/workbook.xml']).matchAll(/<definedName[^>]*name="([^"]+)"[^>]*>([^<]*)<\/definedName>/g)].map(m => [m[1], m[2].replace(/&quot;/g, '"')]));
  const sheets = {};
  const sheet = name => {
    if (sheets[name]) return sheets[name];
    const xml = strFromU8(parts[templates[kind].sheets.find(s => s.name === name).path]), cells = {};
    for (const m of xml.matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const t = /t="([^"]+)"/.exec(m[2])?.[1], body = m[3] ?? '';
      const f = /<f>([^<]*)<\/f>/.exec(body)?.[1]?.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
      const v = /<v>([^<]*)<\/v>/.exec(body)?.[1];
      let value = null, xmlType = t ?? (v !== undefined ? 'n' : 'blank');
      if (t === 'inlineStr') value = [...body.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map(x => x[1]).join('').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      else if (t === 's') value = shared[Number(v)];
      else if (t === 'b') value = v === '1';
      else if (t === 'str') value = v ?? '';
      else if (v !== undefined) value = Number(v);
      cells[m[1]] = { value, formula: f, xmlType };
    }
    return (sheets[name] = cells);
  };
  return { sheet, names };
}

// ---------- minimal Excel formula evaluator (only what the audited checks use) ----------
function evaluate(formula, cells, names) {
  const src = formula.replace(/^=/, ''); let i = 0;
  const ws = () => { while (src[i] === ' ') i++; };
  const peek = s => { ws(); return src.startsWith(s, i); };
  const eat = s => { if (!peek(s)) throw Error(`Unsupported formula near "${src.slice(i)}" in ${formula}`); i += s.length; };
  const rank = v => typeof v === 'number' ? 1 : typeof v === 'string' ? 2 : 3;
  const cmp = (a, b) => { // Excel: blank->0/""; number < text < boolean; text case-insensitive
    if (a === null) a = typeof b === 'string' ? '' : 0; if (b === null) b = typeof a === 'string' ? '' : 0;
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (typeof a === 'string') { a = a.toLowerCase(); b = b.toLowerCase(); }
    return a < b ? -1 : a > b ? 1 : 0;
  };
  const truthy = v => { if (typeof v === 'boolean') return v; if (typeof v === 'number') return v !== 0; if (v === null) return false; if (/^true$/i.test(v)) return true; if (/^false$/i.test(v)) return false; throw Error('#VALUE!'); };
  const num = v => { if (v === null) return 0; if (typeof v === 'number') return v; if (typeof v === 'boolean') return v ? 1 : 0; const n = Number(v); if (v.trim() === '' || !Number.isFinite(n)) throw Error('#VALUE!'); return n; };
  function primary() {
    ws();
    if (peek('(')) { eat('('); const v = compare(); eat(')'); return v; }
    if (peek('"')) { i++; let s = ''; while (!(src[i] === '"' && src[i + 1] !== '"')) { if (src[i] === '"') i++; s += src[i++]; } i++; return s; }
    const n = /^\d+(?:\.\d+)?/.exec(src.slice(i)); if (n) { i += n[0].length; return Number(n[0]); }
    const id = /^\$?[A-Z]+\$?\d+|^[A-Za-z_][A-Za-z0-9_.]*/.exec(src.slice(i)); if (!id) throw Error('Unsupported ' + formula);
    i += id[0].length;
    if (peek('(')) { eat('('); const name = id[0].toUpperCase();
      if (name === 'ISBLANK') { ws(); const ref = /^\$?([A-Z]+)\$?(\d+)/.exec(src.slice(i)); i += ref[0].length; eat(')'); const c = cells[ref[1] + ref[2]]; return !c || c.value === null; }
      const thunks = []; let start = true;
      while (!peek(')')) { if (!start) eat(','); start = false; const at = i; compare(); thunks.push(at); }
      eat(')'); const end = i;
      const arg = k => { i = thunks[k]; const v = compare(); return v; };
      let out;
      if (name === 'IF') out = truthy(arg(0)) ? (thunks.length > 1 ? arg(1) : true) : (thunks.length > 2 ? arg(2) : false);
      else if (name === 'AND') out = thunks.every((_, k) => truthy(arg(k)));
      else if (name === 'OR') out = thunks.some((_, k) => truthy(arg(k)));
      else if (name === 'NOT') out = !truthy(arg(0));
      else throw Error('Unsupported function ' + name);
      i = end; return out; }
    if (/^\$?[A-Z]+\$?\d+$/.test(id[0])) return cells[id[0].replace(/\$/g, '')]?.value ?? null;
    if (/^true$/i.test(id[0])) return true; if (/^false$/i.test(id[0])) return false;
    if (id[0] in names) return evaluate(names[id[0]], cells, names);
    throw Error('Unknown name ' + id[0]);
  }
  function unary() { ws(); if (peek('-')) { eat('-'); return -num(unary()); } return primary(); }
  function term() { let v = unary(); for (;;) { if (peek('*')) { eat('*'); v = num(v) * num(unary()); } else if (peek('/')) { eat('/'); v = num(v) / num(unary()); } else return v; } }
  function additive() { let v = term(); for (;;) { if (peek('+')) { eat('+'); v = num(v) + num(term()); } else if (peek('-') ) { eat('-'); v = num(v) - num(term()); } else return v; } }
  function compare() {
    let v = additive();
    for (const op of ['<>', '<=', '>=', '=', '<', '>']) if (peek(op)) { eat(op); const r = cmp(v, additive()); return { '<>': r !== 0, '<=': r <= 0, '>=': r >= 0, '=': r === 0, '<': r < 0, '>': r > 0 }[op]; }
    return v;
  }
  const value = compare(); ws(); if (i !== src.length) throw Error('Unparsed tail in ' + formula); return value;
}
const check = (bytes, kind, sheet, ref) => { const b = book(bytes, kind), cells = b.sheet(sheet); return evaluate(cells[ref].formula, cells, b.names); };

// ---------- export helpers ----------
const entry = id => entries.find(e => e.id === id);
async function exportAnswers(kind, bySystem) {
  const snapshots = Object.entries(bySystem).map(([id, answers]) => ({ id, answers: Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, { status: 'answered', value: v, sourceReview: 'confirmed' }])), revision: 3, status: 'draft', attachments: [], progress: {}, updatedAt: null, review: { fields: {} }, schemaVersion: 'qa' }));
  const translations = snapshots.map(s => ({ systemId: s.id, sourceRevision: 3, sourceHash: sha(canonical(s.answers)), isCurrent: true, englishAnswers: s.answers, fieldStates: Object.fromEntries(Object.keys(s.answers).map(k => [k, 'ready'])) }));
  return buildOfficialWorkbook({ kind, snapshots, translations, generatedAt: '2026-11-22T00:00:00Z' });
}
const one = (id, value, extra = {}) => { const e = entry(id); return exportAnswers(e.official.document.toLowerCase(), { [e.systemId ?? 'COORDINATOR']: { [e.fieldId]: value, ...extra } }); };
const status = (w, id) => w.report.fields.find(f => f.controlId === id)?.status;

// Independent list (QA audit): control, sheet, cell, unit label cell in the template, template unit.
const AUDITED = [
  ['LC-ESF-S04-O12', 'Accumulator', 'O12', 'P12', 'V'], ['LC-ESF-S04-O13', 'Accumulator', 'O13', 'P13', 'V'],
  ['LC-ESF-S04-O24', 'Accumulator', 'O24', 'P24', 'mm'], ['LC-ESF-S05-D14', 'PrechargeDischarge', 'D14', 'E14', '%'],
  ['LC-ESF-S07-D5', 'Shutdown Circuit', 'D5', 'E5', 'kΩ'], ['LC-ESF-S07-K6', 'Shutdown Circuit', 'K6', 'L6', 'A'],
  ['LC-ESF-S09-D6', 'Other', 'D6', 'E6', 'V'],
  ...['S06', 'S07'].flatMap(s => ['E', 'F', 'G'].map(c => [`LC-ASES-${s}-${c}14`, `EV5.5.1&2 EV4.4 ACPS TSPS ${s === 'S06' ? 'sidex' : 'rearx'}`, `${c}14`, null, 'count'])),
];
const blank = {};
const blankBook = async kind => blank[kind] ??= (await buildOfficialWorkbook({ kind, snapshots: [], generatedAt: '2026-11-22T00:00:00Z' })).bytes;

test('template evidence: every audited cell is read by a numeric check and has the recorded unit', async () => {
  assert.equal(AUDITED.length, 13);
  for (const [, sheet, ref, unitCell, unit] of AUDITED) {
    const kind = sheet.startsWith('EV5') ? 'ases' : 'esf', cells = book(await blankBook(kind), kind).sheet(sheet);
    if (unitCell) assert.equal(cells[unitCell]?.value?.normalize('NFC'), unit.normalize('NFC'), `${sheet}!${unitCell}`); // template uses the Ohm sign U+2126
    const reading = Object.entries(cells).filter(([, c]) => c.formula && new RegExp(`(?<![A-Z$])${ref}(?!\\d)\\s*(?:[<>]=?|=\\s*\\d)`).test(c.formula));
    assert.ok(reading.length, `${sheet}!${ref} is compared numerically by a template formula`);
  }
});

test('QA-01 all 13 audited numeric answers are written as real Excel numbers', async () => {
  for (const [id, sheet, ref] of AUDITED) {
    const w = await one(id, '12');
    const kind = sheet.startsWith('EV5') ? 'ases' : 'esf', c = book(w.bytes, kind).sheet(sheet)[ref];
    assert.equal(status(w, id), 'written', id);
    assert.equal(c.xmlType, 'n', `${sheet}!${ref} must be numeric, got ${c.xmlType}`);
    assert.equal(c.value, 12);
    assert.equal(w.report.writtenCells[0].type, 'number');
  }
});

test('QA-01 precharge ratio check (D14 < 90 -> WARNING) gives the right answer below, at and above the threshold', async () => {
  const cases = [['80', 'WARNING'], ['89.99', 'WARNING'], ['90', 'OK'], ['90.01', 'OK'], ['95%', 'OK'], ['85 %', 'WARNING']];
  for (const [value, expected] of cases) {
    const w = await exportAnswers('esf', { PRECHARGE: { 'LC-ESF-S05-D11': 'Ratio', 'LC-ESF-S05-D14': value } });
    assert.equal(check(w.bytes, 'esf', 'PrechargeDischarge', 'F14'), expected, `ratio ${value}`);
  }
});

test('QA-01 temperature sensor distance check (O24 < 10 mm -> OK) is not a false WARNING', async () => {
  const cases = [['5', 'OK'], ['9.99', 'OK'], ['10', 'WARNING'], ['10.5', 'WARNING'], ['0', 'OK']];
  for (const [value, expected] of cases) {
    const w = await exportAnswers('esf', { BMS: { 'LC-ESF-S04-O23': 'On bus bar', 'LC-ESF-S04-O24': value } });
    assert.equal(check(w.bytes, 'esf', 'Accumulator', 'Q24'), expected, `distance ${value} mm`);
  }
});

test('QA-01 ASES tube count: "0 tubes" really means N/A in the template check', async () => {
  const zero = await one('LC-ASES-S06-E14', '0');
  assert.equal(check(zero.bytes, 'ases', 'EV5.5.1&2 EV4.4 ACPS TSPS sidex', 'E18'), 'N/A');
  const three = await one('LC-ASES-S06-E14', '3');
  assert.notEqual(check(three.bytes, 'ases', 'EV5.5.1&2 EV4.4 ACPS TSPS sidex', 'E18'), 'N/A');
});

test('QA-01 invalid, negative, out-of-range and non-integer inputs never become a value', async () => {
  const bad = [['LC-ESF-S04-O24', '-5'], ['LC-ESF-S04-O24', '5 mm'], ['LC-ESF-S04-O24', '3,5'], ['LC-ESF-S04-O24', 'about 5'], ['LC-ESF-S04-O24', '=5'],
    ['LC-ESF-S05-D14', '120'], ['LC-ESF-S05-D14', '-1'], ['LC-ESF-S05-D14', '80 percent'], ['LC-ESF-S04-O12', '1000V DC'], ['LC-ESF-S04-O12', '1,000'],
    ['LC-ASES-S06-E14', '2.5'], ['LC-ASES-S06-E14', '-1'], ['LC-ESF-S07-D5', '500 kΩ']];
  for (const [id, value] of bad) {
    const w = await one(id, value);
    assert.equal(status(w, id), 'invalid_value', `${id} "${value}"`);
    assert.equal(w.report.writtenCells.length, 0, `${id} "${value}" wrote nothing`);
  }
  // Decimal, exponent and unicode minus forms that are unambiguous numbers.
  for (const [id, value, expected] of [['LC-ESF-S04-O12', '1e3', 1000], ['LC-ESF-S04-O24', ' 7.50 ', 7.5], ['LC-ESF-S07-K6', '+16', 16]]) {
    const w = await one(id, value);
    assert.equal(status(w, id), 'written', `${id} "${value}"`);
    assert.equal(w.report.writtenCells[0].value, String(expected));
  }
});

test('QA-01 identifiers and free text stay strings (no blanket number conversion)', async () => {
  const C = 'LC-ESF-Datasheets-conductors-';
  const w = await exportAnswers('esf', { INTEGRATION: { 'CARD-FG-ESF-DS-02': [{ _id: 'r1', [C + 'B']: 'Leoni', [C + 'C']: '007', [C + 'D']: '35' }] }, ACCUMULATOR: { 'LC-ESF-S02-D4': '18650' } });
  const ds = book(w.bytes, 'esf').sheet('Datasheets');
  assert.equal(ds.C19.xmlType, 'inlineStr'); assert.equal(ds.C19.value, '007');      // part number
  assert.equal(ds.D4.xmlType, 'inlineStr'); assert.equal(ds.D4.value, '18650');      // cell model
  assert.equal(ds.D19.xmlType, 'n'); assert.equal(ds.D19.value, 35);                 // cross-section mm²
});

test('QA-02 charger power: the template unit is kW, the app asks for W, and export converts exactly once', async () => {
  const cells = book(await blankBook('esf'), 'esf').sheet('Charging');
  assert.equal(cells.E10.value, 'kW');
  const field = fieldsOf('CHARGER').find(f => f.id === 'LC-ESF-S06-D10');
  assert.equal(field.unit, 'W'); assert.match(field.prompt, /ביחידות W/);
  for (const [watts, kw] of [['3000', 3], ['6600', 6.6], ['1500.5', 1.5005], ['0', 0], ['250', 0.25]]) {
    const w = await one('LC-ESF-S06-D10', watts);
    const c = book(w.bytes, 'esf').sheet('Charging').D10;
    assert.equal(c.xmlType, 'n'); assert.equal(c.value, kw, `${watts} W -> ${kw} kW`);
    const write = w.report.writtenCells[0];
    assert.deepEqual([write.sourceValue, write.value, write.unit], [watts, String(kw), 'kW']);
  }
  for (const value of ['3 kW', '3000 W', '-100', '3,000']) assert.equal(status(await one('LC-ESF-S06-D10', value), 'LC-ESF-S06-D10'), 'invalid_value', value);
  // Exactly once: the stored answer is untouched and a second export gives the same cell.
  const answers = { 'LC-ESF-S06-D10': '3000' }, before = JSON.stringify(answers);
  const a = await exportAnswers('esf', { CHARGER: answers }), b = await exportAnswers('esf', { CHARGER: answers });
  assert.equal(JSON.stringify(answers), before);
  assert.equal(book(a.bytes, 'esf').sheet('Charging').D10.value, 3); assert.equal(book(b.bytes, 'esf').sheet('Charging').D10.value, 3);
});

test('QA-12 heatsink column accepts the template literal "None" and nothing else', async () => {
  const header = book(await blankBook('esf'), 'esf').sheet('Datasheets').H55?.value ?? '';
  assert.match(header, /Enter "None" if no heatsink/);
  const R = 'LC-ESF-Datasheets-resistors-';
  const row = (h, g = '50') => exportAnswers('esf', { INTEGRATION: { 'CARD-FG-ESF-DS-04': [{ _id: 'r', [R + 'B']: 'Vishay', [R + 'G']: g, [R + 'H']: h }] } });
  for (const value of ['None', 'none', ' NONE ']) {
    const c = book((await row(value)).bytes, 'esf').sheet('Datasheets').H56;
    assert.deepEqual([c.xmlType, c.value], ['inlineStr', 'None'], value);
  }
  const numeric = book((await row('2.5')).bytes, 'esf').sheet('Datasheets').H56;
  assert.deepEqual([numeric.xmlType, numeric.value], ['n', 2.5]);
  assert.equal(status(await row('אין'), R + 'H'), 'invalid_value');
  assert.equal(status(await row('2.5', 'None'), R + 'G'), 'invalid_value'); // only the heatsink column allows the word
});

test('unit sweep: every numeric answer cell uses the unit the template labels next to it', async () => {
  const norm = u => String(u).toLowerCase().replace(/²/g, '2').replace(/°/g, '').replace(/^sec$/, 's').replace(/\s/g, '');
  const UNITS = /^(?:v|a|ah|w|kw|c|s|mm|mm2|cm|kω|ω|%|n|kn|mpa|g|kg|mj|v\/mm|c\/w|mf|count)$/;
  const mismatches = [];
  // The unit actually exported for charger power is observed, not assumed: 1000 W -> 1 means kW.
  const probe = await one('LC-ESF-S06-D10', '1000');
  const chargerUnit = book(probe.bytes, 'esf').sheet('Charging').D10.value === 1 ? 'kW' : coordinator.find(f => f.id === 'LC-ESF-S06-D10').unit;
  for (const kind of ['esf', 'ases']) {
    const b = book(await blankBook(kind), kind);
    for (const e of entries.filter(x => x.official.document.toLowerCase() === kind)) {
      const field = fieldsOf(e.systemId ?? 'COORDINATOR').find(f => f.id === e.fieldId), column = field?.columns?.find(c => c.id === e.columnId);
      const schema = { ...e.inputSchema, ...(column ?? field)?.sourceInputSchema };
      const audited = AUDITED.find(a => a[0] === e.id) || (e.id === 'LC-ESF-S06-D10' ? [e.id, 'Charging', 'D10', 'E10', 'kW'] : null);
      if (schema.type !== 'number_with_unit_and_source' && !audited) continue;
      const appUnit = e.id === 'LC-ESF-S06-D10' ? chargerUnit : audited ? audited[4] : (column ?? field)?.unit ?? schema.unit;
      const [, col, row] = /^([A-Z]+)(\d+)/.exec(e.official.ranges[0]); const cells = b.sheet(e.official.sheet);
      const toN = c => [...c].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0), toC = n => { let s = ''; while (n) { n--; s = String.fromCharCode(65 + n % 26) + s; n = Math.floor(n / 26); } return s; };
      const found = new Set();
      for (let k = 1; k <= 2; k++) { const v = cells[toC(toN(col) + k) + row]?.value; if (typeof v === 'string' && UNITS.test(norm(v))) found.add(norm(v)); }
      for (let r = Number(row) - 1; r >= Math.max(1, Number(row) - 25); r--) { const v = cells[col + r]?.value; if (typeof v === 'string' && v.trim()) { for (const m of v.matchAll(/\[([^\]]+)\]|\(([^)]+)\)|,\s*([A-Za-z%²]+)\s*$/g)) { const u = norm(m[1] ?? m[2] ?? m[3]); if (UNITS.test(u)) found.add(u); } break; } }
      if (found.size && !found.has(norm(appUnit))) mismatches.push(`${e.id} ${e.official.sheet}!${e.official.ranges[0]} app=${appUnit} template=${[...found]}`);
    }
  }
  assert.deepEqual(mismatches, []);
});

test('SES keeps numeric-looking identifiers as text and writes canonical numbers as numbers', async () => {
  const field = fieldsOf('SES').find(f => f.officialTemplate?.sheet === 'Version History');
  const row = (id, cell, value) => ({ _id: id, [field.id + '-CELL']: cell, [field.id + '-VALUE']: value });
  const w = await exportAnswers('ses', { SES: { [field.id]: [row('a', 'A4', '007'), row('b', 'B4', '1.10'), row('c', 'A5', '12.5'), row('d', 'B5', '3')] } });
  const types = Object.fromEntries(w.report.writtenCells.map(c => [c.cell, [c.type, c.value]]));
  assert.deepEqual(types, { A4: ['text', '007'], B4: ['text', '1.10'], A5: ['number', '12.5'], B5: ['number', '3'] });
});

// ---------- translation defects: deferred to the translation-quality task by instruction ----------
test('QA-03 translation validator rejects a changed unit (mm² -> mm)', { todo: 'QA-03: deferred to translation-quality work (superscript units are not protected literals)' }, () => {
  assert.equal(validateLiterals('שטח החתך 35 mm²', 'cut area 35 mm').ok, false);
});
test('QA-04 translation validator rejects a translation that drops a sentence', { todo: 'QA-04: deferred to translation-quality work (no completeness check)' }, () => {
  assert.equal(validateLiterals('המכסה נסגר בברגים ננעלים. מערכת הקירור אינה משתמשת בנוזל מוליך.', 'The lid is closed with locking bolts.').ok, false);
});
