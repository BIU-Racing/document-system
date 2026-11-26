// Pre-export readiness check (lib/export-readiness.ts). Synthetic data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import crypto from 'node:crypto';
import Module, { createRequire } from 'node:module';
import { computeReadiness, controlReasons, readinessFilename } from '../lib/export-readiness.ts';

const field = (over = {}) => ({ controlId: 'C1', systemId: 'BMS', fieldId: 'F1', sheet: 'S', ranges: ['A1'], status: 'written', message: '', writtenCells: ['A1'], engineeringReviewed: true, ...over });
const report = (fields, over = {}) => ({ kind: 'esf', template: { submission2027Verified: false }, fields, ...over });

test('a reviewed, non-translated written value is ready', () => {
  assert.deepEqual(controlReasons(field()), []);
});

test('each export status maps to a readiness reason', () => {
  const cases = { empty: 'missing', unknown: 'unknown', invalid_value: 'invalid_value', overflow: 'overflow', source_conflict: 'source_mismatch', translation_pending: 'translation_pending', translation_failed: 'translation_failed', manual_mapping: 'mapping_unresolved', protected: 'mapping_unresolved', restricted: 'restricted_manual' };
  for (const [status, reason] of Object.entries(cases)) assert.deepEqual(controlReasons(field({ status, engineeringReviewed: undefined })), [reason], status);
});

test('written answers need engineering review, source confirmation and translation approval', () => {
  assert.deepEqual(controlReasons(field({ engineeringReviewed: false })), ['engineering_review']);
  assert.deepEqual(controlReasons(field({ sourceReviewPending: true })), ['source_review']);
  assert.deepEqual(controlReasons(field({ machineTranslated: true })), ['translation_approval']);
});

test('N/A is a warning without a reason and still needs engineering review', () => {
  const na = field({ status: 'not_applicable', engineeringReviewed: false });
  assert.deepEqual(controlReasons(na, { F1: { status: 'na', value: '' } }), ['not_applicable_reason', 'engineering_review']);
  assert.deepEqual(controlReasons(na, { F1: { status: 'na', value: '', reason: 'אין מערכת כזו ברכב' } }), ['engineering_review']);
  assert.deepEqual(controlReasons(field({ status: 'not_applicable' }), { F1: { status: 'na', value: '', reason: 'סיבה' } }), []);
});

test('evidence placement alone is a warning, not a blocker', () => {
  const result = computeReadiness({ report: report([field({ status: 'evidence_required' })], { template: { submission2027Verified: true } }), completeScope: true });
  assert.equal(result.totals.warnings, 1);
  assert.equal(result.totals.blockers, 0);
  assert.equal(result.ready, true, 'warnings never block validation');
});

test('table columns of one field merge into a single issue', () => {
  const result = computeReadiness({ report: report([
    field({ controlId: 'C1', status: 'empty', ranges: ['A1:A3'] }),
    field({ controlId: 'C2', status: 'invalid_value', ranges: ['B1:B3'] }),
  ]), completeScope: true });
  assert.equal(result.issues.length, 1);
  assert.deepEqual(result.issues[0].reasons, ['missing', 'invalid_value']);
  assert.deepEqual(result.issues[0].controlIds, ['C1', 'C2']);
  assert.deepEqual(result.issues[0].ranges, ['A1:A3', 'B1:B3']);
  assert.equal(result.totals.items, 1);
});

test('document-level blockers: unverified template and partial scope', () => {
  const clean = [field()];
  const verified = { template: { submission2027Verified: true } };
  assert.equal(computeReadiness({ report: report(clean, verified), completeScope: true }).ready, true);
  assert.deepEqual(computeReadiness({ report: report(clean), completeScope: true }).documentBlockers.map(b => b.code), ['template_unverified']);
  assert.deepEqual(computeReadiness({ report: report(clean, { ...verified, kind: 'ses' }), completeScope: true }).documentBlockers.map(b => b.code), [], 'SES has a fixed mapping now');
  const partial = computeReadiness({ report: report([...clean, field({ controlId: 'X', systemId: 'TSAL', fieldId: 'T', status: 'out_of_scope' })], verified), completeScope: true });
  assert.deepEqual(partial.documentBlockers, [{ code: 'partial_scope', count: 1 }]);
  assert.equal(partial.totals.items, 1, 'out-of-scope controls are not counted as items');
  assert.equal(computeReadiness({ report: report(clean, verified), completeScope: false }).state, 'draft');
});

