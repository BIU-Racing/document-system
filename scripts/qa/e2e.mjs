// End-to-end QA harness (synthetic data only, no database, no network except the public model download).
// Hebrew answers -> real translation plan -> real OPUS-MT (worker-equivalent path) -> server validation ->
// assembleTranslation -> real buildOfficialWorkbook -> files on disk for independent re-reading.
// Usage: node e2e.mjs <repo> <scratch>
import fs from 'node:fs';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
const [repo, scratch] = process.argv.slice(2);
const out = path.join(scratch, 'e2e'); fs.mkdirSync(out, { recursive: true });
const require = createRequire(path.join(repo, 'package.json'));
const esbuild = require('esbuild');
function load(entry) {
  const built = esbuild.buildSync({ entryPoints: [path.join(repo, entry)], bundle: true, platform: 'node', format: 'cjs', target: 'node22', write: false, logLevel: 'silent', absWorkingDir: repo });
  const file = path.join(repo, 'lib', '__qa_' + path.basename(entry) + '.cjs');
  const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.join(repo, 'lib')); m._compile(built.outputFiles[0].text, file); return m.exports;
}
const wb = load('lib/official-workbooks.ts');
const content = load('lib/translation-content.ts');
const catalog = load('lib/catalog.ts');
const validation = load('lib/local-translation-validation.ts');
const lt = await import(path.join(repo, 'lib/local-translation.mjs'));
const tf = require(path.join(repo, 'node_modules/@huggingface/transformers/dist/transformers.node.cjs'));
const cfg = fs.readFileSync(path.join(repo, 'lib/local-translation-config.ts'), 'utf8');
const MODEL_ID = /LOCAL_MODEL_ID='([^']+)'/.exec(cfg)[1], REVISION = /LOCAL_MODEL_REVISION='([^']+)'/.exec(cfg)[1];
tf.env.allowLocalModels = false; tf.env.cacheDir = path.join(scratch, 'hf-cache');
const translator = await tf.pipeline('translation', MODEL_ID, { revision: REVISION, dtype: 'q8', device: 'cpu' });
async function worker(text) { // == lib/translation.worker.ts
  if (!lt.needsTranslation(text)) return { text };
  const prepared = lt.prepareTranslation(text); let output = prepared.text;
  if (lt.needsTranslation(output)) output = (await translator(prepared.text, { max_new_tokens: 256, do_sample: false }))[0]?.translation_text ?? '';
  const restored = lt.restoreTranslation(prepared, output);
  if (!restored.ok) return { error: 'PROTECTED_TEXT_CHANGED', raw: output };
  return { text: restored.text };
}
const a = value => ({ status: 'answered', value, sourceReview: 'confirmed' });
const snapshot = (id, answers, revision = 7) => ({ id, answers, revision, status: 'draft', attachments: [], progress: { complete: 0, total: 0, percent: 0 }, updatedAt: null, review: { fields: {} }, schemaVersion: 'qa' });
const translationLog = [];
async function translate(snap, { failKeys = new Set() } = {}) { // browser client + server accept path
  const plan = await content.makeTranslationPlan(snap.id, catalog.getFields(snap.id), snap.answers, 'model');
  const cache = new Map();
  for (const chunk of plan.chunks) {
    if (cache.has(chunk.key) || failKeys.has(chunk.fieldId)) continue;
    const r = await worker(chunk.text);
    let accepted = null, reason = r.error;
    if (r.text !== undefined) { try { accepted = validation.validateLocalTranslation(chunk.text, r.text); } catch (e) { reason = e.message; } }
    translationLog.push({ systemId: snap.id, fieldId: chunk.fieldId, path: chunk.path, hebrew: chunk.text, english: accepted, rejected: accepted === null ? reason : undefined, raw: r.raw });
    if (accepted !== null) cache.set(chunk.key, accepted);
  }
  const assembled = content.assembleTranslation(plan, cache);
  for (const id of failKeys) if (assembled.fieldStates[id]) assembled.fieldStates[id] = 'failed';
  return { systemId: snap.id, sourceRevision: snap.revision, sourceHash: await content.translationSourceHash(snap.answers), isCurrent: true, englishAnswers: assembled.englishAnswers, fieldStates: assembled.fieldStates };
}
const LONG = 'מארז המצבר מחובר לשלדה באמצעות תושבות פלדה מרותכות. כל תושבת נבדקה בחישוב ובניסוי. בין התאים לבין דפנות המארז קיימת שכבת בידוד רציפה. הכבלים עוברים בתעלות סגורות ואינם נוגעים בחלקים חדים. מעל התאים מותקן לוח מבודד שמונע מגע מקרי. המכסה נסגר בברגים ננעלים ואינו נפתח ללא כלי עבודה. הנהג אינו יכול לגעת בשום חלק של מערכת ההנעה. כל החלקים המוליכים החשופים מוארקים לשלדה. מערכת הקירור אינה משתמשת בנוזל מוליך. במקרה של תקלה בטמפרטורה המערכת מנתקת את המתח הגבוה מיד.';
const row = (id, cells) => ({ _id: id, ...cells });
const C = 'LC-ESF-Datasheets-conductors-';
// ---------- Scenario answers ----------
const esf = () => ({
  BMS: { 'LC-ESF-S04-O12': a('300'), 'LC-ESF-S04-O23': a('On bus bar'), 'LC-ESF-S04-O24': a('5') },
  IMD: { 'LC-ESF-S07-D5': a('50') },
  BSPD: { 'LC-ESF-S07-K6': a('5') },
  TSAL: { 'LC-ESF-S07-V74': a('TRUE') },
  COORDINATOR: {
    'LC-ESF-S05-D11': a('Ratio'), 'LC-ESF-S05-D14': a('80'),
    'LC-ESF-S09-D6': a('100'),
    'LC-ESF-S02-D5': a('3.5'), 'LC-ESF-S02-D12': a('ליתיום־יון NMC'),
    'LC-ESF-S05-D12': a('2.8'),
    'LC-ESF-S02-D15': a('הערה: "AIR+" ו־"AIR-" הם ממסרים נפרדים & <לא> מחוברים במקביל.'),
    'LC-ESF-S04-A57': a(LONG),
    'LC-ESF-S03-J30': a('TRUE'),
    'CARD-FG-ESF-DS-02': a([row('r1', { [C + 'B']: 'Leoni', [C + 'C']: 'FLR2X-A 35', [C + 'D']: '35', [C + 'E']: '1000', [C + 'F']: '180', [C + 'G']: '150', [C + 'J']: 'בין המצבר לממיר', [C + 'L']: 'כבל כתום עם מיגון, שטח החתך 35 mm²' })]),
  },
});
const ases = () => ({ ACCUMULATOR: {
  'LC-ASES-S06-E14': a('0'), 'LC-ASES-S06-E15': a('25.4'), 'LC-ASES-S06-E16': a('1.6'),
  'LC-ASES-S09-C46': a('0.5'), 'LC-ASES-S15-M22': a('400'), 'LC-ASES-S15-M25': a('0.3'),
  'CARD-MATERIAL-Datasheets-Fiber': a([row('m1', { 'LC-ASES-S11-A5': 'סיבי פחמן Toray T700 באריגת twill', 'LC-ASES-S11-A7': 'Carbon Fiber' })]),
}});
const build = async (kind, sys, opts = {}) => {
  const snaps = Object.entries(sys).map(([id, ans]) => snapshot(id, ans));
  const translations = opts.noTranslation ? [] : await Promise.all(snaps.map(s => translate(s, opts)));
  if (opts.mutateAfterTranslation) opts.mutateAfterTranslation(snaps);
  return wb.buildOfficialWorkbook({ kind, snapshots: snaps, translations, generatedAt: '2026-11-22T00:00:00Z' });
};
const scenarios = {};
async function run(name, kind, sys, opts) {
  const r = await build(kind, sys, opts);
  const file = path.join(out, `${name}.${kind === 'ases' ? 'xlsm' : 'xlsx'}`);
  fs.writeFileSync(file, Buffer.from(r.bytes));
  const ours = r.report.fields.filter(f => f.status !== 'out_of_scope' && (f.status !== 'empty' || Object.values(sys).some(ans => f.fieldId in ans)));
  scenarios[name] = { kind, file, writtenCells: r.report.writtenCells, statuses: ours.map(f => ({ controlId: f.controlId, fieldId: f.fieldId, status: f.status, cells: f.writtenCells })), warnings: r.report.warnings, readyForSubmission: r.report.readyForSubmission };
  console.log(name, ours.map(f => `${f.controlId.replace(/^LC-(ESF|ASES)-/, '')}=${f.status}`).join(' '));
}
await run('S1-complete-esf', 'esf', esf());
await run('S1-complete-ases', 'ases', ases());
await run('S2-untranslated-esf', 'esf', esf(), { noTranslation: true });
await run('S3-stale-esf', 'esf', esf(), { mutateAfterTranslation: snaps => { snaps.find(s => s.id === 'COORDINATOR').answers['LC-ESF-S02-D12'] = a('ליתיום ברזל פוספט LFP'); } });
await run('S4-translation-failed-esf', 'esf', esf(), { failKeys: new Set(['LC-ESF-S02-D12']) });
const bad = esf();
Object.assign(bad.COORDINATOR, { 'LC-ESF-S02-D5': a('3,5'), 'LC-ESF-S05-D12': a('12 s'), 'LC-ESF-S03-J30': a('כן'),
  'CARD-FG-ESF-DS-04': a([row('x', { 'LC-ESF-Datasheets-resistors-B': 'Vishay', 'LC-ESF-Datasheets-resistors-H': 'None' })]) });
await run('S5-invalid-values-esf', 'esf', bad);
const many = esf(); many.COORDINATOR['CARD-FG-ESF-DS-02'] = a(Array.from({ length: 20 }, (_, i) => row('r' + i, { [C + 'B']: 'Leoni', [C + 'D']: '35' })));
await run('S6-table-overflow-esf', 'esf', many);
const partial = esf(); partial.COORDINATOR['CARD-FG-ESF-DS-02'] = a([row('r1', { [C + 'B']: 'Leoni', [C + 'D']: '35' }), row('r2', { [C + 'B']: 'Leoni', [C + 'D']: '35 ממ"ר' })]);
await run('S7-incomplete-table-esf', 'esf', partial);
const empty = esf(); empty.COORDINATOR['LC-ESF-S02-D12'] = a(''); empty.COORDINATOR['LC-ESF-S02-D5'] = { status: 'unknown', value: '' };
await run('S8-empty-unknown-esf', 'esf', empty);
// SES: user-chosen cell address; numeric-looking text
const sesField = catalog.getFields('SES').find(f => f.officialTemplate?.sheet === 'Version History');
const sesAns = { [sesField.id]: a([row('v1', { [sesField.id + '-CELL']: 'A4', [sesField.id + '-VALUE']: '007' }), row('v2', { [sesField.id + '-CELL']: 'B4', [sesField.id + '-VALUE']: 'גרסה ראשונה להגשה' })]) };
await run('S9-ses', 'ses', { SES: sesAns });
fs.writeFileSync(path.join(out, 'scenarios.json'), JSON.stringify(scenarios, null, 1));
fs.writeFileSync(path.join(out, 'translation-log.json'), JSON.stringify(translationLog, null, 1));
console.log('done');
