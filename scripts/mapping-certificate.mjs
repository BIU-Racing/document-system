#!/usr/bin/env node
/**
 * Mapping certificate: proves, with synthetic data only, where every field of the
 * app lands in the official Excel workbooks.
 *
 *   npm run templates:prepare && node scripts/mapping-certificate.mjs
 *
 * Output (outputs/mapping-certificate/, git-ignored):
 *   ESF-marked.xlsx / ASES-marked.xlsm  - real exports in which every text cell carries
 *                                          its marker (#0001 ...), so a person can open
 *                                          the file and see which question landed where.
 *   mapping-review.xlsx                - one row per field: Hebrew question, the label the
 *                                          official template shows next to the cell, the
 *                                          cell, the marker and the machine check result.
 *   summary.json / results.json        - the numbers behind the summary sheet, and one result per entry.
 *
 * What is checked automatically, per document:
 *   1. Every mapped field that the exporter writes holds exactly its own value in its own
 *      mapped cell (read back from the produced file, independent of the exporter).
 *   2. No other cell in the workbook changed, except template defaults that the exporter
 *      reports as cleared and the audited project identity cells.
 * What it cannot check: that the mapping is right in engineering terms. The review
 * table puts the question and the template's own label side by side for that.
 *
 * No database, network or production data is used.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Module, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const outDir = path.join(root, 'outputs', 'mapping-certificate');
fs.mkdirSync(outDir, { recursive: true });

// ---------------------------------------------------------------- data
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const templatesFile = 'private-data/official-workbook-templates.json';
if (!fs.existsSync(templatesFile)) { console.error('Run "npm run templates:prepare" first.'); process.exit(1); }
const templates = readJson(templatesFile);
const coverage = readJson('data/coverage.normalized.json').entries;
const systems = readJson('data/systems.normalized.json');
const coordinatorFields = readJson('data/coordinator.normalized.json');
const systemLabel = new Map(systems.map(system => [system.id, system.label]));
systemLabel.set('COORDINATOR', 'ריכוז מסמכים ושדות משותפים');
const fieldsOf = new Map(systems.map(system => [system.id, system.fields]));
fieldsOf.set('COORDINATOR', coordinatorFields);
const getField = (systemId, fieldId) => (fieldsOf.get(systemId) ?? []).find(field => field.id === fieldId);

// Reference only: the independent QA audit of 22.11.2026 (openpyxl read + manual review).
const qaRows = new Map();
const qaFile = 'docs/qa/evidence/mapping-results-after-fix.csv';
if (fs.existsSync(qaFile)) {
  const lines = fs.readFileSync(qaFile, 'utf8').trim().split('\n');
  const head = parseCsvLine(lines[0]);
  for (const line of lines.slice(1)) {
    const row = Object.fromEntries(parseCsvLine(line).map((value, index) => [head[index], value]));
    qaRows.set(`${row.document}:${row.fieldId}`, row);
  }
}
function parseCsvLine(line) {
  const out = []; let current = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) { if (c === '"' && line[i + 1] === '"') { current += '"'; i++; } else if (c === '"') quoted = false; else current += c; }
    else if (c === '"') quoted = true; else if (c === ',') { out.push(current); current = ''; } else current += c;
  }
  out.push(current); return out;
}

// ---------------------------------------------------------------- exporter (real code)
const esbuild = require('esbuild');
const built = esbuild.buildSync({ stdin: { contents: "export * from './lib/official-workbooks'; export { sesFixedFields } from './lib/ses-fields';", resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', target: 'node22', write: false, logLevel: 'silent' });
const bundleFile = path.resolve('lib/mapping-certificate-bundle.cjs');
const bundle = new Module(bundleFile, null); bundle.filename = bundleFile; bundle.paths = Module._nodeModulePaths(path.resolve('lib'));
bundle._compile(built.outputFiles[0].text, bundleFile);
const { buildOfficialWorkbook, numericTargetById, sesFixedFields } = bundle.exports;

const canonical = v => Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => JSON.stringify(k) + ':' + canonical(x)).join(',') + '}' : JSON.stringify(v) ?? 'null';
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

// ---------------------------------------------------------------- cell helpers
const colNumber = letters => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const colLetters = n => { let s = ''; while (n) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); } return s; };
const parseRef = ref => { const m = /^([A-Z]{1,3})([1-9]\d*)$/.exec(ref); return m ? { col: colNumber(m[1]), row: Number(m[2]) } : null; };
function expand(ranges, limit = 5000) {
  const out = [];
  for (const range of ranges ?? []) {
    const [a, b = a] = range.split(':'), start = parseRef(a), end = parseRef(b);
    if (!start || !end) return null;
    for (let row = start.row; row <= end.row; row++) for (let col = start.col; col <= end.col; col++) { out.push(colLetters(col) + row); if (out.length > limit) return null; }
  }
  return out;
}
const decode = text => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&');

/** Independent OOXML reader: ref -> { value, formula } for one sheet. */
function readSheet(parts, sheetPath, shared) {
  const xml = strFromU8(parts[sheetPath]);
  const cells = new Map();
  for (const match of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const ref = /\br="([A-Z]+\d+)"/.exec(match[1])?.[1]; if (!ref) continue;
    const type = /\bt="([^"]+)"/.exec(match[1])?.[1], body = match[2] ?? '';
    const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
    let value = null;
    if (type === 'inlineStr') value = decode([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join(''));
    else if (type === 's') value = shared[Number(v)] ?? null;
    else if (v !== undefined) value = decode(v);
    cells.set(ref, { value, formula: /<f\b/.test(body) });
  }
  return cells;
}
function sharedStrings(parts) {
  const xml = parts['xl/sharedStrings.xml'] ? strFromU8(parts['xl/sharedStrings.xml']) : '';
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => decode([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join('')));
}
const isLabel = cell => cell && !cell.formula && typeof cell.value === 'string' && /[A-Za-z]/.test(cell.value) && !/^-?\d+(\.\d+)?$/.test(cell.value.trim());

