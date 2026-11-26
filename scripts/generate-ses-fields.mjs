#!/usr/bin/env node
/**
 * Extracts the single-value input cells of the official SES template into a fixed
 * field-to-cell registry: data/ses-fixed-fields.json.
 *
 *   npm run templates:prepare && node scripts/generate-ses-fields.mjs [--check]
 *
 * Each entry is one input cell: sheet, cell, the English label the template prints next
 * to it, unit, value kind, allowed values (from the cell's own data validation) and the
 * template default. Hebrew labels and visibility conditions are curated separately in
 * data/ses-field-curation.json and merged by lib/ses-fields.ts.
 *
 * Only ranges of up to 12 cells are treated as single-value inputs. Larger editable areas
 * (image canvases, datasheet and test tables) stay on the manual "additional cells" tables
 * until they get their own column mapping.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const templates = JSON.parse(fs.readFileSync('private-data/official-workbook-templates.json', 'utf8'));
const guards = JSON.parse(fs.readFileSync('data/ses-export-guards.json', 'utf8'));
const template = templates.ses;
const parts = unzipSync(Buffer.from(template.base64, 'base64'));
const outFile = 'data/ses-fixed-fields.json';

const decode = text => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&');
const colNumber = letters => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const colLetters = n => { let s = ''; while (n) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); } return s; };
const parseRef = ref => { const m = /^\$?([A-Z]{1,3})\$?([1-9]\d*)$/.exec(ref); return m ? { col: colNumber(m[1]), row: Number(m[2]) } : null; };
function expand(range) {
  const [a, b = a] = range.split(':'), from = parseRef(a), to = parseRef(b);
  if (!from || !to) return [];
  const out = [];
  for (let row = from.row; row <= to.row; row++) for (let col = from.col; col <= to.col; col++) out.push(colLetters(col) + row);
  return out;
}

const shared = (() => {
  const xml = parts['xl/sharedStrings.xml'] ? strFromU8(parts['xl/sharedStrings.xml']) : '';
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => decode([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join('')));
})();
const workbookXml = strFromU8(parts['xl/workbook.xml']);
const workbookSheets = [...workbookXml.matchAll(/<sheet\b[^>]*\bname="([^"]+)"/g)].map(m => decode(m[1]));
const definedNames = new Map(), localNames = new Map();
for (const m of workbookXml.matchAll(/<definedName\b([^>]*)>([^<]*)<\/definedName>/g)) {
  const name = /name="([^"]+)"/.exec(m[1])[1], local = /localSheetId="(\d+)"/.exec(m[1]);
  if (local) localNames.set(`${workbookSheets[Number(local[1])]}!${name}`, decode(m[2]));
  else definedNames.set(name, decode(m[2]));
}

const sheetCache = new Map();
function readSheet(name) {
  if (sheetCache.has(name)) return sheetCache.get(name);
  const meta = template.sheets.find(sheet => sheet.name === name);
  const xml = strFromU8(parts[meta.path]);
  const cells = new Map();
  for (const match of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const ref = /\br="([A-Z]+\d+)"/.exec(match[1])?.[1]; if (!ref) continue;
    const type = /\bt="([^"]+)"/.exec(match[1])?.[1], body = match[2] ?? '';
    const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
    let value = null;
    if (type === 'inlineStr') value = decode([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join(''));
    else if (type === 's') value = shared[Number(v)] ?? null;
    else if (type === 'b') value = v === '1';
    else if (v !== undefined) value = type === 'str' || type === 'e' ? decode(v) : Number(v);
    cells.set(ref, { value, formula: /<f\b/.test(body) });
  }
  const merged = [...xml.matchAll(/<mergeCell ref="([A-Z]+\d+(?::[A-Z]+\d+)?)"/g)].map(m => m[1]);
  const validations = [...xml.matchAll(/<dataValidation\b([^>]*)>([\s\S]*?)<\/dataValidation>/g)].map(m => ({
    type: /\btype="([^"]+)"/.exec(m[1])?.[1] ?? 'any',
    sqref: (/\bsqref="([^"]+)"/.exec(m[1])?.[1] ?? '').split(/\s+/).filter(Boolean),
    formula1: decode(/<formula1>([\s\S]*?)<\/formula1>/.exec(m[2])?.[1] ?? ''),
  }));
  // Excel 2010+ stores validations that point at other sheets in an extension block.
  for (const m of xml.matchAll(/<x14:dataValidation\b([^>]*)>([\s\S]*?)<\/x14:dataValidation>/g)) validations.push({
    type: /\btype="([^"]+)"/.exec(m[1])?.[1] ?? 'any',
    sqref: (/<xm:sqref>([^<]*)<\/xm:sqref>/.exec(m[2])?.[1] ?? '').split(/\s+/).filter(Boolean),
    formula1: decode(/<x14:formula1>\s*<xm:f>([\s\S]*?)<\/xm:f>/.exec(m[2])?.[1] ?? ''),
  });
  const sheet = { cells, merged, validations };
  sheetCache.set(name, sheet);
  return sheet;
}

/** Resolves a list validation to its literal options, or null when it is computed. */
function listOptions(formula, currentSheet) {
  if (!formula) return null;
  if (/^".*"$/.test(formula)) return formula.slice(1, -1).split(',').map(item => item.trim()).filter(Boolean);
  let target = formula.replace(/^=/, '');
  const scoped = /^'?([^'!]+)'?!([A-Za-z_][\w.]*)$/.exec(target);
  if (scoped && localNames.has(`${scoped[1]}!${scoped[2]}`)) target = localNames.get(`${scoped[1]}!${scoped[2]}`).replace(/^=/, '');
  else if (localNames.has(`${currentSheet}!${target}`)) target = localNames.get(`${currentSheet}!${target}`).replace(/^=/, '');
  else if (definedNames.has(target)) target = definedNames.get(target).replace(/^=/, '');
  const match = /^(?:'?([^'!]+)'?!)?(\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?)$/.exec(target);
  if (!match) return null;
  const sheetName = match[1] ?? currentSheet;
  if (!template.sheets.some(sheet => sheet.name === sheetName)) return null;
  const source = readSheet(sheetName);
  const values = expand(match[2].replace(/\$/g, '')).map(ref => source.cells.get(ref)).filter(cell => cell && !cell.formula && cell.value !== null && cell.value !== '').map(cell => String(cell.value).trim());
  return values.length ? [...new Set(values)] : null;
}

