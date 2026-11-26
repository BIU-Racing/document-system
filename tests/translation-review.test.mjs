// Translation approval (lib/translation-review.ts), automatic checks (lib/translation-checks.ts),
// and their effect on the export report and readiness. Synthetic data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Module, { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const built = esbuild.buildSync({ stdin: { contents: "export * from './lib/translation-review'; export * from './lib/translation-checks'; export { buildOfficialWorkbook } from './lib/official-workbooks'; export { computeReadiness } from './lib/export-readiness'; export { fingerprint, canonical } from './lib/progress';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', target: 'node22', write: false, logLevel: 'silent' });
const file = path.resolve('lib/translation-review-test.cjs');
const mod = new Module(file, null); mod.filename = file; mod.paths = Module._nodeModulePaths(path.resolve('lib')); mod._compile(built.outputFiles[0].text, file);
const { approvalState, applyTranslationOverrides, englishPrint, needsTranslation, overrideFor, checkTranslation, checkAnswerTranslation, buildOfficialWorkbook, computeReadiness, fingerprint, canonical } = mod.exports;

const hebrew = { status: 'answered', value: 'בקר הסוללה מנטר כל תא.' };
const english = { status: 'answered', value: 'The battery controller monitors every cell.' };
const approval = (answer, en, extra = {}) => ({ source: fingerprint(answer), english: englishPrint(en), role: 'contributor', at: '2026-11-26', ...extra });

test('an approval holds only for the same Hebrew and the same English', () => {
  const review = { translations: { F: approval(hebrew, english) } };
  assert.equal(approvalState(review, 'F', hebrew, english), 'approved');
  assert.equal(approvalState(review, 'F', { ...hebrew, value: 'בקר הסוללה מנטר כל מקטע.' }, english), 'stale', 'Hebrew edited');
  assert.equal(approvalState(review, 'F', hebrew, { ...english, value: 'Something else.' }), 'stale', 'machine English changed');
  assert.equal(approvalState(review, 'F', hebrew, undefined), 'stale');
  assert.equal(approvalState({}, 'F', hebrew, english), 'none');
  assert.equal(englishPrint({ ...english, reason: 'translated reason' }), englishPrint(english), 'only the English value counts');
});

test('a corrected English replaces the machine text only while the Hebrew is unchanged', () => {
  const corrected = 'The BMS monitors every cell.';
  const review = { translations: { F: approval(hebrew, { value: corrected }, { value: corrected }) } };
  assert.equal(overrideFor(review, 'F', hebrew), corrected);
  const applied = applyTranslationOverrides({ F: hebrew }, review, { F: english }, { F: 'pending' });
  assert.equal(applied.englishAnswers.F.value, corrected);
  assert.equal(applied.fieldStates.F, 'ready');
  assert.equal(approvalState(review, 'F', hebrew, applied.englishAnswers.F), 'approved');
  const changed = { ...hebrew, value: 'טקסט אחר' };
  assert.equal(overrideFor(review, 'F', changed), undefined);
  assert.equal(applyTranslationOverrides({ F: changed }, review, { F: english }, { F: 'ready' }).englishAnswers.F.value, english.value);
});

test('only answers with Hebrew text need translation', () => {
  assert.equal(needsTranslation(hebrew), true);
  assert.equal(needsTranslation({ status: 'answered', value: '25.4' }), false);
  assert.equal(needsTranslation({ status: 'unknown', value: 'טרם נקבע' }), false);
  assert.equal(needsTranslation({ status: 'answered', value: [{ _id: 'r', c: 'מקטע' }] }), true);
});

