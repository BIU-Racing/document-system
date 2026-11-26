// Runs the mapping certificate (synthetic data, real exporter) and requires a clean result:
// every automatically written field holds its own value in its own mapped cell, and no
// other cell of the official workbooks changed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

test('mapping certificate: every written field lands in its mapped cell and nothing else changes', () => {
  execFileSync(process.execPath, ['scripts/mapping-certificate.mjs'], { stdio: 'pipe' });
  const summary = JSON.parse(fs.readFileSync('outputs/mapping-certificate/summary.json', 'utf8'));
  for (const doc of ['ESF', 'ASES']) {
    const result = summary.documents[doc];
    assert.equal(result.failed, 0, `${doc}: fields written to a wrong cell or with a wrong value`);
    assert.equal(result.unexpectedChangedCells, 0, `${doc}: cells changed that no mapping explains`);
    assert.ok(result.written > 0, `${doc}: nothing was written`);
    assert.equal(result.written + result.notWritten, result.mapped, `${doc}: every mapping entry is classified`);
  }
  for (const file of ['ESF-marked.xlsx', 'ASES-marked.xlsm', 'mapping-review.xlsx']) assert.ok(fs.existsSync('outputs/mapping-certificate/' + file), file);
});