/** What the official template itself writes next to a cell: nearest text to the left and above. */
function templateContext(cells, ref, mapped) {
  const p = parseRef(ref); if (!p) return { rowLabel: '', columnHeader: '' };
  let rowLabel = '', columnHeader = '';
  for (let col = p.col - 1; col >= 1 && col >= p.col - 20; col--) {
    const at = colLetters(col) + p.row; if (mapped.has(at)) continue;
    if (isLabel(cells.get(at))) { rowLabel = cells.get(at).value.trim(); break; }
  }
  for (let row = p.row - 1; row >= 1 && row >= p.row - 60; row--) {
    const at = colLetters(p.col) + row; if (mapped.has(at)) continue;
    if (isLabel(cells.get(at))) { columnHeader = cells.get(at).value.trim(); break; }
  }
  return { rowLabel: rowLabel.replace(/\s+/g, ' ').slice(0, 160), columnHeader: columnHeader.replace(/\s+/g, ' ').slice(0, 160) };
}

// ---------------------------------------------------------------- synthetic values
const marker = serial => '#' + String(serial).padStart(4, '0');
function syntheticValue(entry, field, column, serial) {
  const schema = { ...entry.inputSchema, ...field.sourceInputSchema, ...column?.sourceInputSchema };
  const target = numericTargetById.get(entry.id);
  if (schema.type === 'number_with_unit_and_source' || target) {
    if (target?.max !== undefined) return { value: String(1 + (serial % 90)), kind: 'number' };
    return { value: String(1000 + serial), kind: 'number' };
  }
  const options = schema.source_literal_options || column?.options || field.options || [];
  if (schema.type === 'select' || column?.kind === 'select' || field.kind === 'select') {
    const first = options[0];
    return { value: typeof first === 'string' ? first : String(first?.source_value ?? first?.value ?? 'Yes'), kind: 'select' };
  }
  return { value: `${marker(serial)} ${entry.systemId ?? 'COORDINATOR'}`, kind: 'text' };
}
const exportedValue = (entry, value) => {
  const target = numericTargetById.get(entry.id);
  return target?.factor ? String(Number((Number(value) * target.factor).toPrecision(15))) : value;
};

