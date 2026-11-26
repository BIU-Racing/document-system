/**
 * Human approval of machine-translated English, separate from engineering approval.
 *
 * An approval stores two fingerprints: the Hebrew answer it was given for and the exact English
 * text that was approved. If either changes (the Hebrew is edited, or the machine produces a
 * different English text) the approval no longer applies. A person may also correct the English;
 * the corrected text is stored with the approval and replaces the machine text for that answer
 * only while the Hebrew is unchanged.
 *
 * Pure and client-safe.
 */
import { canonical, fingerprint, type Answer, type Answers, type Review, type TableRow, type TranslationApproval } from './progress';

export const HEBREW = /[֐-׿]/;

/** Fingerprint of the English value only (translated reasons and metadata do not matter). */
export const englishPrint = (answer: Pick<Answer, 'value'> | undefined) => canonical(answer?.value ?? null);

/** True when the answer carries Hebrew text that must be translated before export. */
export const needsTranslation = (answer: Answer | undefined) => !!answer && answer.status !== 'unknown' && HEBREW.test(canonical(answer.value));

export type ApprovalState = 'none' | 'approved' | 'stale';

export function approvalState(review: Review | undefined, fieldId: string, answer: Answer | undefined, english: Answer | undefined): ApprovalState {
  const approval = review?.translations?.[fieldId];
  if (!approval) return 'none';
  return approval.source === fingerprint(answer) && !!english && approval.english === englishPrint(english) ? 'approved' : 'stale';
}

/** The corrected English for this answer, if one was saved for exactly this Hebrew. */
export function overrideFor(review: Review | undefined, fieldId: string, answer: Answer | undefined): string | TableRow[] | undefined {
  const approval: TranslationApproval | undefined = review?.translations?.[fieldId];
  return approval?.value !== undefined && approval.source === fingerprint(answer) ? approval.value : undefined;
}

/** Applies saved corrections on top of the machine translation. Returns new objects. */
export function applyTranslationOverrides(answers: Answers, review: Review | undefined, englishAnswers: Answers, fieldStates: Record<string, 'ready' | 'pending' | 'failed'>) {
  const english: Answers = { ...englishAnswers }, states = { ...fieldStates };
  for (const fieldId of Object.keys(review?.translations ?? {})) {
    const value = overrideFor(review, fieldId, answers[fieldId]);
    if (value === undefined) continue;
    english[fieldId] = { ...(englishAnswers[fieldId] ?? answers[fieldId]), value };
    states[fieldId] = 'ready';
  }
  return { englishAnswers: english, fieldStates: states };
}
