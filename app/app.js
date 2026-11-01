import {
  todayIso, startDate, dueDate, gestationOn, trimester, progressPercent,
  validateLmp, validateDueDateOverride, formatLong, formatShort, daysLeftText,
  VISIT_TYPES, visitTitle, splitVisits, visitToIcs,
  toDay, addDays, monthGrid, monthTitle, weekdayName, CALENDAR_DAYS,
} from './calc.js';
import * as store from './store.js';
import { SHARE_PREFIX, shareUrl, decodeShare, mergeShared } from './share.js';

let data = store.load();
const view = document.getElementById('view');
const tabbar = document.getElementById('tabbar');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function commit() {
  store.save(data);
  checkReminders();
}

// ---------- Routing ----------

const routes = { idag: renderHome, kalender: renderCalendar, besok: renderVisits, installningar: renderSettings };

function route() {
  if (!data.lmp) {
    tabbar.hidden = true;
    renderWelcome();
    return;
  }
  const name = location.hash.replace('#/', '');
  const page = routes[name] ? name : 'idag';
  tabbar.hidden = false;
  for (const a of tabbar.querySelectorAll('a')) {
    if (a.dataset.tab === page) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  routes[page]();
}

function go(page) {
  if (location.hash === `#/${page}`) route();
  else location.hash = `#/${page}`;
}

window.addEventListener('hashchange', () => {
  if (!handleShareLink()) route();
});

// Re-render when the day changes or the app comes back to the foreground.
let renderedDay = todayIso();
function refreshIfNewDay() {
  if (todayIso() !== renderedDay) {
    renderedDay = todayIso();
    route();
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    refreshIfNewDay();
    checkReminders();
    checkForUpdate();
  }
});
setInterval(refreshIfNewDay, 60 * 1000);

// ---------- Views ----------

function renderWelcome() {
  const today = todayIso();
  view.innerHTML = `
    <section class="welcome">
      <div class="hero-icon" aria-hidden="true">🌸</div>
      <h1>Hej!</h1>
      <p class="lead">Fyll i första dagen i din senaste mens så räknar vi ut hur långt gången du är och när bebisen beräknas komma.</p>
      <form id="welcome-form" class="card" novalidate>
        <label class="field">
          <span>Första dagen i sista mens</span>
          <input type="date" name="lmp" max="${today}" required>
          <small class="error" id="lmp-error" role="alert"></small>
        </label>
        <button class="btn btn-primary btn-block" type="submit">Spara</button>
      </form>
      <p class="fineprint">Uppgifterna sparas bara på din telefon.</p>
    </section>`;
  const form = view.querySelector('#welcome-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const lmp = form.lmp.value;
    const err = validateLmp(lmp, todayIso());
    form.querySelector('#lmp-error').textContent = err || '';
    form.lmp.toggleAttribute('aria-invalid', !!err);
    if (err) return;
    data.lmp = lmp;
    commit();
    go('idag');
  });
}

function renderHome() {
  const today = todayIso();
  const start = startDate(data);
  const due = dueDate(data);
  const g = gestationOn(start, today);
  const next = splitVisits(data.visits, today).upcoming[0];
  const tri = trimester(g.days);
  const pct = progressPercent(g.days);
  const left = daysLeftText(due, today);

  view.innerHTML = `
    <p class="date-line">${esc(capitalize(formatLong(today)))}</p>
    <section class="card hero">
      <p class="card-label">Du är gravid i</p>
      <p class="big" aria-label="vecka ${g.weeks} plus ${g.extraDays} dagar">${g.label}</p>
      <p class="sub">vecka + dag</p>
      <span class="pill pill-lavender">${tri}:${tri === 1 || tri === 2 ? 'a' : 'e'} trimestern</span>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Andel av 40 veckor">
        <div style="width:${pct}%"></div>
      </div>
      <p class="sub">${pct} % av 40 veckor</p>
    </section>
    <section class="card">
      <p class="card-label">Beräknat förlossningsdatum${data.dueDateOverride ? ' <span class="pill pill-mint">enligt ultraljud</span>' : ''}</p>
      <p class="medium">${esc(formatShort(due, { year: true }))}</p>
      <p class="strong">${esc(left)}</p>
    </section>
    <section>
      <h2 class="section-title">Nästa besök</h2>
      ${next ? `<ul class="list">${visitItem(next, start)}</ul>` : `<p class="muted">Inga inbokade besök.</p>`}
      <a class="link" href="#/besok">${next ? 'Alla besök →' : 'Lägg till besök →'}</a>
    </section>`;
  bindVisitItems();
}