// ---------------------------------------------------------------- per document
const notWrittenReason = {
  evidence_required: 'קובץ או ראיה. לא נכתב לתא; יש לשבץ ידנית ב־Excel',
  manual_mapping: 'המיפוי דורש הכרעה (למשל הפניה לשורה בטבלה אחרת). לא נכתב אוטומטית',
  restricted: 'פרטי קשר מוגבלים. ממולאים ידנית',
  protected: 'תא נעול או נוסחה בתבנית. לא נכתב',
  overflow: 'יותר שורות ממה שיש בתבנית',
};
const rows = [];
const summary = { generatedAt: new Date().toISOString(), data: 'synthetic only', documents: {} };
let serial = 1;

for (const kind of ['esf', 'ases']) {
  const template = templates[kind];
  const original = unzipSync(Buffer.from(template.base64, 'base64'));
  const originalShared = sharedStrings(original);
  const entries = coverage.filter(entry => entry.official.document.toLowerCase() === kind);

  // Build one answer per field (table columns share a field) with a value per mapping entry.
  const answers = new Map(), expected = new Map(), serialOf = new Map();
  for (const entry of entries) {
    const systemId = entry.systemId ?? 'COORDINATOR';
    const field = entry.fieldId ? getField(systemId, entry.fieldId) : undefined;
    serialOf.set(entry.id, serial);
    if (!field || entry.privateContact) { serial++; continue; }
    const column = field.columns?.find(c => c.id === entry.columnId);
    const synthetic = syntheticValue(entry, field, column, serial++);
    const perSystem = answers.get(systemId) ?? {}; answers.set(systemId, perSystem);
    if (field.kind === 'table') {
      const slots = field.recordKeys?.length > 1 ? field.recordKeys.length : 1;
      const existing = perSystem[field.id] ?? { status: 'answered', sourceReview: 'confirmed', value: Array.from({ length: slots }, (_, i) => ({ _id: 'ROW_' + i })) };
      perSystem[field.id] = existing;
      const slot = slots > 1 ? field.recordKeys.indexOf(entry.sourceRecordKey ?? '') : 0;
      if (slot >= 0 && entry.columnId) { existing.value[slot][entry.columnId] = synthetic.value; expected.set(entry.id, { ...synthetic, value: exportedValue(entry, synthetic.value) }); }
    } else if (!perSystem[field.id]) {
      perSystem[field.id] = { status: 'answered', sourceReview: 'confirmed', value: synthetic.value };
      expected.set(entry.id, { ...synthetic, value: exportedValue(entry, synthetic.value) });
    } else {
      // Same field mapped twice in one document: both cells must carry the same answer.
      const value = perSystem[field.id].value;
      expected.set(entry.id, { kind: synthetic.kind, value: exportedValue(entry, value) });
    }
  }
  const snapshots = [...answers].map(([id, values]) => ({ id, answers: values, revision: 1, status: 'draft', attachments: [], review: { fields: {} } }));
  const translations = snapshots.map(snapshot => ({ systemId: snapshot.id, sourceRevision: 1, sourceHash: sha(canonical(snapshot.answers)), isCurrent: true, englishAnswers: snapshot.answers, fieldStates: Object.fromEntries(Object.keys(snapshot.answers).map(key => [key, 'ready'])) }));
  const workbook = await buildOfficialWorkbook({ kind, snapshots, translations, generatedAt: '2026-11-26T00:00:00.000Z' });
  const file = `${kind.toUpperCase()}-marked.${kind === 'ases' ? 'xlsm' : 'xlsx'}`;
  fs.writeFileSync(path.join(outDir, file), Buffer.from(workbook.bytes));

  // Independent read-back of the produced file.
  const produced = unzipSync(workbook.bytes), producedShared = sharedStrings(produced);
  const report = new Map(workbook.report.fields.map(field => [field.controlId, field]));
  const accounted = new Set([
    ...workbook.report.writtenCells.map(write => write.sheet + '!' + write.cell),
    ...workbook.report.clearedTemplateValues.map(item => item.sheet + '!' + item.cell),
    ...workbook.report.projectMetadata.map(item => item.sheet + '!' + item.cell),
  ]);
  const unexpected = [];
  const originalCells = new Map(), producedCells = new Map();
  for (const sheet of template.sheets) {
    const before = readSheet(original, sheet.path, originalShared), after = readSheet(produced, sheet.path, producedShared);
    originalCells.set(sheet.name, before); producedCells.set(sheet.name, after);
    for (const ref of new Set([...before.keys(), ...after.keys()])) {
      const a = before.get(ref), b = after.get(ref);
      if ((a?.value ?? null) !== (b?.value ?? null) || !!a?.formula !== !!b?.formula) {
        if (b?.formula && a?.formula) continue; // cached formula results are recalculated by Excel
        if (!accounted.has(sheet.name + '!' + ref)) unexpected.push(sheet.name + '!' + ref);
      }
    }
  }
  const mappedCellsBySheet = new Map();
  for (const entry of entries) for (const ref of expand(entry.official.ranges) ?? []) {
    const set = mappedCellsBySheet.get(entry.official.sheet) ?? new Set(); set.add(ref); mappedCellsBySheet.set(entry.official.sheet, set);
  }

  const counts = { mapped: entries.length, written: 0, failed: 0, notWritten: 0, unexpectedChangedCells: unexpected.length };
  for (const entry of entries) {
    const systemId = entry.systemId ?? 'COORDINATOR';
    const field = entry.fieldId ? getField(systemId, entry.fieldId) : undefined;
    const column = field?.columns?.find(c => c.id === entry.columnId);
    const result = report.get(entry.id), want = expected.get(entry.id);
    const cellsAfter = producedCells.get(entry.official.sheet);
    const firstCell = (expand(entry.official.ranges) ?? [])[0] ?? '';
    const context = templateContext(originalCells.get(entry.official.sheet) ?? new Map(), firstCell, mappedCellsBySheet.get(entry.official.sheet) ?? new Set());
    let status, detail = '';
    if (result?.status === 'written' && want) {
      const allowed = new Set(expand(entry.official.ranges) ?? []);
      const bad = result.writtenCells.filter(ref => !allowed.has(ref) || cellsAfter?.get(ref)?.value !== want.value || cellsAfter?.get(ref)?.formula);
      if (bad.length || !result.writtenCells.length) { status = 'FAIL'; detail = 'נמצא ערך שגוי או תא שגוי: ' + bad.join(', '); counts.failed++; }
      else { status = 'OK'; counts.written++; }
    } else if (want && result?.status !== 'written' && !notWrittenReason[result?.status]) {
      status = 'FAIL'; detail = 'צפוי היה להיכתב, סטטוס ' + (result?.status ?? 'חסר'); counts.failed++;
    } else { status = 'NOT_WRITTEN'; detail = notWrittenReason[result?.status] ?? (entry.privateContact ? notWrittenReason.restricted : 'לא נכתב אוטומטית'); counts.notWritten++; }
    const qa = qaRows.get(`${kind.toUpperCase()}:${entry.id}`);
    rows.push({
      document: kind.toUpperCase(), marker: want?.kind === 'text' ? marker(serialOf.get(entry.id)) : '', testValue: want?.value ?? '',
      system: systemLabel.get(systemId) ?? systemId, systemId, section: field?.section ?? entry.section ?? '',
      question: field ? field.label + (column ? ' ← ' + column.label : '') : entry.label, fieldId: entry.fieldId ?? '', controlId: entry.id,
      cell: `${entry.official.sheet}!${entry.official.ranges.join(', ')}`, rowLabel: context.rowLabel, columnHeader: context.columnHeader,
      status, detail, qaResult: qa?.result ?? '', qaLabel: qa?.templateLabel ?? '', qaNote: qa?.result === 'NEEDS ENGINEERING REVIEW' ? qa.explanation : '',
    });
  }
  if (unexpected.length) counts.unexpectedSample = unexpected.slice(0, 20);
  summary.documents[kind.toUpperCase()] = { file, ...counts };
  console.log(kind.toUpperCase(), JSON.stringify(counts));
}

