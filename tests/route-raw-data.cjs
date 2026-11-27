// Applies the app's team ownership (lib/field-routing.ts) to raw registry JSON read by tests:
// ESF fields the source registry gave to the coordinator move to the owning team.
const path = require('node:path');
const Module = require('node:module');
const esbuild = require('esbuild');
const built = esbuild.buildSync({ entryPoints: ['lib/field-routing.ts'], bundle: true, platform: 'node', format: 'cjs', target: 'node22', write: false, logLevel: 'silent' });
const file = path.resolve('lib/field-routing-test.cjs');
const mod = new Module(file, null); mod.filename = file; mod.paths = Module._nodeModulePaths(path.resolve('lib')); mod._compile(built.outputFiles[0].text, file);
const { coordinatorFieldOwner } = mod.exports;

/** Mutates coverage entries, the coordinator list and the systems in place, like lib/catalog.ts. */
function routeRawData(entries, coordinatorFields, systems) {
  for (const entry of entries) {
    if (!entry.fieldId || entry.systemId !== null || entry.privateContact || entry.official.document !== 'ESF') continue;
    const owner = coordinatorFieldOwner(entry.fieldId);
    if (owner !== 'COORDINATOR') entry.systemId = owner;
  }
  for (const field of [...coordinatorFields]) {
    const owner = coordinatorFieldOwner(field.id);
    if (owner === 'COORDINATOR') continue;
    coordinatorFields.splice(coordinatorFields.indexOf(field), 1);
    systems.find(system => system.id === owner).fields.push(field);
  }
}
module.exports = { routeRawData, coordinatorFieldOwner };
