'use client';
import { useMemo, useState } from 'react';
import type { DocumentReadiness, ReadinessIssue, ReadinessReason, DocumentBlockerCode } from '@/lib/export-readiness';
import styles from './readiness-panel.module.css';

export const reasonLabels: Record<ReadinessReason, string> = {
  missing: 'חסרה תשובה',
  unknown: 'מסומן "לא ידוע"',
  invalid_value: 'ערך שאינו מתאים לתא',
  overflow: 'יותר שורות ממה שיש בתבנית',
  source_mismatch: 'התרגום אינו תואם לגרסה השמורה',
  translation_failed: 'התרגום נכשל',
  translation_pending: 'ממתין לתרגום',
  source_review: 'תוכן מיובא שטרם אושר',
  engineering_review: 'טרם אושר הנדסית',
  translation_approval: 'תרגום שטרם אושר',
  mapping_unresolved: 'המיפוי לתא דורש הכרעה',
  not_applicable_reason: '"לא רלוונטי" ללא נימוק',
  evidence_placement: 'ראיה שיש לשבץ ידנית ב־Excel',
  restricted_manual: 'פרטי קשר שממולאים ידנית',
  manual_cell_address: 'כתובת תא שהוקלדה ידנית',
};

const reasonHelp: Partial<Record<ReadinessReason, string>> = {
  translation_approval: 'פתחו את השדה, קראו את האנגלית מול העברית ואשרו או תקנו. אישור מתבטל אוטומטית כשהעברית משתנה.',
  engineering_review: 'בודק הנדסי או רכז צריכים לאשר את התשובה הנוכחית. כל שינוי בתשובה מבטל אישור קודם.',
  mapping_unresolved: 'השדה נשמר, אך הכתיבה שלו לתבנית דורשת הכרעה במיפוי. זו משימת פיתוח או רכז, לא של ממלא השדה.',
  manual_cell_address: 'ב־SES, שורה ב"תאים נוספים" נכתבת לכתובת שהוקלדה. יש לוודא בגיליון שזה התא הנכון, או להעביר את הערך לשאלה קבועה אם קיימת.',
  invalid_value: 'למשל מספר עם יחידה או טקסט בתא מספרי. יש להשאיר מספר בלבד ולהעביר פירוט להערות.',
};

const blockerText: Record<DocumentBlockerCode, string> = {
  template_unverified: 'התבנית בקוד לא אומתה עדיין כתבנית ההגשה הרשמית לתחרות 2027.',
  partial_scope: 'המסמך נבנה רק מהמערכות שבהרשאה שלכם. רק רכז עם גישה לכל המערכות יכול לאמת מסמך שלם.',
};

type Filter = 'all' | 'blocker' | 'warning' | ReadinessReason;
const PAGE = 40;

function fieldHref(issue: ReadinessIssue) {
  if (!issue.systemId || !issue.fieldId) return null;
  return `/?${new URLSearchParams({ system: issue.systemId, field: issue.fieldId }).toString()}`;
}

function matches(issue: ReadinessIssue, filter: Filter) {
  if (filter === 'all') return true;
  if (filter === 'blocker' || filter === 'warning') return issue.level === filter;
  return issue.reasons.includes(filter);
}

function IssueRow({ issue }: { issue: ReadinessIssue }) {
  const href = fieldHref(issue);
  return <li className={styles.issue} data-level={issue.level}>
    <div className={styles.issueMain}>
      <strong><bdi>{issue.fieldLabel}</bdi></strong>
      <span className={styles.issueMeta}>
        {issue.section && <bdi>{issue.section}</bdi>}
        <span dir="ltr" className={styles.cellRef}>{issue.sheet}!{issue.ranges.join(', ')}</span>
      </span>
      <ul className={styles.reasons} aria-label="סיבות">
        {issue.reasons.map(reason => <li key={reason} data-reason={reason}>{reasonLabels[reason]}</li>)}
      </ul>
    </div>
    {href && <a className={styles.open} href={href}>מעבר לשדה <span aria-hidden="true">←</span></a>}
  </li>;
}

function SystemGroup({ label, issues, defaultOpen }: { label: string; issues: ReadinessIssue[]; defaultOpen: boolean }) {
  const [shown, setShown] = useState(PAGE);
  const blockers = issues.filter(issue => issue.level === 'blocker').length;
  return <details className={styles.group} open={defaultOpen}>
    <summary>
      <bdi>{label || 'שדות כלליים'}</bdi>
      <span className={styles.groupCounts}>
        {blockers > 0 && <span data-level="blocker">{blockers} חוסמים</span>}
        {issues.length - blockers > 0 && <span data-level="warning">{issues.length - blockers} אזהרות</span>}
      </span>
    </summary>
    <ul className={styles.issues}>{issues.slice(0, shown).map(issue => <IssueRow key={issue.key} issue={issue} />)}</ul>
    {issues.length > shown && <button type="button" className={styles.more} onClick={() => setShown(value => value + PAGE)}>
      הצגת עוד {Math.min(PAGE, issues.length - shown)} מתוך {issues.length - shown} שנותרו
    </button>}
  </details>;
}

