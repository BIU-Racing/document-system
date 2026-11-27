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
  const pc = (mode, ratio, delta) => ({ ACCUMULATOR: { 'RC-ACC-MAX-TS-VOLTAGE': a('600') }, PRECHARGE: { 'LC-ESF-S05-D11': a(mode), 'LC-ESF-S05-D14': a(ratio), 'LC-ESF-S05-D13': a(delta) } });
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
  const cells = (series, parallel, sensors) => ({ ACCUMULATOR: { 'LC-ESF-Accumulator-segments-C': a(series), 'LC-ESF-Accumulator-segments-B': a(parallel), 'LC-ESF-Accumulator-segments-D': a(sensors) }, COORDINATOR: { 'LC-ESF-S02-D6': a('4.2'), 'LC-ESF-S02-D5': a('5') } });
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
    assert.ok(defined && defined.required === false && defined.section === 'התקנון שלנו', field.id);
  }
  const fields = getFields('TSAL');
  assert.equal(computeProgress(fields, {}).total, fields.filter(field => field.required !== false).length, 'rule fields do not count as missing');
});

// ── Chassis and structure (lib/rule-checks-structural.ts) ────────────────────────────────────────
const ses = (sheet, cell) => `SESX-${sheet.replace(/[^A-Za-z0-9]+/g, '').toUpperCase()}-${cell}`;
const sesStatus = (values, checkId) => {
  const answers = { SES: Object.fromEntries(Object.entries(values).map(([key, value]) => { const [sheet, cell] = key.split('!'); return [ses(sheet, cell), a(value)]; })) };
  return one(answers, checkId)?.status;
};