function renderVisits() {
  const today = todayIso();
  const start = startDate(data);
  const { upcoming, past } = splitVisits(data.visits, today);
  const empty = data.visits.length === 0;

  view.innerHTML = `
    <h1 class="page-title">Besök</h1>
    <button class="btn btn-primary btn-block" id="add-visit">+ Lägg till besök</button>
    ${empty ? `
      <div class="empty">
        <div class="hero-icon" aria-hidden="true">📅</div>
        <p>Inga besök än. Lägg in barnmorsketider, ultraljud och annat du vill hålla koll på.</p>
      </div>` : `
      <h2 class="section-title">Kommande</h2>
      ${upcoming.length ? `<ul class="list">${upcoming.map((v) => visitItem(v, start)).join('')}</ul>` : '<p class="muted">Inga kommande besök.</p>'}
      ${past.length ? `
        <details class="past">
          <summary>Tidigare (${past.length})</summary>
          <ul class="list">${past.map((v) => visitItem(v, start)).join('')}</ul>
        </details>` : ''}`}`;
  view.querySelector('#add-visit').addEventListener('click', () => openVisit());
  bindVisitItems();
}

function visitItem(v, start) {
  const g = gestationOn(start, v.date);
  const sub = [formatShort(v.date) + (v.time ? ` ${v.time}` : ''), v.place].filter(Boolean).join(' · ');
  return `
    <li>
      <button class="item" data-id="${esc(v.id)}">
        <span class="dot dot-${esc(v.type)}" aria-hidden="true"></span>
        <span class="item-main">
          <span class="item-title">${esc(visitTitle(v))}</span>
          <span class="item-sub">${esc(sub)}</span>
        </span>
        <span class="item-meta">${g ? `v ${g.label}` : ''}</span>
      </button>
    </li>`;
}

function bindVisitItems() {
  for (const b of view.querySelectorAll('.item[data-id]')) {
    b.addEventListener('click', () => openVisit(data.visits.find((v) => v.id === b.dataset.id)));
  }
}

// ---------- Calendar ----------

// The month shown and the selected day survive switching tabs.
let calMonth = null; // { year, month }
let calSelected = null;

