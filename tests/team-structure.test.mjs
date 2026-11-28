// Team structure: ESF tabs belong to the owning team, form questions come first, and the general
// questionnaire is one short optional chapter. Field IDs are unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module, { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const built = esbuild.buildSync({ stdin: { contents: "export { systems, coordinatorSystem, coverage, RETIRED_SECTION } from './lib/catalog'; export { RULE_FIELDS_SECTION } from './lib/rule-fields'; export { ESF_TAB_OWNER, coordinatorFieldOwner } from './lib/field-routing';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', target: 'node22', write: false, logLevel: 'silent' });
const file = path.resolve('lib/team-structure-test.cjs');
const mod = new Module(file, null); mod.filename = file; mod.paths = Module._nodeModulePaths(path.resolve('lib')); mod._compile(built.outputFiles[0].text, file);
const { systems, coordinatorSystem, coverage, RETIRED_SECTION, RULE_FIELDS_SECTION, ESF_TAB_OWNER, coordinatorFieldOwner } = mod.exports;
const raw = JSON.parse(fs.readFileSync('data/coverage.normalized.json', 'utf8')).entries;
const rawSystems = JSON.parse(fs.readFileSync('data/systems.normalized.json', 'utf8'));
const rawCoordinator = JSON.parse(fs.readFileSync('data/coordinator.normalized.json', 'utf8'));
const isForm = field => !!field.officialRefs?.length || !!field.officialTemplate;

test('every ESF coordinator field moves by its tab; only Overview and Datasheets stay with the coordinator', () => {
  for (const entry of raw.filter(e => e.official.document === 'ESF' && e.systemId === null && !e.privateContact && e.fieldId)) {
    const owner = coordinatorFieldOwner(entry.fieldId), tabOwner = ESF_TAB_OWNER[entry.official.sheet];
    if (!tabOwner) { assert.equal(owner, 'COORDINATOR', `${entry.fieldId} (${entry.official.sheet})`); continue; }
    if (entry.official.sheet === 'PrechargeDischarge') assert.ok(['PRECHARGE', 'DISCHARGE', 'INTEGRATION'].includes(owner), entry.fieldId);
    else assert.equal(owner, tabOwner, `${entry.fieldId} (${entry.official.sheet})`);
  }
  assert.equal(coordinatorFieldOwner('LC-ESF-S05-D14'), 'PRECHARGE');
  assert.equal(coordinatorFieldOwner('LC-ESF-S05-J13'), 'DISCHARGE');
  assert.equal(coordinatorFieldOwner('LC-ESF-S05-P3'), 'INTEGRATION');
  assert.equal(coordinatorFieldOwner('LC-ESF-S02-D11'), 'COORDINATOR');
});

test('a moved field lives in exactly one system, and its coverage entries point there', () => {
  // General template IDs (EP-...) repeat in every system by design; official ESF fields are unique.
  const owners = new Map();
  for (const system of [...systems, coordinatorSystem]) for (const field of system.fields.filter(f => /^(LC-ESF|CARD-FG-ESF)/.test(f.id))) {
    assert.ok(!owners.has(field.id), `${field.id} appears in ${owners.get(field.id)} and ${system.id}`);
    owners.set(field.id, system.id);
  }
  for (const entry of coverage.entries.filter(e => e.fieldId && e.official.document === 'ESF' && !e.privateContact)) {
    if (owners.has(entry.fieldId)) assert.equal(entry.systemId ?? 'COORDINATOR', owners.get(entry.fieldId), entry.fieldId);
  }
  const count = list => list.length;
  assert.equal(count([...systems, coordinatorSystem].flatMap(s => s.fields).filter(f => /^(LC-ESF|CARD-FG-ESF)/.test(f.id))), count([...rawSystems.flatMap(s => s.fields), ...rawCoordinator].filter(f => /^(LC-ESF|CARD-FG-ESF)/.test(f.id))), 'no ESF field lost or duplicated');
});

test('each team sees two kinds of chapters: its form questions first, then "התקנון שלנו"', () => {
  for (const system of systems.filter(s => s.id !== 'SES')) {
    const shown = system.fields.filter(field => !field.retired);
    const kinds = shown.map(field => isForm(field) ? 'form' : 'rules');
    const firstRules = kinds.indexOf('rules');
    if (firstRules >= 0) assert.ok(kinds.slice(firstRules).every(kind => kind === 'rules'), `${system.id}: form questions first`);
    assert.ok(shown.filter(field => !isForm(field)).every(field => field.section === RULE_FIELDS_SECTION), `${system.id}: one rules chapter`);
  }
  assert.equal(systems.find(s => s.id === 'PRECHARGE').fields[0].id.startsWith('LC-ESF-S05-'), true);
  assert.equal(systems.find(s => s.id === 'CHARGER').fields.filter(isForm).length, 26);
});

test('the 35-question general template is retired: hidden, optional, never a form question', () => {
  for (const system of systems.filter(s => s.id !== 'SES')) {
    const retired = system.fields.filter(field => field.retired);
    assert.ok(retired.length >= 30, `${system.id}: ${retired.length}`);
    assert.ok(retired.every(field => field.section === RETIRED_SECTION && field.required === false && !isForm(field) && field.id.startsWith('EP-C')), system.id);
  }
});

test('every question in "התקנון שלנו" has its own title within its system', () => {
  for (const system of systems) {
    const labels = system.fields.filter(field => field.section === RULE_FIELDS_SECTION && !field.retired).map(field => field.label);
    const repeated = labels.filter((label, index) => labels.indexOf(label) !== index);
    assert.deepEqual(repeated, [], `${system.id}: ${repeated.join(', ')}`);
  }
});
