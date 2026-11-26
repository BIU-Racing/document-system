// Formula Student 2027 rule checks (lib/rule-checks.ts). Synthetic values only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module, { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const built = esbuild.buildSync({ stdin: { contents: "export * from './lib/rule-checks'; export { getFields } from './lib/catalog'; export { computeProgress } from './lib/progress'; export { ruleFields } from './lib/rule-fields';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', target: 'node22', write: false, logLevel: 'silent' });
const file = path.resolve('lib/rule-checks-test.cjs');
const mod = new Module(file, null); mod.filename = file; mod.paths = Module._nodeModulePaths(path.resolve('lib')); mod._compile(built.outputFiles[0].text, file);
const { evaluateRules, rulesFor, ruleInputs, ruleChecks, numberFrom, getFields, computeProgress, ruleFields } = mod.exports;

const a = value => ({ status: 'answered', value });
const result = (answers, checkId) => evaluateRules(answers).filter(item => item.checkId === checkId);
const one = (answers, checkId) => result(answers, checkId)[0];

test('every field a rule check reads exists in its system', () => {
  for (const ref of ruleInputs) assert.ok(getFields(ref.systemId).some(field => field.id === ref.fieldId), `${ref.systemId}:${ref.fieldId}`);
});

test('rule numbers and pages exist in the 2027 rulebook (when it is available locally)', { skip: !fs.existsSync('/private/tmp/claude-501/rules2027.json') && 'rulebook index not present' }, () => {
  const rules = JSON.parse(fs.readFileSync('/private/tmp/claude-501/rules2027.json', 'utf8'));
  for (const check of ruleChecks) for (const rule of check.rule.split(' / ')) {
    assert.ok(rules[rule], rule);
    assert.equal(rules[rule].page, check.page, `${check.id} ${rule} page`);
  }
});

test('numbers: plain values and a trailing unit are read, sentences are not', () => {
  assert.equal(numberFrom('588'), 588);
  assert.equal(numberFrom('95%'), 95);
  assert.equal(numberFrom('300 kΩ'), 300);
  assert.equal(numberFrom('עד 71g לתא'), undefined);
  assert.equal(numberFrom(''), undefined);
});

test('maximum TS voltage and the checks that depend on it', () => {
  const base = v => ({ ACCUMULATOR: { 'RC-ACC-MAX-TS-VOLTAGE': a(v) } });
  assert.equal(one(base('588'), 'RC-01').status, 'ok');
  assert.equal(one(base('620'), 'RC-01').status, 'violation');
  const imd = kOhm => ({ ...base('588'), IMD: { 'LC-ESF-S07-D5': a(kOhm) } });
  assert.equal(one(imd('300'), 'RC-03').status, 'ok');
  const low = one(imd('250'), 'RC-03');
  assert.equal(low.status, 'violation');
  assert.match(low.message, /294 kΩ/);
  assert.equal(one({ IMD: { 'LC-ESF-S07-D5': a('300') } }, 'RC-03').status, 'pending', 'needs max TS voltage');
  const bspd = amps => ({ ...base('500'), BSPD: { 'LC-ESF-S07-K6': a(amps) } });
  assert.equal(one(bspd('10'), 'RC-04').status, 'ok');
  assert.equal(one(bspd('11'), 'RC-04').status, 'violation');
});

test('pre-charge: 95% in 2027, checked in the field that matches the chosen end condition', () => {
  const pc = (mode, ratio, delta) => ({ ACCUMULATOR: { 'RC-ACC-MAX-TS-VOLTAGE': a('600') }, COORDINATOR: { 'LC-ESF-S05-D11': a(mode), 'LC-ESF-S05-D14': a(ratio), 'LC-ESF-S05-D13': a(delta) } });
  assert.equal(one(pc('Ratio', '95', ''), 'RC-05').status, 'ok');
  const old = one(pc('Ratio', '92%', ''), 'RC-05');
  assert.equal(old.status, 'violation');
  assert.match(old.message, /90%/, 'explains the outdated template check');
  assert.equal(one(pc('Delta Voltage', '92', '25'), 'RC-05').status, 'pending', 'other method: no warning');
  assert.equal(one(pc('Ratio', '95', '25'), 'RC-06').status, 'pending', 'the delta field is not a warning when the method is Ratio');
  assert.equal(one(pc('Delta Voltage', '', '25'), 'RC-06').status, 'ok');
  assert.equal(one(pc('Delta Voltage', '', '40'), 'RC-06').status, 'violation');
});

