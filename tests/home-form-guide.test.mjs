// The home page guide (lib/overview-catalog.ts systemForms) matches the forms each system fills.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import Module, { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const built = esbuild.buildSync({ stdin: { contents: "export { systems, systemDocuments } from './lib/catalog'; export { systemForms, documentTeams } from './lib/overview-catalog';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', target: 'node22', write: false, logLevel: 'silent' });
const file = path.resolve('lib/home-form-guide-test.cjs');
const mod = new Module(file, null); mod.filename = file; mod.paths = Module._nodeModulePaths(path.resolve('lib')); mod._compile(built.outputFiles[0].text, file);
const { systems, systemDocuments, systemForms, documentTeams } = mod.exports;

test('every system and the coordinator: the home guide lists exactly the forms it fills', () => {
  for (const id of [...systems.map(system => system.id), 'COORDINATOR']) assert.deepEqual(systemForms[id], systemDocuments(id), id);
});

test('document cards list the teams that fill them', () => {
  assert.ok(documentTeams('ESF').includes('Precharge'));
  assert.ok(documentTeams('ASES').includes('ריכוז מסמכים'));
  assert.deepEqual(documentTeams('SES').length, 1);
});
