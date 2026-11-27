// ESF / ASES fill-in chapters follow the official Excel tabs. Display only: field IDs are unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module, { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const built = esbuild.buildSync({ stdin: { contents: "export * from './lib/sheet-chapters'; export { getFields, systems, coverage } from './lib/catalog';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', target: 'node22', write: false, logLevel: 'silent' });
const file = path.resolve('lib/sheet-chapters-test.cjs');
const mod = new Module(file, null); mod.filename = file; mod.paths = Module._nodeModulePaths(path.resolve('lib')); mod._compile(built.outputFiles[0].text, file);
const { SHEET_CHAPTERS, groupFieldsBySheet, getFields, systems, coverage } = mod.exports;
const templates = JSON.parse(fs.readFileSync('data/template-metadata.json', 'utf8'));
const rawSystems = JSON.parse(fs.readFileSync('data/systems.normalized.json', 'utf8'));
const rawCoordinator = JSON.parse(fs.readFileSync('data/coordinator.normalized.json', 'utf8'));

test('chapter tabs are the official workbook tabs, in workbook order', () => {
  for (const [document, key] of [['ESF', 'esf'], ['ASES', 'ases']]) {
    const official = templates[key].sheets.map(sheet => sheet.name);
    const ours = SHEET_CHAPTERS[document].map(([sheet]) => sheet);
    assert.deepEqual(ours.filter(sheet => !official.includes(sheet)), [], `${document}: unknown tab`);
    assert.deepEqual(ours, official.filter(sheet => ours.includes(sheet)), `${document}: tab order`);
    assert.equal(new Set(SHEET_CHAPTERS[document].map(([, title]) => title)).size, ours.length, `${document}: unique Hebrew titles`);
  }
});

test('every mapped ESF / ASES tab has a chapter', () => {
  const known = new Set(Object.entries(SHEET_CHAPTERS).flatMap(([document, list]) => list.map(([sheet]) => `${document}:${sheet}`)));
  const used = new Set(coverage.entries.filter(entry => entry.fieldId && ['ESF', 'ASES'].includes(entry.official.document)).map(entry => `${entry.official.document}:${entry.official.sheet}`));
  assert.deepEqual([...used].filter(sheet => !known.has(sheet)), []);
});

test('regrouping keeps every field and its ID; only order and chapter title change', () => {
  const ids = list => list.map(field => field.id).sort();
  for (const system of rawSystems.filter(item => item.id !== 'SES')) {
    const now = getFields(system.id).filter(field => !field.id.startsWith('RC-'));
    assert.deepEqual(ids(now), ids(system.fields), system.id);
  }
  assert.deepEqual(ids(getFields('COORDINATOR')), ids(rawCoordinator));
});

test('a tab chapter holds exactly the fields written to that tab, and shows the tab name', () => {
  const pics = getFields('ACCUMULATOR').filter(field => field.sheetTab === 'ASES › Accumulator Pics');
  assert.ok(pics.some(field => field.id === 'LC-ASES-S05-U8'));
  assert.ok(pics.every(field => field.section === 'תמונות המארז ושכבות הדפנות'));
  const where = new Map(coverage.entries.filter(entry => entry.systemId === 'ACCUMULATOR' && entry.fieldId).map(entry => [entry.fieldId, entry.official.sheet]));
  assert.ok(pics.every(field => where.get(field.id) === 'Accumulator Pics'));
  const sections = [...new Set(getFields('COORDINATOR').map(field => field.section))];
  assert.deepEqual(sections.slice(1, 4), ['סקירה ופרטי התיק', 'דפי יצרן ורכיבים', 'סכמות מערכת ההנעה'], 'ESF tabs in workbook order');
  assert.ok(sections.indexOf('דף שער ופרטי הקבוצה') > sections.indexOf('ממירים, מנועים ומד האנרגיה'), 'ASES tabs after ESF tabs');
  assert.ok(getFields('SES').filter(field => field.sheetTab).every(field => field.sheetTab.startsWith('SES › ')));
});

test('fields without a tab keep their chapter and come first', () => {
  const fields = [
    { id: 'b', section: 'כפיפה' }, { id: 'g1', section: 'כללי' }, { id: 'a', section: 'תמונות' }, { id: 'g2', section: 'כללי' },
  ];
  const at = { a: { document: 'ASES', sheet: 'Accumulator Pics' }, b: { document: 'ASES', sheet: 'EV5.5.5 Alt. Matl - 3pt Bending' } };
  groupFieldsBySheet(fields, id => at[id]);
  assert.deepEqual(fields.map(field => field.id), ['g1', 'g2', 'a', 'b']);
  assert.equal(fields[2].sheetTab, 'ASES › Accumulator Pics');
  assert.equal(fields[0].sheetTab, undefined);
  const sdcTabs = new Set(systems.find(system => system.id === 'SDC').fields.map(field => field.sheetTab).filter(Boolean));
  assert.deepEqual([...sdcTabs], ['ESF › Shutdown Circuit']);
});