// ---------------------------------------------------------------- SES (fixed single-value cells)
{
  const template = templates.ses;
  const original = unzipSync(Buffer.from(template.base64, 'base64'));
  const originalShared = sharedStrings(original);
  const values = {}, expected = new Map(), serialOf = new Map();
  for (const field of sesFixedFields) {
    const kind = field.sesFixed.valueKind, options = (field.options ?? []).map(option => option.value);
    serialOf.set(field.id, serial);
    let value;
    // Construction-type selectors take the option that shows both tube and composite inputs.
    if (field.sesFixed.englishLabel === 'Enter construction type' && options.includes('Tubes + composite')) value = 'Tubes + composite';
    else if (kind === 'select') value = options[0];
    else if (kind === 'number') value = String(1000 + serial);
    else value = `${marker(serial)} SES`;
    serial++;
    values[field.id] = { status: 'answered', sourceReview: 'confirmed', value };
  }
  const build = async () => {
    const snapshot = { id: 'SES', answers: values, revision: 1, status: 'draft', attachments: [], review: { fields: {} } };
    return buildOfficialWorkbook({ kind: 'ses', snapshots: [snapshot], generatedAt: '2026-11-26T00:00:00.000Z' });
  };
  // Some numeric cells carry an Excel range rule; a refused synthetic number is replaced by the
  // template's own value (or 1) once, so the cell itself is still exercised.
  let workbook = await build();
  for (const result of workbook.report.fields) {
    const field = sesFixedFields.find(item => item.id === result.fieldId);
    if (field && result.status === 'invalid_value' && field.sesFixed.valueKind === 'number') {
      const fallback = typeof field.sesFixed.templateValue === 'number' ? field.sesFixed.templateValue : 1;
      values[field.id] = { ...values[field.id], value: String(fallback) };
    }
  }
  workbook = await build();
  for (const field of sesFixedFields) {
    const raw = values[field.id].value;
    expected.set(field.id, field.sesFixed.valueKind === 'number' ? String(Number(raw)) : raw);
  }
  fs.writeFileSync(path.join(outDir, 'SES-marked.xlsx'), Buffer.from(workbook.bytes));
  const produced = unzipSync(workbook.bytes), producedShared = sharedStrings(produced);
  const accounted = new Set(workbook.report.writtenCells.map(write => write.sheet + '!' + write.cell));
  const unexpected = [];
  const producedCells = new Map();
  for (const sheet of template.sheets) {
    const before = readSheet(original, sheet.path, originalShared), after = readSheet(produced, sheet.path, producedShared);
    producedCells.set(sheet.name, after);
    for (const ref of new Set([...before.keys(), ...after.keys()])) {
      const a = before.get(ref), b = after.get(ref);
      if ((a?.value ?? null) !== (b?.value ?? null) || !!a?.formula !== !!b?.formula) {
        if (a?.formula && b?.formula) continue;
        if (!accounted.has(sheet.name + '!' + ref)) unexpected.push(sheet.name + '!' + ref);
      }
    }
  }
  const report = new Map(workbook.report.fields.map(field => [field.fieldId, field]));
  const counts = { mapped: sesFixedFields.length, written: 0, failed: 0, notWritten: 0, unexpectedChangedCells: unexpected.length };
  for (const field of sesFixedFields) {
    const result = report.get(field.id), want = expected.get(field.id), sheet = field.officialTemplate.sheet, cell = field.officialTemplate.cell;
    const got = producedCells.get(sheet)?.get(cell);
    let status, detail = '';
    if (result?.status === 'written' && result.writtenCells.length === 1 && result.writtenCells[0] === cell && got?.value === want && !got.formula) { status = 'OK'; counts.written++; }
    else if (result?.status === 'written') { status = 'FAIL'; detail = `נמצא "${got?.value ?? ''}" במקום "${want}"`; counts.failed++; }
    else { status = 'FAIL'; detail = 'לא נכתב: ' + (result?.status ?? 'חסר') + (result?.status === 'invalid_value' ? ' (הערך נדחה גם בניסיון השני)' : ''); counts.failed++; }
    rows.push({
      document: 'SES', marker: field.sesFixed.valueKind === 'text' ? marker(serialOf.get(field.id)) : '', testValue: want,
      system: 'SES', systemId: 'SES', section: field.section, question: field.label, fieldId: field.id, controlId: field.id,
      cell: `${sheet}!${cell}`, rowLabel: field.sesFixed.englishLabel, columnHeader: field.sesFixed.englishContext,
      status, detail, qaResult: '', qaLabel: '', qaNote: '',
    });
  }
  if (unexpected.length) counts.unexpectedSample = unexpected.slice(0, 20);
  const legacy = systems.find(system => system.id === 'SES').fields;
  counts.manualTables = legacy.filter(field => field.kind === 'table').length;
  counts.files = legacy.filter(field => field.kind === 'file').length;
  summary.documents.SES = { file: 'SES-marked.xlsx', ...counts };
  console.log('SES', JSON.stringify(counts));
}

