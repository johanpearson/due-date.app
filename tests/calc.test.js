import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  startDate, dueDate, gestationOn, trimester, progressPercent, validateLmp,
  validateDueDateOverride, formatLong, formatShort, daysLeftText, splitVisits,
  visitToIcs, todayIso, isIsoDate,
} from '../app/calc.js';

const today = '2026-10-30';

test('gestational age and due date from LMP (BR-2-A, BR-3-A, BR-3-B)', () => {
  const data = { lmp: '2026-05-10' };
  assert.equal(gestationOn(startDate(data), today).label, '24+5');
  assert.equal(dueDate(data), '2027-02-14');
  assert.equal(formatShort(dueDate(data), { year: true }), 'sön 14 feb 2027');
  assert.equal(daysLeftText(dueDate(data), today), '107 dagar kvar');
});

test('counting crosses DST changes without losing a day (BR-2-C)', () => {
  // Swedish DST ended 2026-10-25 and starts 2027-03-28.
  assert.equal(gestationOn('2026-10-24', '2026-10-26').days, 2);
  assert.equal(gestationOn('2027-03-27', '2027-03-29').days, 2);
  assert.equal(gestationOn('2028-02-28', '2028-03-01').days, 2); // leap year
});

test('trimesters (BR-2-B)', () => {
  assert.equal(trimester(13 * 7 + 6), 1);
  assert.equal(trimester(14 * 7), 2);
  assert.equal(trimester(27 * 7 + 6), 2);
  assert.equal(trimester(28 * 7), 3);
});

test('progress is clamped to 0-100', () => {
  assert.equal(progressPercent(172), 61);
  assert.equal(progressPercent(300), 100);
});

test('after the due date (BR-3-C)', () => {
  const data = { lmp: '2026-05-10' };
  assert.equal(gestationOn(startDate(data), '2027-02-17').label, '40+3');
  assert.equal(daysLeftText('2027-02-14', '2027-02-17'), '3 dagar över BF');
  assert.equal(daysLeftText('2027-02-14', '2027-02-15'), '1 dag över BF');
  assert.equal(daysLeftText('2027-02-14', '2027-02-14'), 'Idag är det BF!');
});

test('ultrasound due date overrides LMP (SR-1-B)', () => {
  const data = { lmp: '2026-05-10', dueDateOverride: '2027-02-10' };
  assert.equal(dueDate(data), '2027-02-10');
  assert.equal(gestationOn(startDate(data), today).label, '25+2');
  assert.equal(daysLeftText(dueDate(data), today), '103 dagar kvar');
});

test('LMP validation (BR-1-B, BR-1-C)', () => {
  assert.equal(validateLmp('2026-11-12', today), 'Datumet kan inte ligga i framtiden');
  assert.equal(validateLmp('2025-09-01', today), 'Datumet ligger för långt bak');
  assert.equal(validateLmp('', today), 'Välj ett datum');
  assert.equal(validateLmp('2026-05-10', today), null);
  assert.equal(validateLmp(today, today), null);
});

test('ultrasound due date validation', () => {
  assert.equal(validateDueDateOverride('', today), null);
  assert.equal(validateDueDateOverride('2027-02-10', today), null);
  assert.equal(validateDueDateOverride('2028-01-01', today), 'Datumet ligger för långt fram');
  assert.equal(validateDueDateOverride('2026-01-01', today), 'Datumet ligger för långt bak');
});

test('Swedish date formatting (BR-8-C)', () => {
  assert.equal(formatLong(today), 'fredag 30 oktober');
  assert.equal(formatShort('2026-11-03'), 'tis 3 nov');
});

test('visits split and sorted (BR-4-A, BR-4-C)', () => {
  const visits = [
    { id: 'a', date: '2026-12-17', time: '13:15' },
    { id: 'b', date: '2026-11-03', time: '09:30' },
    { id: 'c', date: '2026-09-23' },
    { id: 'd', date: '2026-07-13' },
    { id: 'e', date: today, time: '08:00' },
  ];
  const { upcoming, past } = splitVisits(visits, today);
  assert.deepEqual(upcoming.map((v) => v.id), ['e', 'b', 'a']);
  assert.deepEqual(past.map((v) => v.id), ['c', 'd']);
});

test('week on a visit date (BR-4-B)', () => {
  assert.equal(gestationOn('2026-05-10', '2026-11-03').label, '25+2');
  assert.equal(gestationOn('2026-05-10', '2026-05-01'), null);
});

test('calendar file with reminder the day before (BR-7-A)', () => {
  const ics = visitToIcs(
    { id: 'x1', type: 'midwife', title: '', date: '2026-11-03', time: '09:30', place: 'BMM Rosen, Malmö', note: '' },
    new Date('2026-10-30T10:00:00Z'),
  );
  assert.match(ics, /DTSTART:20261103T093000\r\n/);
  assert.match(ics, /DTEND:20261103T103000\r\n/);
  assert.match(ics, /SUMMARY:Barnmorska\r\n/);
  assert.match(ics, /LOCATION:BMM Rosen\\, Malmö\r\n/);
  assert.match(ics, /TRIGGER:-P1D\r\n/);
  const allDay = visitToIcs({ id: 'x2', type: 'other', title: 'Föräldragrupp', date: '2027-01-13', time: '' });
  assert.match(allDay, /DTSTART;VALUE=DATE:20270113\r\nDTEND;VALUE=DATE:20270114\r\n/);
});

test('date helpers', () => {
  assert.equal(todayIso(new Date(2026, 9, 30, 23, 59)), '2026-10-30');
  assert.equal(isIsoDate('2026-02-30'), false);
  assert.equal(isIsoDate('2026-02-28'), true);
});
