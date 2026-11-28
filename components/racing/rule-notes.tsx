'use client';
import { RULEBOOK, rulesFor, type RuleResult } from '@/lib/rule-checks';
import { isolateLtr } from '@/lib/bidi';

const icon: Record<RuleResult['status'], string> = { ok: '✓', violation: '✗', notice: '!', pending: '·' };

/** Short headline for a result that has a table; the table carries the numbers. */
function headline(result: RuleResult) {
  if (result.status === 'ok') return `עומד ב־${result.rule}`;
  if (result.status === 'violation') return `חורג מ־${result.rule}`;
  return result.message;
}

function ResultTable({ result }: { result: RuleResult }) {
  return <table className="rule-table">
    <thead><tr><th scope="col"></th><th scope="col">הוזן</th><th scope="col">נדרש</th><th scope="col"><span className="sr-only">תוצאה</span></th></tr></thead>
    <tbody>{result.table!.map(line => <tr key={line.label} className={line.ok ? 'ok' : 'violation'}>
      <th scope="row">{line.label}</th>
      <td dir="ltr">{line.value}</td>
      <td dir="ltr">{line.required}</td>
      <td aria-label={line.ok ? 'עומד' : 'חורג'}>{line.ok ? '✓' : '✗'}</td>
    </tr>)}</tbody>
  </table>;
}

/**
 * The 2027 rule behind a field and the live result of its check. Warnings only; never blocks saving.
 * The rule badge and the result are always visible; the explanation opens on demand.
 */
export function RuleNotes({ systemId, fieldId, results, references = [] }: { systemId: string; fieldId: string; results: RuleResult[]; references?: { rule: string; page: number }[] }) {
  const rules = rulesFor(systemId, fieldId);
  // No automatic check: still show which 2027 sections the field answers to (SES tabs).
  if (!rules.length) return references.length ? <p className="rule-reference" aria-label="סעיפי התקנון של השדה">
    <span>לפי תקנון 2027:</span>
    {references.map(item => <span key={item.rule} className="rule-reference-item" title={isolateLtr(`עמוד ${item.page} בספר החוקים ${RULEBOOK.title}`)}><span className="rule-badge" dir="ltr">{item.rule}</span> <small>{isolateLtr(`עמ' ${item.page}`)}</small></span>)}
  </p> : null;
  const shown = results.filter(result => result.status !== 'pending' || results.every(item => item.status === 'pending'));
  return <div className="rule-notes" aria-label="חוקי התחרות לשדה">
    {rules.map(rule => <details key={rule.rule} className="rule-text">
      <summary><span className="rule-badge" dir="ltr">{rule.rule}</span><span className="rule-more">מה החוק?</span></summary>
      <p>{rule.summary}</p>
      <small>{isolateLtr(`עמוד ${rule.page} בספר החוקים ${RULEBOOK.title}`)}</small>
    </details>)}
    {shown.length > 0 && <ul className="rule-results">
      {shown.map((result, index) => {
        const compact = !!result.table?.length && (result.status === 'ok' || result.status === 'violation');
        return <li key={result.checkId + (result.rowId ?? '') + index} className={`rule-result ${result.status}`} role={result.status === 'violation' ? 'alert' : undefined}>
          <span aria-hidden="true">{icon[result.status]}</span> {compact ? isolateLtr(headline(result)) : result.message}
          {compact && <ResultTable result={result} />}
        </li>;
      })}
    </ul>}
  </div>;
}
