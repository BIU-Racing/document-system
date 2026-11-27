// Workbook tables shown as one editable grid. Display only: each cell stays its own field.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import Module, { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const built = esbuild.buildSync({ stdin: { contents: "export * from './lib/field-grids'; export { getFields, coverage } from './lib/catalog';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', target: 'node22', write: false, logLevel: 'silent' });
const file = path.resolve('lib/field-grids-test.cjs');
const mod = new Module(file, null); mod.filename = file; mod.paths = Module._nodeModulePaths(path.resolve('lib')); mod._compile(built.outputFiles[0].text, file);
const { GRID_DEFINITIONS, gridsFor, gridCellLabel, getFields, coverage } = mod.exports;

const grids = gridsFor('ACCUMULATOR');
const fields = new Map(getFields('ACCUMULATOR').map(field => [field.id, field]));
const cellOf = new Map(coverage.entries.filter(entry => entry.systemId === 'ACCUMULATOR' && entry.fieldId && !entry.columnId).map(entry => [entry.fieldId, `${entry.official.sheet}!${entry.official.ranges.join(',')}`]));

test('every defined cell resolves to an existing single-cell field of the system', () => {
  for (const [index, grid] of grids.entries()) {
    const defined = GRID_DEFINITIONS[index].rows.flatMap(row => row.cells.filter(Boolean)).length;
    assert.equal(grid.fieldIds.length, defined, `${grid.id}: unresolved cells`);
    for (const row of grid.rows) for (const cell of row.cells) {
      assert.ok(cell, `${grid.id}: empty cell`);
      assert.equal(cellOf.get(cell.fieldId), `${grid.sheet}!${cell.cell}`, `${grid.id}: ${cell.fieldId} is written to ${cell.cell}`);
    }
  }
  assert.equal(grids.reduce((sum, grid) => sum + grid.fieldIds.length, 0), 98);
});

test('a field is in at most one table, and a table stays within one chapter', () => {
  const all = grids.flatMap(grid => grid.fieldIds);
  assert.equal(new Set(all).size, all.length);
  for (const grid of grids) {
    const sections = new Set(grid.fieldIds.map(id => fields.get(id).section));
    assert.equal(sections.size, 1, grid.id);
  }
});

test('rows of the bending and tube tables share one question across columns', () => {
  for (const grid of grids.filter(item => item.id !== 'ases-pics-laminate')) {
    for (const row of grid.rows) {
      const labels = new Set(row.cells.map(cell => fields.get(cell.fieldId).label));
      assert.equal(labels.size, 1, `${grid.id}: ${row.label}`);
      assert.equal(row.label, [...labels][0]);
    }
  }
});

test('the laminate table puts U8 under outer layup, floor; X8 under inner layup', () => {
  const pics = grids.find(grid => grid.id === 'ases-pics-laminate');
  const at = cell => pics.rows.flatMap(row => row.cells).find(item => item.cell === cell).fieldId;
  assert.equal(gridCellLabel(pics, at('U8')), 'רצפה — שכבות בצד החיצוני');
  assert.equal(gridCellLabel(pics, at('X8')), 'רצפה — שכבות בצד הפנימי');
  assert.match(fields.get(at('U8')).label, /בצד החיצוני — רצפה/);
  assert.match(fields.get(at('X8')).label, /בצד הפנימי — רצפה/);
  assert.match(fields.get(at('V11')).label, /חומר הליבה — מכסה/);
});
