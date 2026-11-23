// Runs the app's REAL local translation path in Node, mirroring lib/translation.worker.ts:
// prepareTranslation -> OPUS-MT (same model id, revision, q8) -> restoreTranslation -> validateLocalTranslation rules.
// Usage: node run-translation.mjs <repo> <scratch>
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const [repo, scratch] = process.argv.slice(2);
const require = createRequire(path.join(repo, 'package.json'));
const tf = await import(path.join(repo, 'node_modules/@huggingface/transformers/dist/transformers.node.cjs')); const { pipeline, env } = tf.default ?? tf;
const lt = await import(path.join(repo, 'lib/local-translation.mjs'));
const cfg = fs.readFileSync(path.join(repo, 'lib/local-translation-config.ts'), 'utf8');
const MODEL_ID = /LOCAL_MODEL_ID='([^']+)'/.exec(cfg)[1], REVISION = /LOCAL_MODEL_REVISION='([^']+)'/.exec(cfg)[1];
env.allowLocalModels = false; env.cacheDir = path.join(scratch, 'hf-cache');
const cases = JSON.parse(fs.readFileSync(path.join(scratch, 'translation-cases.json'), 'utf8'));
// Long answer: 10 sentences joined, then split exactly like makeTranslationPlan (500 chars).
const long = null;

function splitText(text) { // copy of lib/translation-content.ts splitText
  const parts = []; let remaining = text;
  while (remaining.length > 500) { let cut = Math.max(remaining.lastIndexOf('\n', 500), remaining.lastIndexOf('. ', 500)); if (cut < 120) cut = remaining.lastIndexOf(' ', 500); if (cut < 1) cut = 500; else cut++; parts.push(remaining.slice(0, cut)); remaining = remaining.slice(cut); }
  if (remaining) parts.push(remaining); return parts;
}
const t0 = Date.now();
const translate = await pipeline('translation', MODEL_ID, { revision: REVISION, dtype: 'q8', device: 'cpu' });
console.log('model loaded in', ((Date.now() - t0) / 1000).toFixed(1), 's');
async function workerTranslate(text) { // mirrors translation.worker.ts onmessage
  if (!lt.needsTranslation(text)) return { text, masked: text, raw: text };
  const prepared = lt.prepareTranslation(text);
  let output = prepared.text;
  if (lt.needsTranslation(output)) output = (await translate(prepared.text, { max_new_tokens: 256, do_sample: false }))[0]?.translation_text ?? '';
  const restored = lt.restoreTranslation(prepared, output);
  if (!restored.ok) return { error: 'PROTECTED_TEXT_CHANGED', failures: restored.failures, masked: prepared.text, raw: output };
  // validateLocalTranslation (lib/local-translation-validation.ts)
  const v = lt.validateLiterals(text, restored.text);
  if (!restored.text.trim() || restored.text.length > Math.max(2000, text.length * 6) || !v.ok) return { error: 'INVALID_LOCAL_TRANSLATION', failures: v.failures, masked: prepared.text, raw: output };
  return { text: restored.text, masked: prepared.text, raw: output };
}
const results = [];
for (const c of cases) {
  const chunks = splitText(c.he), pieces = [];
  const start = Date.now();
  for (const chunk of chunks) pieces.push(await workerTranslate(chunk));
  const failed = pieces.find(p => p.error);
  results.push({ ...c, chunks: chunks.length, ms: Date.now() - start, english: failed ? null : pieces.map(p => p.text).join(''), error: failed?.error, failures: failed?.failures, masked: pieces.map(p => p.masked), raw: pieces.map(p => p.raw) });
  console.log(c.id, failed ? 'REJECTED ' + failed.error + ' ' + JSON.stringify(failed.failures) : 'OK', '|', failed ? pieces.map(p => p.raw).join(' ') : results.at(-1).english);
}
// Determinism: run a subset twice.
const again = [];
for (const c of cases.slice(0, 5)) { const r = await workerTranslate(c.he); again.push(r.text ?? r.error); }
fs.writeFileSync(path.join(scratch, 'translation-results-batch2.json'), JSON.stringify({ model: `${MODEL_ID}@${REVISION}:q8`, runAt: new Date().toISOString(), deterministicRepeat: again.every((t, i) => t === (results[i].english ?? results[i].error)), results }, null, 1));
console.log('determinism', again.every((t, i) => t === (results[i].english ?? results[i].error)));
