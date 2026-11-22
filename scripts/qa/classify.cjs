// Combines: physical proof CSV (app export re-read), independent template context (openpyxl),
// formula dependencies, unit check and manual semantic review flags -> PASS / FAIL / NEEDS ENGINEERING REVIEW / NOT TESTED.
// Usage: node classify.cjs <repo> <scratch>
const fs = require('fs'), path = require('path');
const [repo, scratch] = process.argv.slice(2);
const ctx = JSON.parse(fs.readFileSync(path.join(scratch, 'template-context.json')));
const deps = JSON.parse(fs.readFileSync(path.join(scratch, 'formula-deps.json')));
const parseCsv = t => { const rows = []; let row = [], cur = '', q = false; for (let i = 0; i < t.length; i++) { const c = t[i]; if (q) { if (c === '"' && t[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; } else if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; } else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; } else cur += c; } return rows; };
const csvRows = parseCsv(fs.readFileSync(path.join(repo, 'outputs/excel-proof/all-field-results.csv'), 'utf8'));
const head = csvRows[0]; const proof = new Map(csvRows.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, r[i]]))).map(r => [r.controlId || r.fieldId, r]));
const ses = JSON.parse(fs.readFileSync(path.join(repo, 'data/systems.normalized.json'))).find(s => s.id === 'SES').fields;
// --- Independently found problems (see report for evidence) ---
const UNIT_FAIL = { 'LC-ESF-S06-D10': 'Template unit is kW (Charging!E10); app prompt says "write in W". 6600 W would be read as 6600 kW.' };
const OTHER_FAIL = { 'LC-ESF-Datasheets-resistors-H': 'Template header says Enter "None" if no heatsink; app forces a number, so "None" can only become invalid_value (empty cell).' };
const MANUAL_REVIEW = {
  'LC-ESF-S04-P26': 'Second cell (column P, header "cells") duplicates the O26 question; meaning of P column unclear.',
  'LC-ESF-S04-P27': 'Second cell (column P) duplicates the O27 question; meaning of P column unclear.',
  'LC-ASES-S05-S14': 'Metallic thickness chart cell; feeds E13 thickness via IF(E12="Other",S8,S14); written as text.',
  'LC-ASES-S05-S15': 'Metallic thickness chart cell; feeds E37; written as text.',
  'LC-ASES-S05-S16': 'Metallic thickness chart cell; feeds E61; written as text.',
  'LC-ASES-S05-S17': 'Metallic thickness chart cell; feeds E85; written as text.',
  'LC-ASES-CELL-M28-LOCKED-REVIEW': 'Locked template cell flagged by the project itself.',
};
const labelFlag = /יש לברר|יש להשלים|ניסוח ישן|חסר בתבנית|נדרש ביר|הכפילות|ב־2027|לפי תקנו/;
const numericCompare = (cell, formulas) => formulas.some(f => {
  const body = f.split(': ').slice(1).join(': ').replace(/ISBLANK\([^)]*\)|COUNTBLANK\([^)]*\)/g, '').replace(/(?:'[^']+'!)?\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?\s*>\s*0(?![.\d])/g, '');
  const c = cell.replace(/(\d+)/, '\\$?$1');
  return new RegExp(`(?<![A-Z$])\\$?${c}(?!\\d)\\s*(?:[<>]=?|=\\s*\\d)|(?:[<>]=?)\\s*\\$?${c}(?!\\d)|SUMPRODUCT\\([^)]*${c}`).test(body);
});
const out = [];
for (const x of ctx) {
  const p = proof.get(x.id) || {};
  const cell = x.ranges[0].split(':')[0];
  const where = `${x.sheet}!${x.ranges.join(',').slice(0, 40)}`;
  const tplLabel = [x.rowLabel[0], x.columnHeader[0]].filter(Boolean).join(' / ');
  let result, why;
  const d = deps[x.id];
  const textTyped = !['number_with_unit_and_source', 'select', 'file_upload_with_caption', 'linked_record_picker'].includes(x.schemaType);
  if (x.schemaType === 'file_upload_with_caption' || x.kind === 'file') { result = 'NOT TESTED'; why = 'Evidence/file: not embedded in the workbook automatically (status evidence_required).'; }
  else if (/^LC-ASES-S04-[DN]1[67]$/.test(x.id)) { result = 'NOT TESTED'; why = 'Restricted contact detail: never auto-filled.'; }
  else if (UNIT_FAIL[x.id]) { result = 'FAIL'; why = UNIT_FAIL[x.id]; }
  else if (OTHER_FAIL[x.id]) { result = 'FAIL'; why = OTHER_FAIL[x.id]; }
  else if (textTyped && d && p.proof === 'PASS_PHYSICAL_CELL' && numericCompare(cell, d.formulas)) { result = 'FAIL'; why = `Numeric quantity exported as TEXT into a cell that a template check compares numerically (${d.formulas[0].split(': ')[0]}). Excel compares text > any number, so the PASS/FAIL result is wrong. Proven in Excel for PrechargeDischarge!D14 and Accumulator!O24.`; }
  else if (x.schemaType === 'linked_record_picker') { result = 'NEEDS ENGINEERING REVIEW'; why = 'Linked picker (reference to another table row): exporter returns manual_mapping and writes nothing.'; }
  else if (MANUAL_REVIEW[x.id]) { result = 'NEEDS ENGINEERING REVIEW'; why = MANUAL_REVIEW[x.id]; }
  else if (p.proof === 'REQUIRES_MANUAL_MAPPING') { result = 'NEEDS ENGINEERING REVIEW'; why = 'Exporter returns manual_mapping; nothing written.'; }
  else if (MANUAL_REVIEW[x.id]) { result = 'NEEDS ENGINEERING REVIEW'; why = MANUAL_REVIEW[x.id]; }
  else if (labelFlag.test(x.label || '')) { result = 'NEEDS ENGINEERING REVIEW'; why = 'The app question itself says the meaning/rule must be clarified or completed.'; }
  else if (p.proof === 'PASS_PHYSICAL_CELL') { result = 'PASS'; why = 'Template label next to the cell matches the question (independent openpyxl read + manual review) and the value was physically written and re-read.' + (x.numberFormat === '@' && x.schemaType === 'number_with_unit_and_source' ? ' Note: template cell format is Text (@) while a number is written.' : ''); }
  else { result = 'NOT TESTED'; why = `Not on the automatic write path (proof: ${p.proof || 'n/a'}, status ${p.status || 'n/a'}).`; }
  out.push({ document: x.doc, fieldId: x.id, systemId: x.systemId, description: x.label, templateLabel: tplLabel, expected: `${x.sheet}!${cell}`, actual: p.cell ? `${x.sheet}!${p.cell.split(';')[0]}${p.cell.includes(';') ? ' (+rows)' : ''}` : (p.proof === 'PASS_PHYSICAL_CELL' ? where : 'not written'), schemaType: x.schemaType, result, explanation: why });
}
for (const f of ses) {
  const m = f.officialTemplate || {};
  out.push({ document: 'SES', fieldId: f.id, systemId: 'SES', description: f.label, templateLabel: '', expected: 'no fixed cell (user types a cell address inside ' + (m.editableRanges || []).join(',').slice(0, 40) + ')', actual: 'user-selected', schemaType: f.kind, result: f.kind === 'file' ? 'NOT TESTED' : 'NEEDS ENGINEERING REVIEW', explanation: f.kind === 'file' ? 'Evidence/file: not embedded automatically.' : 'No fixed field-to-cell mapping exists; the user chooses any writable cell in the sheet, so semantic correctness cannot be verified. Numeric-looking text is converted to a number (e.g. "007" -> 7).' });
}
const counts = {}; for (const r of out) { counts[r.document] ??= {}; counts[r.document][r.result] = (counts[r.document][r.result] || 0) + 1; }
const esc = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
const cols = Object.keys(out[0]);
fs.writeFileSync(path.join(scratch, 'mapping-results.csv'), [cols.join(','), ...out.map(r => cols.map(c => esc(r[c])).join(','))].join('\n') + '\n');
fs.writeFileSync(path.join(scratch, 'mapping-results.json'), JSON.stringify({ counts, rows: out }, null, 1));
console.log(JSON.stringify(counts, null, 1));
for (const r of out.filter(r => r.result === 'FAIL')) console.log('FAIL', r.document, r.fieldId, r.expected, '|', r.description, '|', r.explanation.slice(0, 110));
