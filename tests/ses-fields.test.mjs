// Fixed SES fields: registry matches the official template, every field has a Hebrew label and a
// unique cell, and visibility conditions point at real construction-type fields.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import Module, { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const built = esbuild.buildSync({ stdin: { contents: "export * from './lib/ses-fields'; export { getFields } from './lib/catalog'; export { fieldVisible, computeProgress } from './lib/progress';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', target: 'node22', write: false, logLevel: 'silent' });
const file = path.resolve('lib/ses-fields-test.cjs');
const mod = new Module(file, null); mod.filename = file; mod.paths = Module._nodeModulePaths(path.resolve('lib')); mod._compile(built.outputFiles[0].text, file);
const { sesFixedFields, sesFixedEntries, getFields, fieldVisible, computeProgress, sesBlockControls } = mod.exports;
const curation = JSON.parse(fs.readFileSync('data/ses-field-curation.json', 'utf8'));

test('the fixed SES registry is generated from the current template', () => {
  execFileSync(process.execPath, ['scripts/generate-ses-fields.mjs', '--check'], { stdio: 'pipe' });
});

test('every fixed field has a unique id and cell, a Hebrew label and a Hebrew chapter', () => {
  assert.ok(sesFixedFields.length > 700);
  assert.equal(new Set(sesFixedFields.map(field => field.id)).size, sesFixedFields.length);
  assert.equal(new Set(sesFixedEntries.map(entry => entry.sheet + '!' + entry.cell)).size, sesFixedEntries.length);
  for (const entry of sesFixedEntries) {
    assert.ok(entry.label, `label for ${entry.sheet}!${entry.cell}`);
    assert.ok(curation.labels[entry.label], `Hebrew label for "${entry.label}"`);
    assert.ok(curation.sheets[entry.sheet], `Hebrew chapter for ${entry.sheet}`);
  }
  for (const field of sesFixedFields) if (field.kind === 'select') assert.ok(field.options?.length, `${field.id} has options`);
});

test('SES chapters keep every legacy field id and add the fixed fields', () => {
  const legacy = JSON.parse(fs.readFileSync('data/systems.normalized.json', 'utf8')).find(system => system.id === 'SES').fields.map(field => field.id);
  const ids = new Set(getFields('SES').map(field => field.id));
  for (const id of legacy) assert.ok(ids.has(id), 'legacy field kept: ' + id);
  assert.equal(ids.size, legacy.length + sesFixedFields.length + sesBlockControls.length);
  const optionalTables = getFields('SES').filter(field => field.kind === 'table' && field.required === false);
  assert.ok(optionalTables.length > 0 && optionalTables.every(field => /תאים נוספים/.test(field.label)));
});

test('construction type hides tube or composite inputs and they stop counting as missing', () => {
  const fields = getFields('SES').filter(field => field.officialTemplate?.sheet === 'T3.11.5 T3.6 MHoop Brace Spt' && field.officialTemplate.fixed);
  const controller = fields.find(field => field.sesFixed.englishLabel === 'Enter construction type');
  const core = fields.find(field => field.sesFixed.englishLabel === 'Thickness of core, mm');
  const tubes = fields.find(field => field.sesFixed.englishLabel === 'Number of tubes');
  const answers = value => ({ [controller.id]: { status: 'answered', value } });
  assert.equal(fieldVisible(core, answers('Tubing only')), false);
  assert.equal(fieldVisible(tubes, answers('Tubing only')), true);
  assert.equal(fieldVisible(tubes, answers('Composite only')), false);
  assert.equal(fieldVisible(core, {}), true, 'unanswered construction type shows everything');
  const totalTubing = computeProgress(fields, answers('Tubing only')).total, totalBoth = computeProgress(fields, answers('Tubes + composite')).total;
  assert.ok(totalTubing < totalBoth);
  for (const field of sesFixedFields) if (field.showWhen) assert.ok(sesFixedFields.some(other => other.id === field.showWhen.fieldId), field.id);
});

