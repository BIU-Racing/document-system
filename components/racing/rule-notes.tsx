'use client';
import { RULEBOOK, rulesFor, type RuleResult } from '@/lib/rule-checks';

const icon: Record<RuleResult['status'], string> = { ok: '✓', violation: '✗', notice: '!', pending: '·' };

/** The 2027 rule behind a field and the live result of its check. Warnings only; never blocks saving. */
export function RuleNotes({ systemId, fieldId, results }: { systemId: string; fieldId: string; results: RuleResult[] }) {
  const rules = rulesFor(systemId, fieldId);
  if (!rules.length) return null;
  const shown = results.filter(result => result.status !== 'pending' || results.every(item => item.status === 'pending'));
  return <div className="rule-notes" aria-label="חוקי התחרות לשדה">
    {rules.map(rule => <p key={rule.rule} className="rule-text">
      <span className="rule-badge" dir="ltr">{rule.rule}</span>
      <span>{rule.summary}</span>
      <small>עמוד <bdi>{rule.page}</bdi> ב־<bdi dir="ltr">{RULEBOOK.title}</bdi></small>
    </p>)}
    {shown.length > 0 && <ul className="rule-results">
      {shown.map((result, index) => <li key={result.checkId + (result.rowId ?? '') + index} className={`rule-result ${result.status}`} role={result.status === 'violation' ? 'alert' : undefined}>
        <span aria-hidden="true">{icon[result.status]}</span> {result.message}
      </li>)}
    </ul>}
  </div>;
}
