// All user data lives in one localStorage entry on this device. A copy of the
// visits is mirrored into Cache Storage so the service worker can read it for
// reminders (service workers cannot read localStorage).

import { isIsoDate, VISIT_TYPES } from './calc.js';

const KEY = 'due-date:v1';
export const MIRROR_CACHE = 'due-date-data';
export const MIRROR_URL = './__data.json';

export function emptyData() {
  return { version: 1, lmp: null, dueDateOverride: null, notify: false, visits: [] };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalize(JSON.parse(raw)) : emptyData();
  } catch {
    return emptyData();
  }
}

export function save(data) {
  localStorage.setItem(KEY, JSON.stringify(data));
  mirror(data);
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}

export function clear() {
  localStorage.removeItem(KEY);
  if ('caches' in window) caches.delete(MIRROR_CACHE).catch(() => {});
}

export async function mirror(data) {
  if (!('caches' in window)) return;
  try {
    const cache = await caches.open(MIRROR_CACHE);
    const body = JSON.stringify({ notify: data.notify, visits: data.visits });
    await cache.put(MIRROR_URL, new Response(body, { headers: { 'Content-Type': 'application/json' } }));
  } catch {
    // Reminders are best effort.
  }
}

// Validates and cleans data from storage or an imported backup. Throws on bad input.
export function normalize(input) {
  if (!input || typeof input !== 'object') throw new Error('Ogiltig fil');
  const data = emptyData();
  if (input.lmp != null) {
    if (!isIsoDate(input.lmp)) throw new Error('Ogiltigt datum för sista mens');
    data.lmp = input.lmp;
  }
  if (input.dueDateOverride) {
    if (!isIsoDate(input.dueDateOverride)) throw new Error('Ogiltigt BF');
    data.dueDateOverride = input.dueDateOverride;
  }
  data.notify = input.notify === true;
  const visits = Array.isArray(input.visits) ? input.visits : [];
  data.visits = visits
    .filter((v) => v && isIsoDate(v.date))
    .map((v) => ({
      id: typeof v.id === 'string' && v.id ? v.id : newId(),
      type: v.type in VISIT_TYPES ? v.type : 'other',
      title: str(v.title),
      date: v.date,
      time: /^\d{2}:\d{2}$/.test(v.time || '') ? v.time : '',
      place: str(v.place),
      note: str(v.note),
    }));
  return data;
}

function str(v) {
  return typeof v === 'string' ? v.slice(0, 500) : '';
}

export function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
