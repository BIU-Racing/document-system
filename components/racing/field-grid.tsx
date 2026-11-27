'use client';
import type { KeyboardEvent } from 'react';
import type { Answer } from '@/lib/progress';
import type { FieldGrid as Grid } from '@/lib/field-grids';

type CellField = { id: string; kind: string; options?: { value: string; label: string }[] };
const otherStatus: Record<string, string> = { na: 'לא רלוונטי', unknown: 'טרם נקבע' };
const shownUnit = (unit?: string) => unit && unit !== 'count' ? unit : '';

/** Excel-like keys: Enter / Shift+Enter move down / up in the same column; Alt+Enter opens the full card. */
function moveKey(event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>, gridId: string, row: number, column: number, open: () => void) {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  if (event.altKey) { open(); return; }
  const target = document.querySelector<HTMLElement>(`[data-grid="${gridId}"][data-row="${row + (event.shiftKey ? -1 : 1)}"][data-col="${column}"]`);
  target?.focus();
}

/**
 * One workbook table as an editable grid: a cell per question, typed straight in. Every cell
 * keeps its own answer; "⋯" opens the regular full card (not applicable, notes, files, review).
 */
export function FieldGrid({ grid, fields, answers, visible, violations, readOnly, openField, onChange, onOpen }: {
  grid: Grid; fields: Map<string, CellField>; answers: Record<string, Answer | undefined>; visible: Set<string>;
  violations: Set<string>; readOnly: boolean; openField?: string; onChange: (fieldId: string, answer: Answer) => void;
  onOpen: (fieldId?: string) => void;
}) {
  const filled = grid.fieldIds.filter(id => { const answer = answers[id]; return answer && (answer.status !== 'answered' || String(answer.value).trim()); }).length;
  const write = (fieldId: string, value: string) => {
    const answer = answers[fieldId];
    onChange(fieldId, { ...answer, status: 'answered', value, ...(answer?.provenance?.length ? { sourceReview: 'pending' as const } : {}) });
  };
  return <section className="field-grid" aria-label={grid.title}>
    <header className="field-grid-heading">
      <h3>{grid.title}</h3>
      <span className="field-grid-count"><bdi>{filled}</bdi> מתוך <bdi>{grid.fieldIds.length}</bdi> מולאו</span>
    </header>
    <p className="field-grid-hint">כמו בלשונית <bdi dir="ltr">{grid.sheet}</bdi> באקסל · <bdi>Tab</bdi> לתא הבא · <bdi>Enter</bdi> לתא שמתחת · ⋯ לפרטים</p>
    <div className="field-grid-scroll">
      <table>
        <thead><tr><th scope="col"><span className="sr-only">נתון</span></th>{grid.columns.map(column => <th scope="col" key={column}>{column}</th>)}</tr></thead>
        <tbody>{grid.rows.map((row, rowIndex) => <tr key={row.label}>
          <th scope="row">{row.label}{shownUnit(row.unit) && <span className="field-grid-unit"> <bdi>[{shownUnit(row.unit)}]</bdi></span>}</th>
          {row.cells.map((cell, index) => {
            if (!cell || !visible.has(cell.fieldId)) return <td key={index} className="field-grid-empty" aria-label="אין תא בתבנית">—</td>;
            const field = fields.get(cell.fieldId)!, answer = answers[cell.fieldId];
            const label = `${row.label} — ${grid.columns[index]}`;
            const value = answer?.status === 'answered' && typeof answer.value === 'string' ? answer.value : '';
            const classes = [violations.has(cell.fieldId) ? 'violation' : '', openField === cell.fieldId ? 'open' : ''].join(' ').trim();
            return <td key={index} id={`field-${cell.fieldId}`} className={classes} title={`ייכתב לתא \u2066${grid.sheet}!${cell.cell}\u2069`}>
              <div className="field-grid-cell">
                {answer && answer.status !== 'answered'
                  ? <button type="button" className="field-grid-status" onClick={() => onOpen(cell.fieldId)}>{otherStatus[answer.status]}</button>
                  : field.kind === 'select' && field.options?.length
                    ? <select aria-label={label} value={value} disabled={readOnly} data-grid={grid.id} data-row={rowIndex} data-col={index} onKeyDown={event => moveKey(event, grid.id, rowIndex, index, () => onOpen(cell.fieldId))} onChange={event => write(cell.fieldId, event.target.value)}>
                        <option value="">בחירה</option>{field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    : <input aria-label={label} aria-keyshortcuts="Alt+Enter" dir="auto" value={value} readOnly={readOnly} data-grid={grid.id} data-row={rowIndex} data-col={index} onKeyDown={event => moveKey(event, grid.id, rowIndex, index, () => onOpen(cell.fieldId))} onChange={event => write(cell.fieldId, event.target.value)}/>}
                <button type="button" tabIndex={-1} className="field-grid-more" aria-label={`פירוט מלא: ${label}`} aria-expanded={openField === cell.fieldId} onClick={() => onOpen(openField === cell.fieldId ? undefined : cell.fieldId)}>⋯</button>
              </div>
            </td>;
          })}
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}