test('checks catch the error types found in the QA audit', () => {
  const codes = (he, en) => checkTranslation(he, en).map(warning => warning.code);
  assert.ok(codes('אסור לפתוח את מארז המצבר כאשר המתח גבוה מ־60 V.', 'The battery pack should not be opened when the voltage is higher than 60 V.').includes('obligation_weakened'));
  assert.ok(codes('החיבור בין המקטעים מתבצע עם מחבר בחתך 35 mm².', 'The connection between the segments is made with a connector in a 35 mm incision.').includes('unit_changed'));
  assert.ok(codes('הטעינה המוקדמת מסתיימת כאשר המתח מגיע ל־95%.', 'Early loading ends when the voltage reaches 95%.').includes('term_wrong'));
  assert.ok(codes('המתח הוא 600 V. האנרגיה היא 7.2 kWh.', 'The voltage is 600 V.').includes('sentence_missing'));
  assert.ok(codes('המתח הוא 600 V. האנרגיה היא 7.2 kWh.', 'The voltage is 600 V.').includes('number_missing'));
  assert.ok(codes('לא רלוונטי כי אין לנו מנועים בגלגלים.', 'Not relevant because we have wheel motors.').includes('negation_lost'));
  assert.ok(codes('נשאר', 'Left טקסט').includes('hebrew_left'));
});

test('checks stay quiet on correct translations from the QA audit', () => {
  const qa = JSON.parse(fs.readFileSync('docs/qa/evidence/translation-results.json', 'utf8')).results;
  const references = qa.filter(item => item.hebrew && item.reference && !/^\(/.test(item.reference));
  assert.ok(references.length > 30);
  const noisy = references.filter(item => checkTranslation(item.hebrew, item.reference).length);
  assert.deepEqual(noisy.map(item => item.hebrew), []);
  const flagged = qa.filter(item => item.hebrew && item.actualEnglish && checkTranslation(item.hebrew, item.actualEnglish).length);
  assert.ok(flagged.length >= 20, `machine translations flagged: ${flagged.length}`);
});

test('table answers are checked cell by cell', () => {
  const warnings = checkAnswerTranslation([{ _id: 'a', part: 'נתיך 200 A' }], [{ _id: 'a', part: 'Fuse' }]);
  assert.ok(warnings.some(warning => warning.code === 'number_missing' && warning.detail.startsWith('שורה 1')));
});

const sha = value => crypto.createHash('sha256').update(value).digest('hex');
test('export: approved English is marked, readiness stops blocking, a Hebrew change voids it', async () => {
  const fieldId = 'LC-ESF-S04-L11';
  const answers = { [fieldId]: { status: 'answered', value: 'בקר סוללה סינתטי' } };
  const englishAnswer = { status: 'answered', value: 'Synthetic battery controller' };
  const build = async review => {
    const snapshot = { id: 'BMS', revision: 2, answers, review, status: 'draft', attachments: [] };
    const translation = { systemId: 'BMS', sourceRevision: 2, sourceHash: sha(canonical(answers)), isCurrent: true, englishAnswers: { [fieldId]: englishAnswer }, fieldStates: { [fieldId]: 'ready' } };
    const workbook = await buildOfficialWorkbook({ kind: 'esf', snapshots: [snapshot], translations: [translation], generatedAt: '2026-11-26T00:00:00.000Z' });
    return workbook.report;
  };
  const engineering = { fields: { [fieldId]: { fingerprint: fingerprint(answers[fieldId]), verdict: 'approved', reason: 'x', role: 'reviewer', at: 'x' } } };
  const reasons = report => computeReadiness({ report, completeScope: false }).issues.find(issue => issue.fieldId === fieldId)?.reasons ?? [];

  const before = await build(engineering);
  assert.equal(before.fields.find(f => f.controlId === fieldId).translationApproved, false);
  assert.deepEqual(reasons(before), ['translation_approval']);

  const approved = await build({ ...engineering, translations: { [fieldId]: approval(answers[fieldId], englishAnswer) } });
  assert.equal(approved.fields.find(f => f.controlId === fieldId).translationApproved, true);
  assert.deepEqual(reasons(approved), [], 'engineering + translation approval: ready');

  const stale = await build({ ...engineering, translations: { [fieldId]: approval({ status: 'answered', value: 'גרסה קודמת' }, englishAnswer) } });
  assert.deepEqual(reasons(stale), ['translation_approval']);
});
