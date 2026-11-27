'use client';
import { coverage } from '@/lib/catalog';
import { fieldDestinations, formatRanges, type Destination, type LocationField } from '@/lib/official-location';
import { isolateLtr } from '@/lib/bidi';

const modeNote: Record<Exclude<Destination['mode'], 'auto'>, string> = {
  evidence: isolateLtr('קובץ או ראיה: לא נכתב לתא, יש לשבץ ידנית בקובץ Excel'),
  manual: 'לא נכתב אוטומטית: המיפוי דורש הכרעה',
  restricted: 'פרטי קשר: ממולא ידנית',
};

function CellLink({ destination }: { destination: Destination }) {
  const cells = formatRanges(destination.ranges);
  const text = <bdi dir="ltr">{destination.document} › {destination.sheet}{cells ? ` › ${cells}` : ''}</bdi>;
  if (!destination.href) return text;
  return <a href={destination.href} target="_blank" rel="noopener" title="פתיחת המסמך הרשמי בלשונית חדשה, עם סימון התא">{text} <span aria-hidden="true">↗</span></a>;
}

/** Shows where this answer lands in the official workbooks: the same mapping the export uses. */
export function FieldLocations({ systemId, field }: { systemId: string; field: LocationField }) {
  const result = fieldDestinations(systemId, field, coverage.entries);

  if (result.type === 'none') return <div className="field-location field-location-none" title="התשובה נשמרת בתיק המערכת ובדוח שלה, ולא נכתבת לקובצי האקסל של התחרות.">
    <p><span className="field-location-label">תיעוד פנימי</span> · לא נכתב לאקסל</p>
  </div>;

  if (result.type === 'chosen_cell') return <div className="field-location field-location-warn">
    <p><span className="field-location-label">{isolateLtr('נכתב ל־SES לתא שתבחרו:')}</span>
      <span className="field-location-item">{result.href ? <a href={result.href} target="_blank" rel="noopener"><bdi dir="ltr">SES › {result.sheet}</bdi> <span aria-hidden="true">↗</span></a> : <bdi dir="ltr">SES › {result.sheet}</bdi>}</span>
    </p>
    <small>הכתובת שמקלידים בכל שורה היא התא שייכתב.</small>
  </div>;

  const automatic = result.destinations.filter(item => item.mode === 'auto');
  const other = result.destinations.filter(item => item.mode !== 'auto');
  const ownCells = automatic.filter(item => !item.columnLabel);
  const columnCells = automatic.filter(item => item.columnLabel);
  return <div className="field-location" title="המיקום נלקח מהמיפוי שמשמש את הייצוא. אם התא לא מתאים לשאלה, דווחו לרכז.">
    {ownCells.length > 0 && <p><span className="field-location-label">ייכתב לתא:</span>{ownCells.map(item => <span className="field-location-item" key={item.controlId}><CellLink destination={item} /></span>)}</p>}
    {columnCells.length > 0 && <details open={columnCells.length <= 4}>
      <summary>לאן נכתבת כל עמודה בטבלה ({columnCells.length})</summary>
      <ul>{columnCells.map(item => <li key={item.controlId}><span>{item.columnLabel}</span><span className="field-location-item"><CellLink destination={item} /></span></li>)}</ul>
    </details>}
    {other.length > 0 && <ul className="field-location-other">{other.map(item => <li key={item.controlId}>
      {item.columnLabel && <span>{item.columnLabel}</span>}
      <span className="field-location-item"><CellLink destination={item} /></span>
      <span className="field-location-note">{modeNote[item.mode as Exclude<Destination['mode'], 'auto'>]}</span>
    </li>)}</ul>}
  </div>;
}