// ---------------------------------------------------------------- fields that reach no document
const mappedKeys = new Set(coverage.filter(e => e.fieldId).map(e => (e.systemId ?? 'COORDINATOR') + ':' + e.fieldId));
const unmapped = [];
for (const [systemId, fields] of fieldsOf) {
  if (systemId === 'SES') continue;
  for (const field of fields) if (!mappedKeys.has(systemId + ':' + field.id)) unmapped.push({ system: systemLabel.get(systemId) ?? systemId, systemId, section: field.section, question: field.label, fieldId: field.id, kind: field.kind });
}
const totalFields = [...fieldsOf].filter(([id]) => id !== 'SES').reduce((n, [, fields]) => n + fields.length, 0);
summary.fieldsWithoutExcelCell = { count: unmapped.length, of: totalFields };

// ---------------------------------------------------------------- review workbook
const statusText = { OK: '✓ נכתב לתא הממופה', FAIL: '✗ שגיאה', NOT_WRITTEN: '— לא נכתב אוטומטית', NO_FIXED_MAPPING: '! אין מיפוי קבוע' };
const STYLE = { text: 0, header: 1, ok: 2, fail: 3, warn: 4, muted: 5, title: 6, wrap: 7 };
const statusStyle = { OK: STYLE.ok, FAIL: STYLE.fail, NOT_WRITTEN: STYLE.muted, NO_FIXED_MAPPING: STYLE.warn };

