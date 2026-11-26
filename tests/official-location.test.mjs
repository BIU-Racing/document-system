// The "written to" hint in the editor must match what the exporter really does, for every
// mapping entry. The certificate run uses synthetic answers for all fields and the real exporter.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { destinationMode, fieldDestinations, entriesForField, formatRanges, rangeBounds, documentHref } from '../lib/official-location.ts';

const load = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const entries = load('data/coverage.normalized.json').entries;
const systems = load('data/systems.normalized.json');
const fieldsOf = new Map(systems.map(system => [system.id, system.fields]));
fieldsOf.set('COORDINATOR', load('data/coordinator.normalized.json'));
const fieldFor = entry => (fieldsOf.get(entry.systemId ?? 'COORDINATOR') ?? []).find(field => field.id === entry.fieldId);

test('the editor hint agrees with the exporter on every ESF and ASES entry', () => {
  execFileSync(process.execPath, ['scripts/mapping-certificate.mjs'], { stdio: 'pipe' });
  const results = new Map(load('outputs/mapping-certificate/results.json').map(row => [row.controlId, row]));
  const mismatches = [];
  for (const entry of entries) {
    const result = results.get(entry.id);
    assert.ok(result, 'missing certificate result for ' + entry.id);
    const automatic = destinationMode(entry, fieldFor(entry)) === 'auto';
    if (automatic !== (result.status === 'OK')) mismatches.push(`${entry.id}: hint ${automatic ? 'auto' : 'not written'}, export ${result.status}`);
  }
  assert.deepEqual(mismatches, []);
});

test('coordinator fields resolve their entries and get document links', () => {
  const entry = entries.find(item => item.systemId === null && item.fieldId && !item.privateContact);
  const own = entriesForField(entries, 'COORDINATOR', entry.fieldId);
  assert.ok(own.some(item => item.id === entry.id));
  const result = fieldDestinations('COORDINATOR', fieldFor(entry), entries);
  assert.equal(result.type, 'cells');
  assert.match(result.destinations[0].href, /^\/documents\/(esf|ases)\?sheet=/);
});

test('fields without any mapping say so, and SES fields point to a chosen cell', () => {
  const tsal = fieldsOf.get('TSAL').find(field => !entriesForField(entries, 'TSAL', field.id).length);
  assert.deepEqual(fieldDestinations('TSAL', tsal, entries), { type: 'none' });
  const ses = fieldsOf.get('SES').find(field => field.kind === 'table');
  const result = fieldDestinations('SES', ses, entries);
  assert.equal(result.type, 'chosen_cell');
  assert.equal(result.sheet, ses.officialTemplate.sheet);
  const sesFile = fieldsOf.get('SES').find(field => field.kind === 'file');
  const evidence = fieldDestinations('SES', sesFile, entries);
  assert.equal(evidence.type, 'cells');
  assert.equal(evidence.destinations[0].mode, 'evidence');
});

test('range helpers', () => {
  assert.equal(formatRanges(['A1', 'B1', 'C1', 'D1']), 'A1, B1, C1 ועוד 1');
  assert.deepEqual(rangeBounds('B2:C4'), { row: 2, column: 2, rowSpan: 3, colSpan: 2 });
  assert.equal(rangeBounds('Z0'), null);
  assert.equal(documentHref('esf', 'Overview', 'L11'), '/documents/esf?sheet=Overview&cell=L11');
});
