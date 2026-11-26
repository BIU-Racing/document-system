'use client';
import { useEffect, useMemo, useState } from 'react';
import { subscribeLocalTranslation, type LocalTranslationState } from '@/lib/browser-translation';
import { approvalState, englishPrint, needsTranslation } from '@/lib/translation-review';
import { checkAnswerTranslation } from '@/lib/translation-checks';
import { canonical, type Answer, type Review } from '@/lib/progress';

type Props = {
  systemId: string; fieldId: string; revision: number;
  /** The answer as saved on the server (approval is always for a saved version). */
  saved?: Answer;
  /** The answer currently in the editor, possibly not saved yet. */
  local?: Answer;
  review?: Review; readOnly: boolean; canEdit: boolean; busy: boolean;
  onApprove: (englishFingerprint: string) => void;
  onSaveEnglish: (english: string) => void;
  onRevoke: () => void;
};

const roleLabel: Record<string, string> = { coordinator: 'רכז', reviewer: 'בודק הנדסי', contributor: 'צוות' };
const dateLabel = (iso: string) => { try { return new Date(iso).toLocaleDateString('he-IL'); } catch { return iso; } };

function EnglishValue({ value }: { value: Answer['value'] }) {
  if (typeof value === 'string') return <p className="translation-english" dir="ltr">{value}</p>;
  return <table className="translation-english-table" dir="ltr"><tbody>{value.map((row, index) => <tr key={row._id || index}>{Object.entries(row).filter(([key]) => key !== '_id').map(([key, cell]) => <td key={key}>{cell}</td>)}</tr>)}</tbody></table>;
}

/** Human approval of the English for one answer. Separate from engineering approval. */
export function TranslationReview({ systemId, fieldId, revision, saved, local, review, readOnly, canEdit, busy, onApprove, onSaveEnglish, onRevoke }: Props) {
  const [state, setState] = useState<LocalTranslationState>();
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState('');
  useEffect(() => subscribeLocalTranslation(systemId, setState), [systemId]);

  const snapshot = state?.snapshot && state.snapshot.sourceRevision === revision ? state.snapshot : undefined;
  const english = snapshot?.fieldStates[fieldId] === 'ready' ? snapshot.englishAnswers[fieldId] : undefined;
  const unsaved = canonical(local ?? null) !== canonical(saved ?? null);
  const status = approvalState(review, fieldId, saved, english);
  const approval = review?.translations?.[fieldId];
  const warnings = useMemo(() => saved && english ? checkAnswerTranslation(saved.value, english.value) : [], [saved, english]);
  const draftWarnings = useMemo(() => saved && typeof saved.value === 'string' && editing ? checkAnswerTranslation(saved.value, draft) : [], [saved, draft, editing]);

  if (!needsTranslation(saved) && !needsTranslation(local)) return null;
  const textAnswer = typeof saved?.value === 'string';

  return <section className={`translation-review translation-${status}`} aria-label="תרגום לאנגלית">
    <div className="translation-review-head">
      <strong>תרגום לאנגלית</strong>
      {status === 'approved' && approval && <span className="translation-badge ok">✓ אושר בידי {roleLabel[approval.role] ?? approval.role} · <bdi>{dateLabel(approval.at)}</bdi>{approval.value !== undefined ? ' · תוקן ידנית' : ''}</span>}
      {status === 'stale' && <span className="translation-badge warn">האישור הקודם בוטל: העברית או האנגלית השתנו</span>}
      {status === 'none' && english && <span className="translation-badge">תרגום מכונה · טרם אושר</span>}
    </div>

    {unsaved && <p className="translation-note">יש שינויים שלא נשמרו. התרגום והאישור מתייחסים לגרסה השמורה.</p>}
    {!english && !editing && <p className="translation-note">{snapshot ? 'ממתין לתרגום האוטומטי של הגרסה השמורה…' : 'טוען את התרגום…'}{canEdit && textAnswer && !readOnly ? ' אפשר גם לכתוב את האנגלית בעצמכם.' : ''}</p>}
    {english && !editing && <EnglishValue value={english.value} />}

    {!editing && warnings.length > 0 && <ul className="translation-warnings" aria-label="בדיקות אוטומטיות">
      {warnings.map(warning => <li key={warning.code + warning.detail}>⚠ {warning.detail}</li>)}
    </ul>}
    {!editing && english && warnings.length === 0 && <p className="translation-checks-ok">הבדיקות האוטומטיות (מספרים, יחידות, משפטים, שלילה, מונחים) לא מצאו בעיה. עדיין יש לקרוא בעיון.</p>}

    {editing && <div className="translation-edit">
      <label htmlFor={`en-${fieldId}`}>הנוסח באנגלית</label>
      <textarea id={`en-${fieldId}`} dir="ltr" value={draft} onChange={event => setDraft(event.target.value)} rows={Math.min(12, Math.max(3, draft.split('\n').length + 1))} />
      {draftWarnings.length > 0 && <ul className="translation-warnings">{draftWarnings.map(warning => <li key={warning.code + warning.detail}>⚠ {warning.detail}</li>)}</ul>}
    </div>}

    {!readOnly && saved && <div className="translation-actions">
      {editing ? <>
        <button type="button" className="button primary" disabled={busy || unsaved || !draft.trim() || /[֐-׿]/.test(draft)} onClick={() => { onSaveEnglish(draft); setEditing(false); }}>שמירה ואישור התרגום</button>
        <button type="button" className="text-button" onClick={() => setEditing(false)}>ביטול</button>
      </> : <>
        {english && status !== 'approved' && <button type="button" className="button secondary" disabled={busy || unsaved} onClick={() => onApprove(englishPrint(english))}>קראתי — התרגום נאמן לעברית</button>}
        {canEdit && textAnswer && <button type="button" className="text-button" disabled={busy || unsaved} onClick={() => { setDraft(typeof english?.value === 'string' ? english.value : ''); setEditing(true); }}>{english ? 'תיקון האנגלית' : 'כתיבת האנגלית'}</button>}
        {approval && <button type="button" className="text-button" disabled={busy} onClick={onRevoke}>ביטול האישור</button>}
      </>}
    </div>}
    <small className="translation-footnote">אישור תרגום אינו אישור הנדסי. הוא מאשר רק שהאנגלית אומרת את מה שכתוב בעברית.</small>
  </section>;
}