test('every check id is unique', () => {
  const ids = ruleChecks.map(check => check.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('T 3.2.1 tubes: wall, area and inertia per class; non-steel and composite-only are not violations', () => {
  const id = `RC-TUBE-${ses('T3.9 Main Hoop Tubing', 'D14').replace('SESX-', '')}`;
  assert.equal(sesStatus({ 'T3.9 Main Hoop Tubing!D13': '25.4', 'T3.9 Main Hoop Tubing!D14': '2.4' }, id), 'ok');
  assert.equal(sesStatus({ 'T3.9 Main Hoop Tubing!D13': '25', 'T3.9 Main Hoop Tubing!D14': '1.75' }, id), 'violation');
  const sis = `RC-TUBE-${ses('T3.15 T3.6 SIS', 'F16').replace('SESX-', '')}`;
  assert.equal(sesStatus({ 'T3.15 T3.6 SIS!F15': '25.4', 'T3.15 T3.6 SIS!F16': '1.6' }, sis), 'ok', '1.6 mm side impact tube meets 1.2/119/8509');
  assert.equal(sesStatus({ 'T3.15 T3.6 SIS!F15': '25.4', 'T3.15 T3.6 SIS!F16': '1.6', 'T3.15 T3.6 SIS!F2': 'Composite only' }, sis), 'pending');
  const fh = `RC-TUBE-${ses('T3.10 Front Hoop Tubing', 'D14').replace('SESX-', '')}`;
  assert.equal(sesStatus({ 'T3.10 Front Hoop Tubing!D13': '30', 'T3.10 Front Hoop Tubing!D14': '3', 'T3.10 Front Hoop Tubing!D4': 'Aluminium 1' }, fh), 'notice');
  assert.equal(sesStatus({ 'T3.10 Front Hoop Tubing!D13': '25', 'T3.10 Front Hoop Tubing!D14': '2', 'T3.10 Front Hoop Tubing!D5': 'Square' }, fh), 'ok', 'square 25×2: 184 mm², 15541 mm⁴');
  const acps = one({ ACCUMULATOR: { 'LC-ASES-S06-E15': a('25.4'), 'LC-ASES-S06-E16': a('1.0') } }, 'RC-TUBE-S06-E16');
  assert.equal(acps.status, 'violation');
  assert.match(acps.message, /⁦[^⁩]*mm⁴⁩|mm⁴/);
});

test('T 3.5.4 skins, T 3.6.7 span and T 3.16 bolts', () => {
  const skin = `RC-SKIN-${ses('T3.15 T3.6 SIS', 'I21').replace('SESX-', '')}`;
  assert.equal(sesStatus({ 'T3.15 T3.6 SIS!I20': '0.5', 'T3.15 T3.6 SIS!I21': '2' }, skin), 'violation');
  assert.equal(sesStatus({ 'T3.15 T3.6 SIS!I20': '1', 'T3.15 T3.6 SIS!I21': '3' }, skin), 'ok', '1 mm is enough even when 40% would be more');
  assert.equal(one({ ACCUMULATOR: { 'LC-ASES-S09-C53': a('350') } }, 'RC-SPAN-S09-C53').status, 'violation');
  const plates = 'T3.16.6&3.17.5 Prim.Struc.Att.';
  const bolts = `RC-PLATEBOLTS-${ses(plates, 'L30').replace('SESX-', '')}`;
  assert.equal(sesStatus({ [`${plates}!L26`]: '1200', [`${plates}!L30`]: '5' }, bolts), 'violation', '1200 mm needs 6 bolts');
  assert.equal(sesStatus({ [`${plates}!L26`]: '1200', [`${plates}!L30`]: '6' }, bolts), 'ok');
  assert.equal(sesStatus({ [`${plates}!L26`]: '1200', [`${plates}!L30`]: '1', [`${plates}!F4`]: 'No' }, bolts), 'pending');
  const mh = 'T3.16 MH & MH Bing Attachments';
  const count = `RC-BOLTS-${ses(mh, 'C11').replace('SESX-', '')}`;
  assert.equal(sesStatus({ [`${mh}!C11`]: '1', [`${mh}!C10`]: '10' }, count), 'notice');
  assert.equal(sesStatus({ [`${mh}!C11`]: '1', [`${mh}!C10`]: '8' }, count), 'violation');
  const fh = 'T3.16 FH & FH Bing Attachments', bracket = `RC-BRACKET-${ses(fh, 'C15').replace('SESX-', '')}`;
  assert.equal(sesStatus({ [`${fh}!C15`]: '2.5' }, bracket), 'ok');
  assert.equal(sesStatus({ [`${fh}!C15`]: '2.5', [`${fh}!C4`]: 'Alu.' }, bracket), 'violation', 'aluminium hoop needs 3 mm');
});

test('steel chemistry and strength, harness loads, firewall, IA and cell pressure', () => {
  const metal = 'Metal Datasheets', carbon = `RC-STEEL-${ses(metal, 'A13').replace('SESX-', '')}`;
  assert.equal(sesStatus({ [`${metal}!A13`]: '0.35' }, carbon), 'violation');
  assert.equal(sesStatus({ [`${metal}!A13`]: '0.35', [`${metal}!I9`]: 'No' }, carbon), 'notice');
  assert.equal(sesStatus({ [`${metal}!A13`]: '0.35', [`${metal}!I7`]: 'Aluminium' }, carbon), 'pending');
  assert.equal(sesStatus({ [`${metal}!I14`]: '350' }, `RC-STRENGTH-${ses(metal, 'I14').replace('SESX-', '')}`), 'violation', 'yield above 305 MPa may not be used');
  const harness = 'T4.5 Harness Attachments';
  assert.equal(sesStatus({ [`${harness}!D40`]: '9000' }, 'RC-HARNESS-D40'), 'pending', 'no physical test required');
  assert.equal(sesStatus({ [`${harness}!D40`]: '9000', [`${harness}!Q34`]: 'YES' }, 'RC-HARNESS-D40'), 'violation');
  const fire = 'T1.2.1 T4.6 T4.8 Firewall';
  assert.equal(sesStatus({ [`${fire}!D31`]: '0.4' }, 'RC-FIREWALL-AL'), 'violation');
  assert.equal(sesStatus({ [`${fire}!D23`]: '1.5', [`${fire}!D22`]: '3' }, 'RC-FIRE-D23'), 'violation');
  assert.equal(sesStatus({ 'T3.17.3 IA AI Plate!D4': '360' }, 'RC-IA-GROUND'), 'violation');
  assert.equal(one({ ACCUMULATOR: { 'LC-ASES-S15-M22': a('2000'), 'LC-ASES-S15-M16': a('100'), 'LC-ASES-S15-M17': a('50') } }, 'RC-CELL-PRESSURE').status, 'ok', '2000 N / (0.8 × 5000 mm²) = 0.5 MPa');
  assert.equal(one({ ACCUMULATOR: { 'LC-ASES-S15-M22': a('5000'), 'LC-ASES-S15-M16': a('100'), 'LC-ASES-S15-M17': a('50') } }, 'RC-CELL-PRESSURE').status, 'violation');
});

test('EV 4.5.3 conductor temperature rating per row', () => {
  const rows = [{ _id: 'a', 'LC-ESF-Datasheets-conductors-G': '125' }, { _id: 'b', 'LC-ESF-Datasheets-conductors-G': '80' }, { _id: 'c', 'LC-ESF-Datasheets-conductors-G': '70', 'LC-ESF-Datasheets-conductors-J': 'LV harness' }];
  assert.deepEqual(result({ COORDINATOR: { 'CARD-FG-ESF-DS-02': a(rows) } }, 'RC-26').map(item => item.status), ['ok', 'violation', 'notice']);
});

test('SES fields get rule notes in the SES editor', () => {
  assert.deepEqual(rulesFor('SES', ses('T3.9 Main Hoop Tubing', 'D14')).map(item => item.rule), ['T 3.2.1']);
  assert.ok(ruleChecks.filter(check => check.target.systemId === 'SES').length > 100);
});

test('results carry a compact table: entered against required', () => {
  const id = `RC-TUBE-${ses('T3.9 Main Hoop Tubing', 'D14').replace('SESX-', '')}`;
  const tube = one({ SES: { [ses('T3.9 Main Hoop Tubing', 'D13')]: a('25'), [ses('T3.9 Main Hoop Tubing', 'D14')]: a('1.75') } }, id);
  assert.deepEqual(tube.table.map(line => [line.value, line.required, line.ok]), [['1.75 mm', '≥ 2 mm', false], ['128 mm²', '≥ 173 mm²', false], ['8686 mm⁴', '≥ 11320 mm⁴', false]]);
  assert.deepEqual(one({ TSAL: { 'RC-TSAL-FREQUENCY': a('4') } }, 'RC-23').table.map(line => [line.value, line.required, line.ok]), [['4 Hz', '2–5 Hz', true]]);
  assert.equal(one({ IMD: {} }, 'RC-03').table, undefined, 'pending results have no table');
});

test('electrical limits from the coverage map: max, min, strict and range', () => {
  const at = (systemId, fieldId, value) => ({ [systemId]: { [fieldId]: a(value) } });
  const status = (answers, id) => one(answers, id).status;
  assert.equal(status(at('BSPD', 'RC-BSPD-DELAY', '500'), 'RC-27'), 'ok');
  assert.equal(status(at('BSPD', 'RC-BSPD-DELAY', '501'), 'RC-27'), 'violation');
  assert.equal(status(at('BSPD', 'RC-BSPD-PRESSURE', '30 bar'), 'RC-28'), 'ok');
  assert.equal(status(at('DRIVE', 'RC-DRIVE-RELEASED-TORQUE', '-5'), 'RC-30'), 'ok');
  assert.equal(status(at('DRIVE', 'RC-DRIVE-RELEASED-TORQUE', '2'), 'RC-30'), 'violation');
  assert.equal(status(at('INTEGRATION', 'RC-INT-GROUND-RESISTANCE', '100'), 'RC-35'), 'violation', 'strictly below 100 mΩ');
  assert.equal(status(at('INTEGRATION', 'RC-INT-GROUND-RESISTANCE', '99'), 'RC-35'), 'ok');
  assert.equal(status(at('INTEGRATION', 'RC-INT-FUSE-TEMP-MIN', '-40'), 'RC-37'), 'ok');
  assert.equal(status(at('INTEGRATION', 'RC-INT-FUSE-TEMP-MAX', '70'), 'RC-38'), 'violation');
  assert.equal(status(at('HVD', 'RC-HVD-HEIGHT', '350'), 'RC-44'), 'violation', 'must be above 350 mm');
  assert.equal(status(at('HVD', 'RC-HVD-HEIGHT', '351'), 'RC-44'), 'ok');
  assert.equal(status(at('RTD', 'RC-RTD-SOUND-LEVEL', '79'), 'RC-47'), 'violation');
  assert.equal(status(at('RTD', 'RC-RTD-SOUND-LEVEL', '85'), 'RC-47'), 'ok');
  assert.equal(status(at('SDC', 'RC-SDC-INERTIA-G', '10'), 'RC-56'), 'ok');
  assert.equal(status(at('BMS', 'RC-BMS-TRIP-TEMP', '1.5'), 'RC-50'), 'violation');
  assert.equal(status(at('DASHBOARD', 'RC-DASH-LIGHT-AREA', '15 cm²'), 'RC-57'), 'ok');
  assert.equal(one(at('BSPD', 'RC-BSPD-DELAY', '600'), 'RC-27').table[0].required, '≤ 500 ms');
  assert.equal(one(at('HVD', 'RC-HVD-HEIGHT', '300'), 'RC-44').table[0].required, '> 350 mm');
});

test('spacing below 20 mm is a notice (a barrier is allowed); TSAL height; TSMP resistor by TS voltage', () => {
  assert.equal(one({ INTEGRATION: { 'RC-INT-TS-LV-SPACING': a('12') } }, 'RC-39').status, 'notice');
  assert.equal(one({ INTEGRATION: { 'RC-INT-TS-LV-SPACING': a('25') } }, 'RC-39').status, 'ok');
  assert.equal(one({ TSAL: { 'RC-TSAL-BELOW-HOOP': a('0') } }, 'RC-46').status, 'violation');
  assert.equal(one({ TSAL: { 'RC-TSAL-BELOW-HOOP': a('40') } }, 'RC-46').status, 'ok');
  assert.equal(one({ TSAL: { 'RC-TSAL-BELOW-HOOP': a('80') } }, 'RC-46').status, 'violation');
  const tsmp = (kOhm, volts) => one({ INTEGRATION: { 'RC-INT-TSMP-RESISTOR': a(kOhm) }, ...(volts ? { ACCUMULATOR: { 'RC-ACC-MAX-TS-VOLTAGE': a(volts) } } : {}) }, 'RC-42');
  assert.equal(tsmp('10').status, 'pending', 'needs the maximum TS voltage');
  assert.equal(tsmp('10', '400').status, 'ok');
  assert.equal(tsmp('5', '400').status, 'violation');
  assert.equal(tsmp('15', '400').status, 'notice');
  assert.equal(tsmp('5', '150').status, 'ok');
  assert.equal(tsmp('15', '588').status, 'ok');
});

test('every new electrical rule field has exactly its check and sits in the rule chapter', () => {
  const ids = ruleFields.filter(field => /^RC-(BSPD|DRIVE-(APPS|RELEASED)|INT|HVC|HVD|TSAL-BELOW|RTD-SOUND-LEVEL|BMS|TSMS|LVMS|LVB|SDC-INERTIA|DASH|CHG)/.test(field.id));
  assert.equal(ids.length, 32);
  for (const field of ids) {
    assert.ok(ruleChecks.some(check => check.target.systemId === field.systemId && check.target.fieldId === field.id && check.rule === field.rule), field.id);
    assert.ok(rulesFor(field.systemId, field.id).length >= 1, field.id);
  }
});
