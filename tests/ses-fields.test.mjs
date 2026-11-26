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
const { sesFixedFields, sesFixedEntries, getFields, fieldVisible, computeProgress } = mod.exports;
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
  assert.equal(ids.size, legacy.length + sesFixedFields.length);
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