test('per-system summary and labels', () => {
  const labels = { system: id => ({ BMS: 'ניהול סוללה' })[id], field: (s, f) => (f === 'F2' ? { label: 'מתח', section: 'חשמל' } : undefined) };
  const result = computeReadiness({ report: report([field(), field({ controlId: 'C2', fieldId: 'F2', status: 'empty' })]), completeScope: true, labels });
  assert.deepEqual(result.systems, [{ systemId: 'BMS', systemLabel: 'ניהול סוללה', total: 2, ready: 1, blockers: 1, warnings: 0 }]);
  assert.equal(result.issues[0].fieldLabel, 'מתח');
  assert.equal(result.issues[0].section, 'חשמל');
});

test('download name is changed only for a validated document', () => {
  const name = 'BIU_Racing_2027_ESF_WORKING_DRAFT_template_2023.xlsx';
  assert.equal(readinessFilename(name, { ready: false }), name);
  assert.equal(readinessFilename(name, { ready: true }), 'BIU_Racing_2027_ESF_VALIDATED_template_2023.xlsx');
});

// ---------- real ESF build: the report marks machine-translated cells ----------
const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const built = esbuild.buildSync({ entryPoints: ['lib/official-workbooks.ts'], bundle: true, platform: 'node', format: 'cjs', target: 'node22', write: false, logLevel: 'silent' });
const file = path.resolve('lib/export-readiness-test.cjs');
const mod = new Module(file, null); mod.filename = file; mod.paths = Module._nodeModulePaths(path.resolve('lib')); mod._compile(built.outputFiles[0].text, file);
const { buildOfficialWorkbook } = mod.exports;
const canonical = v => Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => JSON.stringify(k) + ':' + canonical(x)).join(',') + '}' : JSON.stringify(v) ?? 'null';
const sha = v => crypto.createHash('sha256').update(v).digest('hex');

test('ESF export: translated, untranslated and reviewed answers are classified', async () => {
  const translated = 'LC-ESF-S04-L11', untranslated = 'LC-ESF-S04-O11';
  const answers = { [translated]: { status: 'answered', value: 'בקר סוללה סינתטי' }, [untranslated]: { status: 'answered', value: 'ערך סינתטי' } };
  const review = { fields: { [translated]: { fingerprint: canonical(answers[translated]), verdict: 'approved', reason: 'בדיקה סינתטית', role: 'reviewer', at: '2026-11-26' } } };
  const snapshot = { id: 'BMS', revision: 3, answers, review, status: 'in_review', attachments: [] };
  const translation = { systemId: 'BMS', sourceRevision: 3, sourceHash: sha(canonical(answers)), isCurrent: true, englishAnswers: { [translated]: { status: 'answered', value: 'Synthetic battery controller' } }, fieldStates: { [translated]: 'ready', [untranslated]: 'pending' } };
  const workbook = await buildOfficialWorkbook({ kind: 'esf', snapshots: [snapshot], translations: [translation], generatedAt: '2026-11-26T00:00:00.000Z' });
  const byControl = Object.fromEntries(workbook.report.fields.map(f => [f.controlId, f]));
  assert.equal(byControl[translated].status, 'written');
  assert.equal(byControl[translated].machineTranslated, true);
  assert.equal(byControl[translated].engineeringReviewed, true);
  assert.equal(byControl[untranslated].status, 'translation_pending');
  assert.equal(workbook.report.readyForSubmission, false);

  const readiness = computeReadiness({ report: workbook.report, answers: { BMS: answers }, completeScope: false });
  const issue = key => readiness.issues.find(i => i.key === 'BMS:' + key);
  assert.deepEqual(issue(translated).reasons, ['translation_approval']);
  assert.deepEqual(issue(untranslated).reasons, ['translation_pending', 'engineering_review']);
  assert.equal(readiness.ready, false);
  assert.ok(readiness.documentBlockers.some(b => b.code === 'partial_scope'), 'systems outside the snapshot set block validation');
});

test('SES: written manual cell addresses need a check, empty optional tables are not required', () => {
  const labels = { system: () => 'SES', field: (_s, id) => id === 'TABLE' ? { label: 'תאים נוספים', optional: true, manualAddress: true } : { label: 'שאלה קבועה' } };
  const verified = { kind: 'ses', template: { submission2027Verified: true } };
  const empty = computeReadiness({ report: report([field({ systemId: 'SES', fieldId: 'TABLE', status: 'empty', engineeringReviewed: undefined }), field({ systemId: 'SES', fieldId: 'F1' })], verified), completeScope: true, labels });
  assert.equal(empty.ready, true);
  assert.equal(empty.totals.items, 1, 'an empty optional table is not counted');
  const written = computeReadiness({ report: report([field({ systemId: 'SES', fieldId: 'TABLE' })], verified), completeScope: true, labels });
  assert.deepEqual(written.issues[0].reasons, ['manual_cell_address']);
  assert.equal(written.ready, false);
});