test('ASES sections: each row is checked for 12 kg, 120 V and 6 MJ', () => {
  const rows = [{ _id: 'r1', 'LC-FG-ASES-S20-OPEN-01-SECTION-E': '11.5', 'LC-FG-ASES-S20-OPEN-01-SECTION-G': '118', 'LC-FG-ASES-S20-OPEN-01-SECTION-I': '5.9' }, { _id: 'r2', 'LC-FG-ASES-S20-OPEN-01-SECTION-E': '13', 'LC-FG-ASES-S20-OPEN-01-SECTION-G': '125', 'LC-FG-ASES-S20-OPEN-01-SECTION-I': '6.2' }];
  const out = evaluateRules({ ACCUMULATOR: { 'CARD-FG-ASES-S20-OPEN-01': a(rows) } }).filter(item => /^RC-0[789]$/.test(item.checkId));
  assert.deepEqual(out.map(item => [item.rowId, item.status]), [['r1', 'ok'], ['r2', 'violation'], ['r1', 'ok'], ['r2', 'violation'], ['r1', 'ok'], ['r2', 'violation']]);
});

test('segment voltage/energy and temperature sensor share are computed from cell data', () => {
  const cells = (series, parallel, sensors) => ({ COORDINATOR: { 'LC-ESF-Accumulator-segments-C': a(series), 'LC-ESF-Accumulator-segments-B': a(parallel), 'LC-ESF-Accumulator-segments-D': a(sensors), 'LC-ESF-S02-D6': a('4.2'), 'LC-ESF-S02-D5': a('5') } });
  assert.equal(one(cells('24', '3', '22'), 'RC-10').status, 'ok', '24 × 4.2 V = 100.8 V; 24 × 3 × 4.2 V × 5 Ah = 5.4 MJ');
  assert.equal(one(cells('30', '3', '27'), 'RC-10').status, 'violation', '30 × 4.2 V = 126 V');
  assert.match(one(cells('24', '5', '36'), 'RC-10').message, /9\.072 MJ/, '24 × 5 × 4.2 V × 5 Ah = 9.07 MJ');
  assert.equal(one(cells('24', '3', '22'), 'RC-11').status, 'ok', '22 of 72 = 30.6%');
  assert.equal(one(cells('24', '3', '21'), 'RC-11').status, 'violation', '21 of 72 = 29.2%');
});

test('TSAC thickness depends on the chosen material', () => {
  const tsac = (materialName, floor) => ({ ACCUMULATOR: { 'LC-ASES-S05-E12': a(materialName), 'LC-ASES-S05-S14': a(floor) } });
  assert.equal(one(tsac('Steel', '1.5'), 'RC-18').status, 'ok');
  assert.equal(one(tsac('Aluminium', '1.5'), 'RC-18').status, 'violation');
  assert.equal(one(tsac('Other', '1.5'), 'RC-18').status, 'notice');
  assert.equal(one(tsac('', '1.5'), 'RC-18').status, 'pending');
});

test('component voltage ratings: lower rating is a notice that depends on TS or LV use', () => {
  const rows = [{ _id: 'a', 'LC-ESF-Datasheets-fuses-C': 'F-1', 'LC-ESF-Datasheets-fuses-D': '1000' }, { _id: 'b', 'LC-ESF-Datasheets-fuses-C': 'F-2', 'LC-ESF-Datasheets-fuses-D': '32', 'LC-ESF-Datasheets-fuses-J': 'LV PDU' }];
  const out = result({ ACCUMULATOR: { 'RC-ACC-MAX-TS-VOLTAGE': a('588') }, COORDINATOR: { 'CARD-FG-ESF-DS-03': a(rows) } }, 'RC-14-fuses');
  assert.deepEqual(out.map(item => item.status), ['ok', 'notice']);
});

test('new rule fields: ranges, minimums and maximums', () => {
  assert.equal(one({ TSAL: { 'RC-TSAL-FREQUENCY': a('4') } }, 'RC-23').status, 'ok');
  assert.equal(one({ TSAL: { 'RC-TSAL-FREQUENCY': a('6') } }, 'RC-23').status, 'violation');
  assert.equal(one({ SDC: { 'RC-SDC-BUTTON-SIDE': a('38') } }, 'RC-24-1').status, 'violation');
  assert.equal(one({ DISCHARGE: { 'RC-DISCHARGE-TIME': a('5') } }, 'RC-22').status, 'violation', 'must be less than 5 s');
  assert.equal(one({ LV_BATTERY: { 'RC-LV-MAX-VOLTAGE': a('29.4') } }, 'RC-17').status, 'ok');
});

test('unknown or not-applicable answers are not evaluated', () => {
  assert.equal(one({ ACCUMULATOR: { 'RC-ACC-MAX-TS-VOLTAGE': { status: 'unknown', value: '700' } } }, 'RC-01').status, 'pending');
});

test('rule notes are attached only to checked fields; new fields are optional and in their own chapter', () => {
  assert.deepEqual(rulesFor('IMD', 'LC-ESF-S07-D5').map(item => item.rule), ['EV 6.3.3']);
  assert.deepEqual(rulesFor('IMD', 'EP-C05-F02'), []);
  for (const field of ruleFields) {
    const defined = getFields(field.systemId).find(item => item.id === field.id);
    assert.ok(defined && defined.required === false && defined.section === 'נתונים לבדיקת תקנון 2027', field.id);
  }
  const fields = getFields('TSAL');
  assert.equal(computeProgress(fields, {}).total, fields.filter(field => field.required !== false).length, 'rule fields do not count as missing');
});