function renderCalendar() {
  const today = todayIso();
  const start = startDate(data);
  const due = dueDate(data);
  const lastDay = addDays(start, CALENDAR_DAYS);
  if (!calSelected) calSelected = today;
  if (!calMonth) calMonth = monthOf(calSelected);
  const { year, month } = calMonth;
  const minMonth = monthOf(start);
  const maxMonth = monthOf(lastDay);
  const canPrev = year * 12 + month > minMonth.year * 12 + minMonth.month;
  const canNext = year * 12 + month < maxMonth.year * 12 + maxMonth.month;
  const visitsByDate = new Map();
  for (const v of data.visits) {
    if (!visitsByDate.has(v.date)) visitsByDate.set(v.date, []);
    visitsByDate.get(v.date).push(v);
  }

  const cells = monthGrid(year, month).map((iso, i) => {
    const g = iso <= lastDay ? gestationOn(start, iso) : null;
    const inMonth = iso.slice(0, 7) === isoOf(year, month, 1).slice(0, 7);
    const cls = ['day'];
    if (!inMonth) cls.push('outside');
    if (g) cls.push(g.weeks % 2 ? 'tint-b' : 'tint-a');
    // A week band starts on its first day and again at the start of each row.
    const bandStart = g && (g.extraDays === 0 || i % 7 === 0);
    if (g && g.extraDays === 0) cls.push('week-start');
    if (iso === today) cls.push('today');
    if (iso === calSelected) cls.push('selected');
    if (iso === due) cls.push('due');
    const tag = iso === due ? 'BF' : bandStart ? `v${g.weeks}` : '';
    const visits = visitsByDate.get(iso) || [];
    const label = `${formatLong(iso)}${g ? `, vecka ${g.label}` : ''}${iso === due ? ', beräknat förlossningsdatum' : ''}${visits.length ? `, ${visits.length} besök` : ''}`;
    return `
      <button class="${cls.join(' ')}" data-date="${iso}" aria-label="${esc(label)}" ${iso === calSelected ? 'aria-pressed="true"' : ''}>
        <span class="tag">${tag}</span>
        <span class="num">${Number(iso.slice(8))}</span>
        <span class="dots">${visits.slice(0, 3).map((v) => `<i class="dot dot-${esc(v.type)}"></i>`).join('')}</span>
      </button>`;
  }).join('');

  view.innerHTML = `
    <h1 class="page-title">Kalender</h1>
    <div class="cal-head">
      <button class="icon-btn" id="cal-prev" aria-label="Föregående månad" ${canPrev ? '' : 'disabled'}>‹</button>
      <h2 class="cal-title" aria-live="polite">${esc(capitalize(monthTitle(year, month)))}</h2>
      <button class="icon-btn" id="cal-next" aria-label="Nästa månad" ${canNext ? '' : 'disabled'}>›</button>
    </div>
    <div class="cal" id="cal">
      ${['mån', 'tis', 'ons', 'tor', 'fre', 'lör', 'sön'].map((d) => `<span class="wd">${d}</span>`).join('')}
      ${cells}
    </div>
    <p class="cal-legend">Varje färgfält är en graviditetsvecka. Dina veckor börjar på ${esc(weekdayName(start))}ar.
      ${calSelected !== today ? '<button class="link-btn" id="cal-today">Till idag</button>' : ''}</p>
    ${dayDetail(calSelected, start, due, lastDay, visitsByDate.get(calSelected) || [])}`;

  view.querySelector('#cal-prev').addEventListener('click', () => shiftMonth(-1));
  view.querySelector('#cal-next').addEventListener('click', () => shiftMonth(1));
  view.querySelector('#cal-today')?.addEventListener('click', () => {
    calSelected = todayIso();
    calMonth = monthOf(calSelected);
    renderCalendar();
  });
  for (const b of view.querySelectorAll('.day')) {
    b.addEventListener('click', () => {
      calSelected = b.dataset.date;
      calMonth = monthOf(calSelected);
      renderCalendar();
    });
  }
  view.querySelector('#cal-add').addEventListener('click', () => openVisit(null, calSelected));
  bindVisitItems();

  // Swipe between months.
  const cal = view.querySelector('#cal');
  let x0 = null;
  cal.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  cal.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    x0 = null;
    if (Math.abs(dx) < 50) return;
    if (dx < 0 && canNext) shiftMonth(1);
    if (dx > 0 && canPrev) shiftMonth(-1);
  });
}

function dayDetail(iso, start, due, lastDay, visits) {
  const g = iso <= lastDay ? gestationOn(start, iso) : null;
  const left = toDay(due) - toDay(iso);
  let info;
  if (!g) info = `<p class="muted">${iso < start ? 'Före graviditeten.' : 'Efter 42+0.'}</p>`;
  else {
    info = `
      <p class="detail-week"><strong>${g.label}</strong> <span>vecka + dag</span></p>
      <p class="muted">${trimester(g.days)}:${trimester(g.days) === 3 ? 'e' : 'a'} trimestern · ${
        left > 0 ? `${left} ${left === 1 ? 'dag' : 'dagar'} kvar till BF` : left === 0 ? 'Beräknat förlossningsdatum 💗' : `${-left} ${left === -1 ? 'dag' : 'dagar'} efter BF`}</p>`;
  }
  return `
    <section class="card day-detail">
      <p class="card-label">${esc(capitalize(formatLong(iso)))} ${iso.slice(0, 4)}</p>
      ${info}
      ${visits.length ? `<ul class="list">${visits.map((v) => visitItem(v, start)).join('')}</ul>` : ''}
      <button class="btn btn-soft btn-block" id="cal-add">+ Lägg till besök den här dagen</button>
    </section>`;
}

function shiftMonth(delta) {
  const m = calMonth.year * 12 + calMonth.month + delta;
  calMonth = { year: Math.floor(m / 12), month: m % 12 };
  renderCalendar();
}