const clean = text => text.replace(/\s+/g, ' ').trim();
/** A label is template text, not a value: option values ("Steel", "Round") and arrow hints are skipped. */
const isLabel = (cell, optionValues) => cell && !cell.formula && typeof cell.value === 'string' && /[A-Za-z]/.test(cell.value)
  && !/^\s*-?\d+(\.\d+)?\s*$/.test(cell.value) && !/^\s*<-/.test(cell.value) && !/^\s*(N\/?A|Steel|Round|Square|Yes|No)\s*$/i.test(cell.value) && !optionValues.has(clean(cell.value).toLowerCase());
function rowLabel(sheet, ref, inputs, optionValues) {
  const p = parseRef(ref);
  for (let col = p.col - 1; col >= 1; col--) {
    const at = colLetters(col) + p.row;
    if (inputs.has(at)) continue;
    if (isLabel(sheet.cells.get(at), optionValues)) return clean(sheet.cells.get(at).value);
  }
  return '';
}
function columnHeader(sheet, ref, inputs, optionValues, label) {
  const p = parseRef(ref);
  for (let row = p.row - 1; row >= Math.max(1, p.row - 12); row--) {
    const at = colLetters(p.col) + row;
    if (inputs.has(at)) continue;
    const cell = sheet.cells.get(at);
    if (isLabel(cell, optionValues) && clean(cell.value) !== label) return clean(cell.value);
  }
  return '';
}
/** Editable cells that are links or the start of an image area, not values. */
const SKIP = new Set(['EV5.5.1&2 EV4.4 ACPS TSPS Rear!B38', 'EV5.5.1&2 EV4.4 ACPS TSPS Rear!B39', 'EV5.5.1&2 EV4.4 ACPS TSPS Rear!B40', 'EV5.5.1&2 EV4.4 ACPS TSPS Rear!C38', 'EV5.5.1&2 EV4.4 ACPS TSPS Rear!C39']);
const NOISE_HEADERS = /^(BACK to COVER SHEET|University Name|Car No\.\(s\) & Event\(s\)|Round|N\/A|CAD Screenshots.*)$/;
const UNITS = new Set(['mm', 'm', 'cm', 'n', 'kn', 'mpa', 'gpa', 'pa', 'kg', 'g', '%', '°', 'deg', 'mm²', 'mm^2', 'mm2', 'nm', 'n.m', 'j', 'kj', 'n/mm', 'kg/m3', 'kg/m³', 'g/cm3']);
function unitFrom(label) {
  const candidates = [/\[([^\]]{1,12})\]\s*$/, /,\s*([^,()\[\]]{1,8})\s*$/, /\(([^()]{1,8})\)\s*$/];
  for (const pattern of candidates) {
    const match = pattern.exec(label);
    if (match && UNITS.has(match[1].trim().toLowerCase())) return match[1].trim();
  }
  return null;
}