const docSheet = doc => ({
  name: doc, columns: [
    ['מספר בקובץ', 11], ['מערכת', 22], ['פרק', 22], ['השאלה באפליקציה', 46], ['תא ב־Excel', 22],
    ['כותרת השורה בתבנית', 40], ['כותרת העמודה בתבנית', 34], ['בדיקה אוטומטית', 22], ['פירוט', 40],
    ['ביקורת QA (22.11)', 24], ['הערת QA', 40], ['הבדיקה שלי (תואם / לא תואם)', 26], ['הערות', 30], ['מזהה שדה', 24],
  ],
  rows: rows.filter(r => r.document === doc)
    .sort((a, b) => (a.status === 'FAIL' ? -1 : 0) - (b.status === 'FAIL' ? -1 : 0) || a.system.localeCompare(b.system, 'he'))
    .map(r => [
      [r.marker || r.testValue], [r.system], [r.section], [r.question, STYLE.wrap], [r.cell],
      [r.rowLabel, STYLE.wrap], [r.columnHeader, STYLE.wrap], [statusText[r.status], statusStyle[r.status]], [r.detail, STYLE.wrap],
      [r.qaResult === 'NEEDS ENGINEERING REVIEW' ? 'דורש בדיקה הנדסית' : r.qaResult === 'PASS' ? 'עבר' : r.qaResult === 'NOT TESTED' ? 'לא נבדק' : r.qaResult, r.qaResult === 'NEEDS ENGINEERING REVIEW' ? STYLE.warn : STYLE.text],
      [r.qaNote, STYLE.wrap], [''], [''], [r.fieldId],
    ]),
});
const counts = doc => summary.documents[doc];
const summarySheet = {
  name: 'סיכום', columns: [['', 46], ['ESF', 14], ['ASES', 14], ['SES', 14]],
  rows: [
    [['תעודת מיפוי: איפה כל שדה מהאפליקציה נכתב ב־Excel', STYLE.title]],
    [['נוצר מנתונים סינתטיים בלבד, עם מנוע הייצוא האמיתי. ' + summary.generatedAt.slice(0, 10), STYLE.muted]],
    [],
    [['', STYLE.header], ['ESF', STYLE.header], ['ASES', STYLE.header], ['SES', STYLE.header]],
    [['רשומות מיפוי בתבנית'], [counts('ESF').mapped], [counts('ASES').mapped], [counts('SES').mapped]],
    [['✓ נכתבו לתא הממופה ונקראו בחזרה מהקובץ', STYLE.ok], [counts('ESF').written], [counts('ASES').written], [counts('SES').written]],
    [['✗ שגיאות כתיבה', STYLE.fail], [counts('ESF').failed], [counts('ASES').failed], [counts('SES').failed]],
    [['— לא נכתבים אוטומטית (קבצים, הכרעות מיפוי, פרטי קשר)', STYLE.muted], [counts('ESF').notWritten], [counts('ASES').notWritten], [counts('SES').files]],
    [['! טבלאות "תאים נוספים" עם כתובת ידנית (אזורים גדולים, לא חובה)', STYLE.warn], [0], [0], [counts('SES').manualTables]],
    [['תאים אחרים בקובץ שהשתנו בלי הסבר', counts('ESF').unexpectedChangedCells + counts('ASES').unexpectedChangedCells + counts('SES').unexpectedChangedCells ? STYLE.fail : STYLE.ok], [counts('ESF').unexpectedChangedCells], [counts('ASES').unexpectedChangedCells], [counts('SES').unexpectedChangedCells]],
    [],
    [[`שדות באפליקציה שלא נכתבים לאף מסמך רשמי: ${unmapped.length} מתוך ${totalFields} (ללא SES)`, STYLE.warn]],
    [],
    [['איך לבדוק בעצמך', STYLE.header]],
    [['1. פתחו את ESF-marked.xlsx. בכל תא טקסט כתוב מספר כמו #0123.', STYLE.wrap]],
    [['2. חפשו את המספר בגיליון ESF כאן, וקראו מה השאלה באפליקציה.', STYLE.wrap]],
    [['3. השוו לכותרת שהתבנית עצמה כותבת ליד התא. אם השאלה מתאימה לכותרת, המיפוי נכון.', STYLE.wrap]],
    [['4. בתאים מספריים ובבחירה מרשימה מופיע הערך שבעמודה "מספר בקובץ".', STYLE.wrap]],
    [['"✓ נכתב לתא הממופה" מוכיח שהמערכת כותבת לתא שהוגדר. רק בדיקה אנושית מוכיחה שהתא נכון הנדסית.', STYLE.wrap]],
  ],
};
const unmappedSheet = {
  name: 'לא נכתב ל-Excel', columns: [['מערכת', 24], ['פרק', 26], ['השאלה באפליקציה', 50], ['סוג', 10], ['מזהה שדה', 18]],
  rows: unmapped.map(r => [[r.system], [r.section], [r.question, STYLE.wrap], [r.kind], [r.fieldId]]),
};
fs.writeFileSync(path.join(outDir, 'mapping-review.xlsx'), writeXlsx([summarySheet, docSheet('ESF'), docSheet('ASES'), docSheet('SES'), unmappedSheet]));
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(rows.map(({ document, controlId, systemId, fieldId, cell, status, detail }) => ({ document, controlId, systemId, fieldId, cell, status, detail })), null, 2));
console.log('fields without an Excel cell:', unmapped.length, 'of', totalFields);
console.log('written to', path.relative(root, outDir));
const failures = Object.values(summary.documents).reduce((n, d) => n + (d.failed ?? 0) + (d.unexpectedChangedCells ?? 0), 0);
process.exitCode = failures ? 1 : 0;

