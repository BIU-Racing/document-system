// Builds ESF workbooks with the FIXED exporter for below / at / above threshold values, so they can
// be recalculated in Microsoft Excel (scripts/qa/excel-read-thresholds.applescript).
// Fixture-only: the accumulator segment row (Accumulator!B12, C12, E12) is a manual_mapping table that
// the exporter never writes; the harness fills it so MaxTSVoltage / NominalTSVoltage are non-zero.
// Usage: node scripts/qa/excel-thresholds.mjs <repo> <outDir>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Module, { createRequire } from 'node:module';
const [repo, outDir] = process.argv.slice(2);
const require = createRequire(path.join(repo, 'package.json'));
const esbuild = require('esbuild');
const { unzipSync, zipSync, strFromU8, strToU8 } = require('fflate');
const b = esbuild.buildSync({ entryPoints: [path.join(repo, 'lib/official-workbooks.ts')], bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent', absWorkingDir: repo });
const m = new Module('x', null); m.paths = Module._nodeModulePaths(path.join(repo, 'lib')); m._compile(b.outputFiles[0].text, path.join(repo, 'lib/x.cjs'));
const coverage = JSON.parse(fs.readFileSync(path.join(repo, 'data/coverage.normalized.json'))).entries;
const canonical = v => Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.entries(v).sort(([a], [c]) => a.localeCompare(c)).map(([k, x]) => JSON.stringify(k) + ':' + canonical(x)).join(',') + '}' : JSON.stringify(v) ?? 'null';
// MaxTSVoltage = 20 series cells x 4.5 V = 90 V; NominalTSVoltage = 20 x 4 V = 80 V -> 5000/80 = 62.5 A; IMD 0.5*90 = 45 kΩ.
const common = { 'LC-ESF-S04-E3': 'Series', 'LC-ESF-S02-D6': '4.5', 'LC-ESF-S02-D7': '4', 'LC-ESF-S05-D11': 'Ratio', 'LC-ESF-S04-O23': 'On bus bar', 'LC-ESF-S06-D10': '3000' };
export const cases = {
  below: { 'LC-ESF-S05-D14': '80', 'LC-ESF-S04-O24': '5', 'LC-ESF-S04-O12': '89', 'LC-ESF-S04-O13': '89', 'LC-ESF-S07-D5': '44', 'LC-ESF-S07-K6': '60', 'LC-ESF-S09-D6': '89' },
  at: { 'LC-ESF-S05-D14': '90', 'LC-ESF-S04-O24': '10', 'LC-ESF-S04-O12': '90', 'LC-ESF-S04-O13': '90', 'LC-ESF-S07-D5': '45', 'LC-ESF-S07-K6': '62.5', 'LC-ESF-S09-D6': '90' },
  above: { 'LC-ESF-S05-D14': '91', 'LC-ESF-S04-O24': '11', 'LC-ESF-S04-O12': '1000', 'LC-ESF-S04-O13': '1000', 'LC-ESF-S07-D5': '100', 'LC-ESF-S07-K6': '63', 'LC-ESF-S09-D6': '500' },
};
fs.mkdirSync(outDir, { recursive: true });
for (const [name, values] of Object.entries(cases)) {
  const bySystem = {};
  for (const [id, value] of Object.entries({ ...common, ...values })) {
    const e = coverage.find(x => x.id === id), sys = e.systemId ?? 'COORDINATOR';
    (bySystem[sys] ??= {})[e.fieldId] = { status: 'answered', value, sourceReview: 'confirmed' };
  }
  const snapshots = Object.entries(bySystem).map(([id, answers]) => ({ id, answers, revision: 2, status: 'draft', attachments: [], progress: {}, updatedAt: null, review: { fields: {} }, schemaVersion: 'qa' }));
  const translations = snapshots.map(s => ({ systemId: s.id, sourceRevision: 2, sourceHash: crypto.createHash('sha256').update(canonical(s.answers)).digest('hex'), isCurrent: true, englishAnswers: s.answers, fieldStates: Object.fromEntries(Object.keys(s.answers).map(k => [k, 'ready'])) }));
  const wb = await m.exports.buildOfficialWorkbook({ kind: 'esf', snapshots, translations, generatedAt: '2026-11-22T00:00:00Z' });
  const parts = unzipSync(wb.bytes);
  let acc = strFromU8(parts['xl/worksheets/sheet4.xml']);
  for (const [ref, v] of [['B12', 1], ['C12', 20], ['E12', 1]]) acc = acc.replace(new RegExp(`<c r="${ref}"([^>]*?)\\s*/>`), `<c r="${ref}"$1><v>${v}</v></c>`);
  parts['xl/worksheets/sheet4.xml'] = strToU8(acc);
  fs.writeFileSync(path.join(outDir, `ESF-threshold-${name}.xlsx`), zipSync(parts, { level: 6 }));
  console.log(name, wb.report.writtenCells.filter(w => w.type === 'number').map(w => `${w.sheet}!${w.cell}=${w.value}`).join(' '));
}
