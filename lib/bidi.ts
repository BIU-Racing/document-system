/**
 * Hebrew sentences that embed English, numbers and units ("למתח של 588 V נדרש 294 kΩ (500 Ω/V).")
 * are reordered by the browser's bidi algorithm: "588 V" can show as "V 588", parentheses flip and
 * sentence punctuation jumps. isolateLtr wraps each Latin/number run in Unicode isolates
 * (LRI … PDI) so the run always reads left to right while the sentence stays right to left.
 * Pure; safe for any displayed string.
 */
const LRI = '⁦', PDI = '⁩';
// A token may contain inner punctuation (6.3.3, 425.17, Ω/V) but never ends with it, so "2027: 2"
// stays two runs and sentence punctuation stays in the Hebrew text.
const TOKEN = "[(\\[]?[A-Za-z0-9Ω°µ%](?:[A-Za-z0-9Ω°µ%²³⁴.,:/_'’+\\-]*[A-Za-z0-9Ω°µ%²³⁴)\\]])?";
// Formula symbols between tokens keep a calculation together: "12 A × 588 V = 7 kW".
const SYMBOL = '[×=+\\-–*/<>≤≥]';
// A comma or semicolon between two English words stays inside the run ("Tube OD, mm"), but not
// after a number or before Hebrew ("294 kΩ, הוזן").
const JOIN = `(?:[ \\u00A0]+(?:${SYMBOL}[ \\u00A0]+)*|(?<=[A-Za-z])[,;][ \\u00A0]+(?=[(\\[]?[A-Za-z]))`;
const RUN = new RegExp(`${TOKEN}(?:${JOIN}${TOKEN})*`, 'g');

export function isolateLtr(text: string): string {
  if (!text || text.includes(LRI)) return text;
  return text.replace(RUN, run => {
    // An unmatched opening or closing bracket belongs to the surrounding Hebrew text.
    const opens = (run.match(/[(\[]/g) ?? []).length, closes = (run.match(/[)\]]/g) ?? []).length;
    if (opens > closes && /^[(\[]/.test(run)) return run[0] + LRI + run.slice(1) + PDI;
    if (closes > opens && /[)\]]$/.test(run)) return LRI + run.slice(0, -1) + PDI + run.slice(-1);
    return LRI + run + PDI;
  });
}

/** Removes the isolates again (for comparisons and plain-text exports). */
export const stripIsolates = (text: string) => text.replace(/[⁦-⁩]/g, '');