// ---------------------------------------------------------------- minimal XLSX writer
function writeXlsx(sheets) {
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const files = {};
  const sheetXml = sheet => {
    const cols = sheet.columns.map(([, width], i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join('');
    const header = `<row r="1">${sheet.columns.map(([title], i) => `<c r="${colLetters(i + 1)}1" t="inlineStr" s="${STYLE.header}"><is><t>${esc(title)}</t></is></c>`).join('')}</row>`;
    const isSummary = sheet.name === 'סיכום';
    const body = sheet.rows.map((row, r) => {
      const rowNumber = r + (isSummary ? 1 : 2);
      return `<row r="${rowNumber}">${row.map(([value, style = STYLE.text], c) => {
        if (value === '' || value === undefined || value === null) return style ? `<c r="${colLetters(c + 1)}${rowNumber}" s="${style}"/>` : '';
        const ref = colLetters(c + 1) + rowNumber;
        return typeof value === 'number' ? `<c r="${ref}" s="${style}"><v>${value}</v></c>` : `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
      }).join('')}</row>`;
    }).join('');
    const last = colLetters(sheet.columns.length) + (sheet.rows.length + 1);
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView rightToLeft="1" workbookViewId="0">${isSummary ? '' : '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'}</sheetView></sheetViews><cols>${cols}</cols><sheetData>${isSummary ? '' : header}${body}</sheetData>${isSummary ? '' : `<autoFilter ref="A1:${last}"/>`}</worksheet>`;
  };
  sheets.forEach((sheet, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(sheet)); });
  const fill = rgb => `<fill><patternFill patternType="solid"><fgColor rgb="FF${rgb}"/><bgColor indexed="64"/></patternFill></fill>`;
  files['xl/styles.xml'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="4"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><sz val="11"/><color rgb="FF6B7F84"/><name val="Arial"/></font><font><b/><sz val="15"/><name val="Arial"/></font></fonts>
<fills count="7"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${fill('235B55')}${fill('DFF2E8')}${fill('F8D7D2')}${fill('FCEFD6')}${fill('F1F4F5')}</fills>
<borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="8"><xf fontId="0" fillId="0" applyAlignment="1"><alignment vertical="top"/></xf><xf fontId="1" fillId="2" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf fontId="0" fillId="3" applyFill="1" applyAlignment="1"><alignment vertical="top"/></xf><xf fontId="0" fillId="4" applyFill="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf fontId="0" fillId="5" applyFill="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf fontId="2" fillId="6" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf fontId="3" fillId="0" applyFont="1"/><xf fontId="0" fillId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
  files['xl/workbook.xml'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, i) => `<sheet name="${esc(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${sheets.map((sheet, i) => sheet.name === 'סיכום' ? '' : `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(sheet.name)}'!$A$1:$${colLetters(sheet.columns.length)}$${sheet.rows.length + 1}</definedName></definedNames>`).join('').replace(/<\/definedNames><definedNames>/g, '')}</workbook>`);
  files['xl/_rels/workbook.xml.rels'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  files['_rels/.rels'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  files['[Content_Types].xml'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
  return Buffer.from(zipSync(files, { level: 6 }));
}