function monthOf(iso) {
  return { year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) - 1 };
}

function isoOf(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function renderSettings() {
  const today = todayIso();
  const notifySupport = notificationsSupported();
  const denied = notifySupport && Notification.permission === 'denied';

  view.innerHTML = `
    <h1 class="page-title">Inställningar</h1>
    <form class="card" id="dates-form" novalidate>
      <h2 class="card-title">Mina datum</h2>
      <label class="field">
        <span>Första dagen i sista mens</span>
        <input type="date" name="lmp" value="${esc(data.lmp)}" max="${today}" required>
        <small class="error" id="lmp-error" role="alert"></small>
      </label>
      <label class="field">
        <span>BF enligt ultraljud <em>(valfritt)</em></span>
        <input type="date" name="bf" value="${esc(data.dueDateOverride || '')}">
        <small class="hint">Fyll i om barnmorskan gett dig ett nytt BF efter ultraljudet. Töm fältet för att räkna från sista mens igen.</small>
        <small class="error" id="bf-error" role="alert"></small>
      </label>
      <button class="btn btn-primary" type="submit">Spara</button>
    </form>

    <section class="card">
      <h2 class="card-title">Påminnelser</h2>
      ${notifySupport ? `
        <label class="toggle">
          <input type="checkbox" id="notify" ${data.notify && !denied ? 'checked' : ''} ${denied ? 'disabled' : ''}>
          <span class="track" aria-hidden="true"></span>
          <span>Notis dagen före ett besök</span>
        </label>
        <p class="hint">${denied
          ? 'Notiser är blockerade för den här appen. Du kan tillåta dem i telefonens inställningar.'
          : 'Notisen visas när appen öppnas eller uppdateras i bakgrunden, och fungerar bäst om appen är installerad på hemskärmen. Säkrast är att lägga besöken i kalendern.'}</p>` : `
        <p class="alert">Notiser stöds inte här. Använd <strong>Lägg till i kalendern</strong> på varje besök så får du en påminnelse i telefonens kalender.${isIos() ? ' På iPhone kan notiser fungera om du först lägger till appen på hemskärmen (Dela → Lägg till på hemskärmen).' : ''}</p>`}
    </section>

    <section class="card">
      <h2 class="card-title">Dela med din partner</h2>
      <p class="hint">Skicka en länk med dina datum och besök. När den öppnas läggs uppgifterna in i appen på den andra telefonen. Uppgifterna finns bara i länken och skickas inte via någon server. Om ni ändrar något senare delar ni en ny länk.</p>
      <div class="actions start">
        <button class="btn btn-soft" id="share">🔗 Dela länk</button>
      </div>
    </section>

    <section class="card">
      <h2 class="card-title">Säkerhetskopia</h2>
      <p class="hint">Spara en kopia av dina uppgifter som fil, till exempel om du byter telefon.</p>
      <div class="actions start">
        <button class="btn btn-soft" id="export">Exportera</button>
        <button class="btn btn-soft" id="import">Importera</button>
      </div>
    </section>

    <button class="btn btn-danger-soft btn-block" id="wipe">Radera alla uppgifter</button>
    <p class="fineprint">Allt sparas bara på den här enheten. Inget skickas någonstans.</p>`;

  const form = view.querySelector('#dates-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const now = todayIso();
    const lmpErr = validateLmp(form.lmp.value, now);
    const bfErr = validateDueDateOverride(form.bf.value, now);
    form.querySelector('#lmp-error').textContent = lmpErr || '';
    form.querySelector('#bf-error').textContent = bfErr || '';
    if (lmpErr || bfErr) return;
    data.lmp = form.lmp.value;
    data.dueDateOverride = form.bf.value || null;
    commit();
    toast('Sparat');
  });

  const notify = view.querySelector('#notify');
  if (notify) notify.addEventListener('change', () => setNotify(notify));

  view.querySelector('#share').addEventListener('click', shareLink);
  view.querySelector('#export').addEventListener('click', exportBackup);
  view.querySelector('#import').addEventListener('click', () => document.getElementById('import-file').click());
  view.querySelector('#wipe').addEventListener('click', async () => {
    const ok = await confirmDialog('Radera allt?', 'Sista mens, BF och alla besök tas bort från den här enheten. Det går inte att ångra.', 'Radera');
    if (!ok) return;
    store.clear();
    data = store.emptyData();
    location.hash = '';
    route();
  });
}

