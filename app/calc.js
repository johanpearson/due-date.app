// Pure date math. Dates are 'YYYY-MM-DD' strings handled as day numbers
// (days since 1970-01-01 in UTC), so time zones and DST never shift a day.

export const PREGNANCY_DAYS = 280;
export const MAX_LMP_AGE_DAYS = 44 * 7;

const DAY_MS = 86400000;
const WEEKDAYS = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'];
const WEEKDAYS_SHORT = ['sön', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör'];
const MONTHS = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
const MONTHS_SHORT = ['jan', 'feb', 'mars', 'apr', 'maj', 'juni', 'juli', 'aug', 'sep', 'okt', 'nov', 'dec'];

export function isIsoDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toIso(toDay(s)) === s;
}

export function toDay(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

export function toIso(day) {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(iso, n) {
  return toIso(toDay(iso) + n);
}

export function daysBetween(fromIso, toIsoDate) {
  return toDay(toIsoDate) - toDay(fromIso);
}

// Today's local calendar date as ISO.
export function todayIso(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

// The day pregnancy counting starts: LMP, or the ultrasound due date minus 280 days.
export function startDate({ lmp, dueDateOverride }) {
  return dueDateOverride ? addDays(dueDateOverride, -PREGNANCY_DAYS) : lmp;
}

export function dueDate(data) {
  return data.dueDateOverride || addDays(data.lmp, PREGNANCY_DAYS);
}

// Gestational age on a date: { days, weeks, extraDays, label: '24+5' }, or null before start.
export function gestationOn(start, onIso) {
  const days = daysBetween(start, onIso);
  if (days < 0) return null;
  const weeks = Math.floor(days / 7);
  const extraDays = days % 7;
  return { days, weeks, extraDays, label: `${weeks}+${extraDays}` };
}

export function trimester(days) {
  if (days < 14 * 7) return 1;
  if (days < 28 * 7) return 2;
  return 3;
}

export function progressPercent(days) {
  return Math.max(0, Math.min(100, Math.floor((days / PREGNANCY_DAYS) * 100)));
}

// Returns an error message (Swedish) or null.
export function validateLmp(lmp, today) {
  if (!isIsoDate(lmp)) return 'Välj ett datum';
  const age = daysBetween(lmp, today);
  if (age < 0) return 'Datumet kan inte ligga i framtiden';
  if (age > MAX_LMP_AGE_DAYS) return 'Datumet ligger för långt bak';
  return null;
}

export function validateDueDateOverride(bf, today) {
  if (!bf) return null;
  if (!isIsoDate(bf)) return 'Välj ett datum';
  const err = validateLmp(addDays(bf, -PREGNANCY_DAYS), today);
  if (err === 'Datumet kan inte ligga i framtiden') return 'Datumet ligger för långt fram';
  if (err) return 'Datumet ligger för långt bak';
  return null;
}

export function formatLong(iso) {
  const d = new Date(toDay(iso) * DAY_MS);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function formatShort(iso, { year = false } = {}) {
  const d = new Date(toDay(iso) * DAY_MS);
  const base = `${WEEKDAYS_SHORT[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
  return year ? `${base} ${d.getUTCFullYear()}` : base;
}

export function daysLeftText(due, today) {
  const n = daysBetween(today, due);
  if (n > 1) return `${n} dagar kvar`;
  if (n === 1) return '1 dag kvar';
  if (n === 0) return 'Idag är det BF!';
  return n === -1 ? '1 dag över BF' : `${-n} dagar över BF`;
}

export const VISIT_TYPES = {
  midwife: 'Barnmorska',
  ultrasound: 'Ultraljud',
  doctor: 'Läkare',
  other: 'Annat',
};

export function visitTitle(v) {
  return (v.title && v.title.trim()) || VISIT_TYPES[v.type] || 'Besök';
}

// Splits visits into upcoming (soonest first) and past (latest first).
export function splitVisits(visits, today) {
  const key = (v) => `${v.date}T${v.time || '00:00'}`;
  const sorted = [...visits].sort((a, b) => key(a).localeCompare(key(b)));
  return {
    upcoming: sorted.filter((v) => v.date >= today),
    past: sorted.filter((v) => v.date < today).reverse(),
  };
}

// iCalendar text for one visit, with a reminder the day before.
export function visitToIcs(v, stamp = new Date()) {
  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
  const ymd = v.date.replace(/-/g, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Due date//SV',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${v.id}@due-date.app`,
    `DTSTAMP:${stamp.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
  ];
  if (v.time) {
    const start = `${ymd}T${v.time.replace(':', '')}00`;
    const [h, m] = v.time.split(':').map(Number);
    const endMin = Math.min(h * 60 + m + 60, 23 * 60 + 59);
    const end = `${ymd}T${String(Math.floor(endMin / 60)).padStart(2, '0')}${String(endMin % 60).padStart(2, '0')}00`;
    lines.push(`DTSTART:${start}`, `DTEND:${end}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${ymd}`, `DTEND;VALUE=DATE:${addDays(v.date, 1).replace(/-/g, '')}`);
  }
  lines.push(`SUMMARY:${esc(visitTitle(v))}`);
  if (v.place) lines.push(`LOCATION:${esc(v.place)}`);
  if (v.note) lines.push(`DESCRIPTION:${esc(v.note)}`);
  lines.push(
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(visitTitle(v))}`,
    'TRIGGER:-P1D',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  );
  return lines.join('\r\n') + '\r\n';
}
