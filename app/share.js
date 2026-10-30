// Share link: the data travels in the URL fragment (#dela=…), which browsers
// never send to the server. No DOM access here, so it can be unit tested.

export const SHARE_PREFIX = '#dela=';

export function encodeShare(data) {
  const payload = {
    v: 1,
    lmp: data.lmp,
    bf: data.dueDateOverride || undefined,
    visits: data.visits.map((v) => [v.id, v.type, v.title, v.date, v.time, v.place, v.note]),
  };
  return toBase64Url(JSON.stringify(payload));
}

// Returns data in the shape store.normalize() accepts. Throws on a broken link.
export function decodeShare(token) {
  let payload;
  try {
    payload = JSON.parse(fromBase64Url(token));
  } catch {
    throw new Error('Länken är trasig');
  }
  if (!payload || payload.v !== 1 || !Array.isArray(payload.visits)) throw new Error('Länken är trasig');
  return {
    lmp: payload.lmp,
    dueDateOverride: payload.bf || null,
    visits: payload.visits
      .filter(Array.isArray)
      .map(([id, type, title, date, time, place, note]) => ({ id, type, title, date, time, place, note })),
  };
}

export function shareUrl(data, base) {
  return `${base}${SHARE_PREFIX}${encodeShare(data)}`;
}

// Dates come from the shared data; visits are merged by id and the shared
// version wins. Visits deleted on the other phone are kept here.
export function mergeShared(local, shared) {
  const byId = new Map(local.visits.map((v) => [v.id, v]));
  let added = 0;
  let updated = 0;
  for (const v of shared.visits) {
    const old = byId.get(v.id);
    if (!old) added++;
    else if (JSON.stringify(old) !== JSON.stringify(v)) updated++;
    byId.set(v.id, v);
  }
  return {
    data: { ...local, lmp: shared.lmp, dueDateOverride: shared.dueDateOverride, visits: [...byId.values()] },
    added,
    updated,
  };
}

function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(token) {
  const b64 = token.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