test('repeated blocks: only the base item counts until the count control asks for more', () => {
  const fields = getFields('SES'), metals = fields.filter(field => field.officialTemplate?.sheet === 'Metal Datasheets');
  const control = fields.find(field => field.id === 'SESX-COUNT-METALS');
  assert.ok(control && control.required === false && !control.officialTemplate, 'UI-only control, never written to the workbook');
  const second = metals.find(field => field.officialTemplate.cell === 'AZ13'), first = metals.find(field => field.officialTemplate.cell === 'A13');
  assert.equal(fieldVisible(first, {}), true);
  assert.equal(fieldVisible(second, {}), false, 'material 2 hidden by default');
  assert.equal(fieldVisible(second, { [control.id]: { status: 'answered', value: '2' } }), true);
  assert.equal(fieldVisible(second, { [second.id]: { status: 'answered', value: '0.2' } }), true, 'an answered field never hides');
  const total = answers => computeProgress(fields, answers).total;
  const opened = Object.fromEntries(sesBlockControls.map(item => [item.id, { status: 'answered', value: item.options.at(-1).value }]));
  assert.ok(total({}) < total(opened), 'hidden blocks are not counted as missing');
  assert.equal(total(opened), fields.filter(field => field.required !== false && fieldVisible(field, opened)).length);
  // Tube type 2 also respects the construction type.
  const sis = fields.find(field => field.officialTemplate?.sheet === 'T3.15 T3.6 SIS' && field.officialTemplate.cell === 'F16');
  const sisCount = fields.find(field => field.id === 'SESX-COUNT-TUBES-T315T36SIS');
  const construction = fields.find(field => field.officialTemplate?.sheet === 'T3.15 T3.6 SIS' && field.officialTemplate.cell === 'F2');
  assert.equal(fieldVisible(sis, { [sisCount.id]: { status: 'answered', value: '2' } }), true);
  assert.equal(fieldVisible(sis, { [sisCount.id]: { status: 'answered', value: '2' }, [construction.id]: { status: 'answered', value: 'Composite only' } }), false);
});

test('every SES tab has its 2027 rule sections, and each field carries them', () => {
  // Tabs without a rule: administration only (versions, clarifications, free notes).
  const adminOnly = new Set(['Version History', 'Rules Clarifications', 'Additional Info']);
  for (const sheet of Object.keys(curation.sheets)) {
    const refs = curation.sheetRules[sheet];
    assert.ok(Array.isArray(refs), `rule list for ${sheet}`);
    if (!adminOnly.has(sheet)) assert.ok(refs.length, `${sheet} has a 2027 rule`);
    for (const ref of refs) assert.match(ref.rule, /^(T|EV|A) \d+(\.\d+)*$/, `${sheet}: ${ref.rule}`);
  }
  for (const field of sesFixedFields) assert.deepEqual(field.ruleRefs, curation.sheetRules[field.officialTemplate.sheet].map(ref => ref.rule), field.id);
  // Tab names keep 2026 numbers; the chapter shows the 2027 number.
  assert.match(curation.sheets['T3.16.7 Prim.Struct.Att. Blind'], /T3\.16\.6/);
  assert.match(curation.sheets['T3.6.10 Shear Tests'], /T3\.6\.11/);
});

test('SES rule pages match the 2027 rulebook (when its index is available locally)', { skip: !fs.existsSync('/private/tmp/claude-501/rules2027.json') && 'rulebook index not present' }, () => {
  const rules = JSON.parse(fs.readFileSync('/private/tmp/claude-501/rules2027.json', 'utf8'));
  for (const [sheet, refs] of Object.entries(curation.sheetRules)) for (const { rule, page } of refs) {
    const pages = Object.keys(rules).filter(key => key === rule || key.startsWith(rule + '.')).map(key => rules[key].page);
    assert.ok(pages.length, `${sheet}: ${rule} exists`);
    assert.equal(Math.min(...pages), page, `${sheet}: ${rule} page`);
  }
});
