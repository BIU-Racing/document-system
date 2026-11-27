/**
 * Shared building blocks for the 2027 rule checks (lib/rule-checks.ts, lib/rule-checks-structural.ts):
 * types, number parsing and the ok / violation / notice / pending result helpers. Pure and client-safe.
 */
import type { Answer, TableRow } from './progress';

export type RuleStatus = 'ok' | 'violation' | 'notice' | 'pending';
export type RuleRef = { systemId: string; fieldId: string };
/** One line of the compact result table: what was entered (or computed) against what the rule requires. */
export type RuleRow = { label: string; value: string; required: string; ok: boolean };
export type RuleResult = { checkId: string; rule: string; page: number; summary: string; status: RuleStatus; message: string; systemId: string; fieldId: string; rowId?: string; table?: RuleRow[] };
export type RuleAnswers = Record<string, Record<string, Answer | undefined> | undefined>;
export type Meta = { id: string; rule: string; page: number; summary: string; target: RuleRef; inputs?: RuleRef[] };
export type Outcome = Omit<RuleResult, keyof Meta | 'checkId' | 'systemId' | 'fieldId'>;
export type Getter = { num: (ref: RuleRef) => number | undefined; text: (ref: RuleRef) => string | undefined; rows: (ref: RuleRef) => TableRow[] };
export type Check = Meta & { evaluate: (get: Getter) => Outcome[] | Outcome };

export const ref = (systemId: string, fieldId: string): RuleRef => ({ systemId, fieldId });

/** A plain number, optionally with a trailing unit or "%"; text answers give undefined. */
export function numberFrom(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^\s*([+-]?\d+(?:\.\d+)?)\s*(?:%|[A-Za-zΩ°µ²/]{1,6})?\s*$/.exec(value.replace(/,(?=\d{3}\b)/g, ''));
  return match ? Number(match[1]) : undefined;
}
export const fmt = (value: number) => Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
export const pending = (message = 'הזינו מספר כדי לבדוק עמידה בחוק.') => ({ status: 'pending' as const, message });
export const ok = (message: string) => ({ status: 'ok' as const, message });
export const bad = (message: string) => ({ status: 'violation' as const, message });
export const notice = (message: string) => ({ status: 'notice' as const, message });

const row = (value: number, required: string, unit: string, passes: boolean, label = 'ערך'): RuleRow => ({ label, value: `${fmt(value)} ${unit}`.trim(), required, ok: passes });

export function maxCheck(value: number | undefined, limit: number, unit: string, rule: string, strict = false) {
  if (value === undefined) return pending();
  const passes = strict ? value < limit : value <= limit, table = [row(value, `${strict ? '<' : '≤'} ${fmt(limit)} ${unit}`.trim(), unit, passes)];
  const allowed = strict ? `פחות מ־${fmt(limit)} ${unit}` : `עד ${fmt(limit)} ${unit}`;
  return { ...(passes ? ok(`עומד ב־${rule}: ${fmt(value)} ${unit} (מותר ${allowed}).`) : bad(`חורג מ־${rule}: הוזן ${fmt(value)} ${unit}, מותר ${allowed}.`)), table };
}
export function minCheck(value: number | undefined, limit: number, unit: string, rule: string, strict = false) {
  if (value === undefined) return pending();
  const passes = strict ? value > limit : value >= limit, table = [row(value, `${strict ? '>' : '≥'} ${fmt(limit)} ${unit}`.trim(), unit, passes)];
  return { ...(passes ? ok(`עומד ב־${rule}: ${fmt(value)} ${unit} (נדרש ${strict ? 'יותר מ־' : 'לפחות '}${fmt(limit)} ${unit}).`) : bad(`חורג מ־${rule}: הוזן ${fmt(value)} ${unit}, נדרש ${strict ? 'יותר מ־' : 'לפחות '}${fmt(limit)} ${unit}.`)), table };
}
export function rangeCheck(value: number | undefined, low: number, high: number, unit: string, rule: string) {
  if (value === undefined) return pending();
  const passes = value >= low && value <= high, table = [row(value, `${fmt(low)}–${fmt(high)} ${unit}`.trim(), unit, passes)];
  return { ...(passes ? ok(`עומד ב־${rule}: ${fmt(value)} ${unit} (טווח ${fmt(low)}–${fmt(high)} ${unit}).`) : bad(`חורג מ־${rule}: הוזן ${fmt(value)} ${unit}, נדרש בין ${fmt(low)} ל־${fmt(high)} ${unit}.`)), table };
}
