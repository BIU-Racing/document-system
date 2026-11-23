// Re-classifies the audit table after the QA-01/QA-02 fix WITHOUT overwriting the original
// docs/qa/evidence/mapping-results.csv. A FAIL becomes PASS only if the control is an audited
// numeric target AND the re-run physical proof (outputs/excel-proof) wrote it as a number.
// Usage: node scripts/qa/classify-after-fix.cjs   (after `node scripts/prove-excel-export.cjs`)
const fs = require('fs');
const parse = t => { const rows = []; let row = [], cur = '', q = false; for (let i = 0; i < t.length; i++) { const c = t[i]; if (q) { if (c === '"' && t[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; } else if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; } else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; } else cur += c; } return rows; };
const esc = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
const [head, ...rows] = parse(fs.readFileSync('docs/qa/evidence/mapping-results.csv', 'utf8'));
const proofRows = parse(fs.readFileSync('outputs/excel-proof/all-field-results.csv', 'utf8')), ph = proofRows[0];
const proof = new Map(proofRows.slice(1).map(r => Object.fromEntries(ph.map((h, i) => [h, r[i]]))).map(r => [r.controlId || r.fieldId, r]));
const src = fs.readFileSync('lib/official-numeric-targets.ts', 'utf8');
const targets = new Set([...src.matchAll(/controlId: '([^']+)'/g)].map(m => m[1]).concat(['S06', 'S07'].flatMap(s => ['E', 'F', 'G'].map(c => `LC-ASES-${s}-${c}14`))));
const literalFixed = new Set([...src.matchAll(/'(LC-[^']+)': \['None'\]/g)].map(m => m[1]));
const out = [], counts = {};
for (const r of rows) {
  const o = Object.fromEntries(head.map((h, i) => [h, r[i]]));
  const p = proof.get(o.fieldId);
  if (o.result === 'FAIL' && targets.has(o.fieldId) && p?.proof === 'PASS_PHYSICAL_CELL' && /^[0-9.]+$/.test(p.actualValue)) {
    o.result = 'PASS';
    o.explanation = (o.fieldId === 'LC-ESF-S06-D10' ? 'FIXED (QA-02): saved W converted once to kW at export; ' : 'FIXED (QA-01): written as an Excel number; ') + 'template check re-verified (tests/qa-export-semantics.test.mjs, docs/qa/evidence/excel-recalc-after-fix.txt). Engineering sign-off still required.';
  }
  if (o.result === 'FAIL' && literalFixed.has(o.fieldId) && p?.proof === 'PASS_PHYSICAL_CELL') {
    o.result = 'PASS';
    o.explanation = 'FIXED (QA-12): numbers are written as numbers and the template literal "None" is accepted (tests/qa-export-semantics.test.mjs). Engineering sign-off still required.';
  }
  (counts[o.document] ??= {})[o.result] = (counts[o.document][o.result] || 0) + 1;
  out.push(head.map(h => esc(o[h])).join(','));
}
fs.writeFileSync('docs/qa/evidence/mapping-results-after-fix.csv', [head.join(','), ...out].join('\n') + '\n');
console.log(JSON.stringify(counts));