export function ReadinessPanel({ readiness }: { readiness: DocumentReadiness }) {
  const [filter, setFilter] = useState<Filter>('all');
  const { totals } = readiness;

  const reasonCounts = useMemo(() => {
    const counts = new Map<ReadinessReason, number>();
    for (const issue of readiness.issues) for (const reason of issue.reasons) counts.set(reason, (counts.get(reason) ?? 0) + 1);
    return (Object.keys(reasonLabels) as ReadinessReason[]).filter(reason => counts.has(reason)).map(reason => ({ reason, count: counts.get(reason)! }));
  }, [readiness]);

  const groups = useMemo(() => {
    const map = new Map<string, { label: string; issues: ReadinessIssue[] }>();
    for (const issue of readiness.issues) {
      if (!matches(issue, filter)) continue;
      const key = issue.systemId ?? '';
      const group = map.get(key) ?? { label: issue.systemLabel, issues: [] };
      group.issues.push(issue);
      map.set(key, group);
    }
    return [...map.entries()];
  }, [readiness, filter]);

  const help = filter !== 'all' && filter !== 'blocker' && filter !== 'warning' ? reasonHelp[filter] : undefined;
  const readyPercent = totals.items ? Math.floor((totals.ready * 100) / totals.items) : 0;

  return <section className={styles.panel} aria-labelledby="readiness-title" data-state={readiness.state}>
    <div className={styles.head}>
      <div>
        <span className={styles.badge} data-state={readiness.state}>{readiness.ready ? 'מאומת להגשה' : 'טיוטה · לא מוכן להגשה'}</span>
        <h2 id="readiness-title">בדיקת מוכנות להגשה</h2>
        <p className={styles.lead}>
          {readiness.ready
            ? 'כל השדות במסמך מולאו, אושרו ותואמים לתבנית. ההורדה תסומן כמסמך מאומת.'
            : 'אפשר להוריד טיוטה בכל שלב. קובץ מאומת יהיה זמין רק כשלא יישאר אף פריט חוסם.'}
        </p>
      </div>
      <dl className={styles.totals}>
        <div data-level="blocker"><dt>חוסמים</dt><dd>{totals.blockers}</dd></div>
        <div data-level="warning"><dt>אזהרות</dt><dd>{totals.warnings}</dd></div>
        <div data-level="ready"><dt>מוכנים</dt><dd>{totals.ready}<small> / {totals.items}</small></dd></div>
      </dl>
    </div>
    <div className={styles.meter} role="img" aria-label={`${readyPercent}% מהשדות מוכנים`}><span style={{ inlineSize: `${readyPercent}%` }} /></div>

    {readiness.documentBlockers.length > 0 && <ul className={styles.documentBlockers} aria-label="חסמים ברמת המסמך">
      {readiness.documentBlockers.map(blocker => <li key={blocker.code}>{blockerText[blocker.code]}</li>)}
    </ul>}

    {!!readiness.ruleWarnings?.length && <div className={styles.rules} aria-label="תקנון 2027">
      <strong>תקנון 2027: {readiness.ruleWarnings.filter(item => item.status === 'violation').length} חריגות, {readiness.ruleWarnings.filter(item => item.status === 'notice').length} לבדיקה</strong>
      <ul>{readiness.ruleWarnings.map((item, index) => <li key={item.checkId + (item.rowId ?? '') + index} data-status={item.status}>
        <span className={styles.ruleBadge} dir="ltr">{item.rule}</span>
        <span><bdi>{item.systemLabel}</bdi> · <bdi>{item.fieldLabel}</bdi>: {item.message}</span>
        <a href={`/?${new URLSearchParams({ system: item.systemId, field: item.fieldId }).toString()}`}>מעבר לשדה <span aria-hidden="true">←</span></a>
      </li>)}</ul>
    </div>}

    {readiness.issues.length > 0 && <>
      <div className={styles.filters} role="group" aria-label="סינון לפי סוג">
        {([['all', 'הכול', readiness.issues.length], ['blocker', 'חוסמים', totals.blockers], ['warning', 'אזהרות', totals.warnings]] as const).map(([value, label, count]) =>
          <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label} <bdi>{count}</bdi></button>)}
        <span className={styles.divider} aria-hidden="true" />
        {reasonCounts.map(({ reason, count }) =>
          <button key={reason} type="button" data-reason={reason} aria-pressed={filter === reason} onClick={() => setFilter(filter === reason ? 'all' : reason)}>{reasonLabels[reason]} <bdi>{count}</bdi></button>)}
      </div>
      {help && <p className={styles.help}>{help}</p>}
      <div className={styles.groups}>
        {groups.map(([key, group], index) => <SystemGroup key={`${filter}:${key}`} label={group.label} issues={group.issues} defaultOpen={index === 0 && groups.length <= 3} />)}
      </div>
    </>}
  </section>;
}