const fields = [];
for (const guard of guards) {
  if (!guard.editableRanges?.length) continue;
  const sheet = readSheet(guard.sheet);
  const meta = template.sheets.find(item => item.name === guard.sheet);
  const writable = new Set(meta.writableCells);
  const formula = new Set(guard.formulaCellsInsideEditableRanges);
  const mergedNonAnchor = new Set();
  for (const range of sheet.merged) expand(range).slice(1).forEach(ref => mergedNonAnchor.add(ref));
  // A range is a set of single-value inputs when it has at most 12 cells once merged blocks count as one.
  const anchors = range => expand(range).filter(ref => !mergedNonAnchor.has(ref));
  const scalarRanges = guard.editableRanges.filter(range => anchors(range).length <= 12);
  const inputs = new Set(scalarRanges.flatMap(expand));
  const validationFor = ref => sheet.validations.find(item => item.sqref.some(sq => expand(sq).includes(ref)));
  const optionValues = new Set();
  for (const ref of inputs) {
    const validation = validationFor(ref);
    for (const option of validation?.type === 'list' ? listOptions(validation.formula1, guard.sheet) ?? [] : []) optionValues.add(option.toLowerCase());
  }
  // Name slots: free-text inputs whose template value is a placeholder ("Layup 5", "OTHER LAMINATE 4",
  // "Your Material 13"). They title a repeated panel; the panel's other inputs take that title as context.
  const candidates = [...new Set(scalarRanges.flatMap(anchors))].filter(ref => writable.has(ref) && !formula.has(ref) && !sheet.cells.get(ref)?.formula);
  const nameSlots = new Set(candidates.filter(ref => {
    const value = sheet.cells.get(ref)?.value, validation = validationFor(ref);
    return typeof value === 'string' && /[A-Za-z]/.test(value) && validation?.type !== 'list' && /\d\s*(etc\.)?\s*$|^please name/i.test(clean(value));
  }));
  const rowCounts = new Map();
  for (const ref of nameSlots) { const row = parseRef(ref).row; rowCounts.set(row, (rowCounts.get(row) ?? 0) + 1); }
  const titleRow = [...rowCounts].sort((a, b) => b[1] - a[1])[0]?.[0];
  const panelTitle = ref => {
    if (!titleRow) return '';
    const p = parseRef(ref);
    for (let col = p.col; col >= 1; col--) {
      const cell = sheet.cells.get(colLetters(col) + titleRow);
      if (cell && !cell.formula && typeof cell.value === 'string' && /[A-Za-z]/.test(cell.value)) return clean(cell.value).replace(/^please name (your )?/i, '').replace(/\s*etc\.?$/i, '');
    }
    return '';
  };
  for (const ref of candidates) {
    if (SKIP.has(`${guard.sheet}!${ref}`)) continue;
    const placeholder = nameSlots.has(ref);
    let label = placeholder ? 'Name' : rowLabel(sheet, ref, inputs, optionValues);
    let header = placeholder ? '' : columnHeader(sheet, ref, inputs, optionValues, label);
    if (NOISE_HEADERS.test(header)) header = '';
    if (!label && header) { label = header; header = ''; }
    const panel = panelTitle(ref);
    const validation = validationFor(ref);
    const options = validation?.type === 'list' ? listOptions(validation.formula1, guard.sheet) : null;
    const current = sheet.cells.get(ref)?.value ?? null;
    const unit = unitFrom(label);
    const numeric = validation && ['decimal', 'whole'].includes(validation.type);
    const valueKind = options ? 'select' : numeric || typeof current === 'number' || unit ? 'number' : 'text';
    fields.push({
      sheet: guard.sheet, cell: ref, label, columnHeader: header, ...(panel ? { panel } : {}), unit, valueKind,
      ...(options ? { options } : {}),
      ...(validation?.type === 'list' && !options ? { computedList: validation.formula1 } : {}),
      ...(validation && validation.type !== 'list' ? { validation: validation.type } : {}),
      templateValue: current === null || current === '' ? null : current,
    });
  }
}
const output = JSON.stringify({ template: template.filename, sha256: template.sha256, generatedBy: 'scripts/generate-ses-fields.mjs', fields }, null, 1) + '\n';
if (process.argv.includes('--check')) {
  const saved = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : '';
  if (saved !== output) { console.error('data/ses-fixed-fields.json is stale. Run node scripts/generate-ses-fields.mjs.'); process.exitCode = 1; }
  else console.log(`SES fixed fields are current (${fields.length}).`);
} else {
  fs.writeFileSync(outFile, output);
  const bySheet = {};
  for (const field of fields) bySheet[field.sheet] = (bySheet[field.sheet] ?? 0) + 1;
  console.log(`${fields.length} single-value SES inputs`, bySheet);
  console.log('kinds', fields.reduce((acc, f) => ({ ...acc, [f.valueKind]: (acc[f.valueKind] ?? 0) + 1 }), {}), 'unlabeled', fields.filter(f => !f.label).length);
}
