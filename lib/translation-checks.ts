/**
 * Automatic warnings for one Hebrew → English translation, shown before a person approves it.
 * They never block approval: they point the reviewer at likely errors seen in the QA audit
 * (dropped sentences, lost negation, "must" weakened to "should", changed units or numbers,
 * Formula Student terms translated wrongly).
 *
 * Pure and client-safe.
 */
import glossaryData from '@/data/fs-glossary.json';

export type TranslationWarningCode = 'number_missing' | 'unit_changed' | 'sentence_missing' | 'negation_lost' | 'obligation_weakened' | 'term_wrong' | 'term_missing' | 'hebrew_left';
export type TranslationWarning = { code: TranslationWarningCode; detail: string };

type Term = { he: string; expect: string[]; wrong: string[] };
const terms = (glossaryData as { terms: Term[] }).terms;

/** Case- and hyphen-insensitive comparison: "current-sensor" matches "current sensor". */
const lower = (text: string) => text.toLowerCase().replace(/[-\u2010-\u2014]/g, ' ');
const NUMBER = /\d+(?:[.,]\d+)?/g;
// Longest first so "mm²" is checked before "mm" and "kΩ" before "Ω".
const UNITS = ['mm²', 'mm2', 'kWh', 'kbps', 'kHz', 'MPa', 'GPa', 'kΩ', 'MΩ', 'Ω/V', '°C', 'mm', 'cm', 'kg', 'kN', 'kV', 'mV', 'mA', 'kA', 'kW', 'Wh', 'MJ', 'kJ', 'Nm', 'ms', 'Hz', 'Ω', 'V', 'A', 'W', 'N', 'J', '%'];
const HEBREW_UNITS: [RegExp, string[]][] = [[/מ״מ|מ"מ|מילימטר/, ['mm']], [/ס״מ|ס"מ|סנטימטר/, ['cm']], [/ק״ג|ק"ג|קילוגרם/, ['kg']], [/שניות|שנייה/, ['s', 'sec', 'secs', 'second', 'seconds']]];
const HE_NEGATION = /(^|[\s"'(־-])(לא|אין|אינו|אינה|אינם|אינן|אסור|בלי|ללא|מבלי)(?=[\s,.;:!?)"']|$)/g;
const EN_NEGATION = /\b(not|no|never|without|cannot|none|nor|neither|prohibited|forbidden)\b|n't\b/gi;
const HE_MUST = /(^|[\s־])(חובה|חייב|חייבת|חייבים|חייבות|נדרש|נדרשת|נדרשים|אסור)(?=[\s,.;:!?]|$)/;
const EN_MUST = /\b(must|shall|required|mandatory|prohibited|forbidden|may not)\b/i;
const EN_SHOULD = /\bshould\b/i;

/** Counts units as whole tokens so "mm" inside "mm²" is not double counted. */
function unitCounts(text: string) {
  const counts = new Map<string, number>();
  let rest = ` ${text} `;
  for (const unit of UNITS) {
    const escaped = unit.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    const pattern = new RegExp(`(?<=[\\d\\s(])${escaped}(?=[\\s.,;:)!?]|$)`, 'g');
    const found = rest.match(pattern)?.length ?? 0;
    if (found) { counts.set(unit, found); rest = rest.replace(pattern, ' '); }
  }
  return counts;
}
const sentences = (text: string) => text.split(/(?<=[.!?])\s+|\n+/).map(part => part.trim()).filter(part => /[\p{L}\d]/u.test(part)).length;

export function checkTranslation(hebrew: string, english: string): TranslationWarning[] {
  const warnings: TranslationWarning[] = [];
  if (!hebrew.trim() || !english.trim()) return warnings;
  if (/[֐-׿]/.test(english)) warnings.push({ code: 'hebrew_left', detail: 'נשארה עברית בטקסט באנגלית' });

  const englishNumbers = english.match(NUMBER) ?? [];
  for (const number of new Set(hebrew.match(NUMBER) ?? [])) {
    const plain = number.replace(',', '.');
    if (!englishNumbers.some(value => value === number || value.replace(',', '.') === plain)) warnings.push({ code: 'number_missing', detail: `המספר ${number} לא מופיע באנגלית` });
  }

  const sourceUnits = unitCounts(hebrew), targetUnits = unitCounts(english);
  for (const [unit, count] of sourceUnits) if ((targetUnits.get(unit) ?? 0) < count) warnings.push({ code: 'unit_changed', detail: `היחידה ${unit} השתנתה או חסרה באנגלית` });
  for (const [pattern, accepted] of HEBREW_UNITS) if (pattern.test(hebrew) && !accepted.some(unit => new RegExp(`\\b${unit}\\b`, 'i').test(english))) warnings.push({ code: 'unit_changed', detail: `יחידה (${accepted[0]}) לא מופיעה באנגלית` });

  const heSentences = sentences(hebrew), enSentences = sentences(english);
  if (heSentences > 1 && enSentences < heSentences) warnings.push({ code: 'sentence_missing', detail: `בעברית ${heSentences} משפטים, באנגלית ${enSentences}. ייתכן שמשפט הושמט` });

  const heNegations = (hebrew.match(HE_NEGATION) ?? []).length, enNegations = (english.match(EN_NEGATION) ?? []).length;
  if (heNegations > enNegations) warnings.push({ code: 'negation_lost', detail: `בעברית ${heNegations} שלילות ("לא", "אין", "אסור"…), באנגלית ${enNegations}` });
  if (HE_MUST.test(hebrew) && !EN_MUST.test(english)) warnings.push({ code: 'obligation_weakened', detail: EN_SHOULD.test(english) ? 'חובה או איסור בעברית הפכו ל־"should" (המלצה)' : 'חובה או איסור בעברית לא מופיעים באנגלית (must / shall / prohibited)' });

  const englishLower = lower(english);
  for (const term of terms) {
    if (!hebrew.includes(term.he)) continue;
    const wrong = term.wrong.find(item => englishLower.includes(lower(item)));
    if (wrong) warnings.push({ code: 'term_wrong', detail: `"${term.he}" תורגם "${wrong}". המונח המקובל: ${term.expect[0]}` });
    else if (!term.expect.some(item => englishLower.includes(lower(item)))) warnings.push({ code: 'term_missing', detail: `"${term.he}" צפוי להופיע כ־${term.expect[0]}` });
  }
  return [...new Map(warnings.map(warning => [warning.code + warning.detail, warning])).values()];
}

/** Checks a whole answer: plain text, or every translated table cell. */
export function checkAnswerTranslation(source: string | Record<string, string>[], english: string | Record<string, string>[] | undefined): TranslationWarning[] {
  if (english === undefined) return [];
  if (typeof source === 'string') return typeof english === 'string' ? checkTranslation(source, english) : [];
  if (!Array.isArray(english)) return [];
  const out: TranslationWarning[] = [];
  source.forEach((row, index) => {
    for (const [column, value] of Object.entries(row)) {
      if (column === '_id' || typeof value !== 'string') continue;
      const translated = english[index]?.[column];
      if (typeof translated === 'string') out.push(...checkTranslation(value, translated).map(warning => ({ ...warning, detail: `שורה ${index + 1}: ${warning.detail}` })));
    }
  });
  return out;
}
