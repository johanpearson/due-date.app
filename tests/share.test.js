import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeShare, decodeShare, shareUrl, mergeShared, SHARE_PREFIX } from '../app/share.js';

const visit = (id, extra = {}) => ({ id, type: 'midwife', title: '', date: '2026-11-03', time: '09:30', place: 'BMM Rosen', note: '', ...extra });

const data = {
  version: 1,
  lmp: '2026-05-10',
  dueDateOverride: '2027-02-10',
  notify: true,
  visits: [visit('a'), visit('b', { type: 'ultrasound', title: 'Rutinultraljud – v 19', note: 'Ta med frågor: kön?' })],
};

test('share link round-trips dates and visits, including Swedish characters', () => {
  const decoded = decodeShare(encodeShare(data));
  assert.equal(decoded.lmp, '2026-05-10');
  assert.equal(decoded.dueDateOverride, '2027-02-10');
  assert.deepEqual(decoded.visits, data.visits);
  assert.equal('notify' in decoded, false);
});

test('share token is URL-safe', () => {
  const url = shareUrl(data, 'https://example.github.io/due-date.app/');
  assert.ok(url.startsWith(`https://example.github.io/due-date.app/${SHARE_PREFIX}`));
  assert.match(url.split(SHARE_PREFIX)[1], /^[A-Za-z0-9_-]+$/);
});

test('broken links are rejected', () => {
  assert.throws(() => decodeShare('inte-en-länk'), /Länken är trasig/);
  assert.throws(() => decodeShare(''), /Länken är trasig/);
});

test('merge takes shared dates, adds and updates visits, keeps local ones', () => {
  const local = { ...data, lmp: '2026-05-08', dueDateOverride: null, visits: [visit('a', { time: '10:00' }), visit('c')] };
  const shared = { lmp: '2026-05-10', dueDateOverride: '2027-02-10', visits: [visit('a'), visit('b')] };
  const { data: merged, added, updated } = mergeShared(local, shared);
  assert.equal(merged.lmp, '2026-05-10');
  assert.equal(merged.dueDateOverride, '2027-02-10');
  assert.equal(merged.notify, true);
  assert.deepEqual(merged.visits.map((v) => v.id).sort(), ['a', 'b', 'c']);
  assert.equal(merged.visits.find((v) => v.id === 'a').time, '09:30');
  assert.equal(added, 1);
  assert.equal(updated, 1);
});