// ---------- Visit dialog ----------

const visitDialog = document.getElementById('visit-dialog');
const visitForm = document.getElementById('visit-form');
let editingId = null;

function openVisit(visit, date) {
  editingId = visit ? visit.id : null;
  visitForm.reset();
  document.getElementById('visit-dialog-title').textContent = visit ? 'Ändra besök' : 'Nytt besök';
  visitForm.type.value = visit?.type || 'midwife';
  visitForm.title.value = visit?.title || '';
  visitForm.date.value = visit?.date || date || todayIso();
  visitForm.time.value = visit?.time || '';
  visitForm.place.value = visit?.place || '';
  visitForm.note.value = visit?.note || '';
  document.getElementById('visit-delete').hidden = !visit;
  document.getElementById('visit-date-error').textContent = '';
  updateVisitWeek();
  visitDialog.showModal();
}

function updateVisitWeek() {
  const g = visitForm.date.value ? gestationOn(startDate(data), visitForm.date.value) : null;
  document.getElementById('visit-week').textContent = g ? `Då är du i vecka ${g.label}` : '';
}

function readVisitForm() {
  return {
    id: editingId || store.newId(),
    type: visitForm.type.value in VISIT_TYPES ? visitForm.type.value : 'other',
    title: visitForm.title.value.trim(),
    date: visitForm.date.value,
    time: visitForm.time.value,
    place: visitForm.place.value.trim(),
    note: visitForm.note.value.trim(),
  };
}

function checkVisitDate() {
  const ok = !!visitForm.date.value;
  document.getElementById('visit-date-error').textContent = ok ? '' : 'Välj ett datum';
  return ok;
}

visitForm.date.addEventListener('input', updateVisitWeek);
document.getElementById('visit-cancel').addEventListener('click', () => visitDialog.close());

visitForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!checkVisitDate()) return;
  const v = readVisitForm();
  const i = data.visits.findIndex((x) => x.id === v.id);
  if (i >= 0) data.visits[i] = v;
  else data.visits.push(v);
  commit();
  visitDialog.close();
  route();
  toast('Besöket är sparat');
});

document.getElementById('visit-delete').addEventListener('click', async () => {
  const v = data.visits.find((x) => x.id === editingId);
  if (!v) return;
  const ok = await confirmDialog('Ta bort besöket?', `${visitTitle(v)}, ${formatShort(v.date)}${v.time ? ` ${v.time}` : ''}`, 'Ta bort');
  if (!ok) return;
  data.visits = data.visits.filter((x) => x.id !== editingId);
  commit();
  visitDialog.close();
  route();
  toast('Besöket är borttaget');
});

document.getElementById('visit-ics').addEventListener('click', () => {
  if (!checkVisitDate()) return;
  const v = readVisitForm();
  download(`${slug(visitTitle(v))}-${v.date}.ics`, visitToIcs(v), 'text/calendar');
  toast('Kalenderfil skapad – påminnelse dagen innan');
});

// Close sheets when tapping the backdrop.
for (const d of document.querySelectorAll('dialog')) {
  d.addEventListener('click', (e) => {
    if (e.target === d) d.close('cancel');
  });
}

// ---------- Confirm dialog ----------

const confirmEl = document.getElementById('confirm-dialog');
function confirmDialog(title, text, okLabel) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-text').textContent = text;
  document.getElementById('confirm-ok').textContent = okLabel;
  confirmEl.returnValue = '';
  confirmEl.showModal();
  return new Promise((resolve) => {
    confirmEl.addEventListener('close', () => resolve(confirmEl.returnValue === 'ok'), { once: true });
  });
}

// ---------- Backup ----------

function exportBackup() {
  const body = JSON.stringify({ app: 'due-date', exported: new Date().toISOString(), ...data }, null, 2);
  download(`due-date-backup-${todayIso()}.json`, body, 'application/json');
  toast('Säkerhetskopian är nedladdad');
}

document.getElementById('import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  let imported;
  try {
    imported = store.normalize(JSON.parse(await file.text()));
    if (!imported.lmp) throw new Error('Filen saknar sista mens');
  } catch (err) {
    toast(`Kunde inte läsa filen: ${err.message}`);
    return;
  }
  const ok = await confirmDialog('Importera?', `Dina nuvarande uppgifter ersätts med filens (${imported.visits.length} besök).`, 'Importera');
  if (!ok) return;
  data = imported;
  commit();
  go('idag');
  toast('Uppgifterna är importerade');
});

// ---------- Share link ----------

async function shareLink() {
  const url = shareUrl(data, location.origin + location.pathname);
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Due date', text: 'Här är våra datum och besök i Due date:', url });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast('Länken är kopierad');
  } catch {
    window.prompt('Kopiera länken:', url);
  }
}

// Returns true when the URL is a share link; it is then handled asynchronously.
function handleShareLink() {
  if (!location.hash.startsWith(SHARE_PREFIX)) return false;
  receiveShare(location.hash.slice(SHARE_PREFIX.length));
  return true;
}

async function receiveShare(token) {
  // Drop the data from the address bar so a reload does not ask again.
  history.replaceState(null, '', location.pathname + location.search);
  route();
  let shared;
  try {
    shared = store.normalize(decodeShare(token));
    if (!shared.lmp) throw new Error('Länken saknar sista mens');
  } catch (err) {
    toast(`Kunde inte läsa länken: ${err.message}`);
    return;
  }
  const summary = `Sista mens ${formatShort(shared.lmp, { year: true })}` +
    (shared.dueDateOverride ? `, BF enligt ultraljud ${formatShort(shared.dueDateOverride, { year: true })}` : '') +
    `, ${shared.visits.length} besök.`;
  const fresh = !data.lmp;
  const ok = await confirmDialog(
    fresh ? 'Lägg in delade uppgifter?' : 'Uppdatera med delade uppgifter?',
    fresh ? summary : `${summary} Datumen ersätts och besöken läggs till bland dina egna.`,
    fresh ? 'Lägg in' : 'Uppdatera',
  );
  if (!ok) return;
  const { data: merged, added, updated } = mergeShared(data, shared);
  data = merged;
  commit();
  go('idag');
  toast(fresh ? 'Uppgifterna är inlagda' : `Uppdaterat: ${added} nya, ${updated} ändrade besök`);
}

// ---------- Reminders ----------

function notificationsSupported() {
  return 'Notification' in window && 'serviceWorker' in navigator;
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

async function setNotify(checkbox) {
  if (checkbox.checked) {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      checkbox.checked = false;
      data.notify = false;
      commit();
      renderSettings();
      return;
    }
    await registerPeriodicSync();
  }
  data.notify = checkbox.checked;
  commit();
  toast(data.notify ? 'Påminnelser på' : 'Påminnelser av');
}

async function registerPeriodicSync() {
  try {
    const reg = await navigator.serviceWorker.ready;
    if ('periodicSync' in reg) {
      const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
      if (status.state === 'granted') await reg.periodicSync.register('visit-reminders', { minInterval: 6 * 60 * 60 * 1000 });
    }
  } catch {
    // Not supported: reminders still run when the app is opened.
  }
}

async function checkReminders() {
  if (!data.notify || !notificationsSupported() || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker.ready;
    reg.active?.postMessage({ type: 'check-reminders' });
  } catch {
    // Best effort.
  }
}

// ---------- Helpers ----------

let toastTimer;
function toast(text) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function slug(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'besok';
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------- Start ----------

// ---------- Updates ----------

// A new version installs in the background and takes over (skipWaiting +
// clients.claim in sw.js). Reload then, but not on the very first install and
// not while a dialog is open, so nothing being typed is lost.
let reloading = false;
function reloadForUpdate() {
  if (reloading) return;
  const open = document.querySelector('dialog[open]');
  if (open) {
    open.addEventListener('close', reloadForUpdate, { once: true });
    return;
  }
  reloading = true;
  location.reload();
}

function checkForUpdate() {
  navigator.serviceWorker?.getRegistration().then((reg) => reg?.update()).catch(() => {});
}

if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) reloadForUpdate();
  });
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
if (data.lmp) store.mirror(data).then(checkReminders);
if (!handleShareLink()) route();
