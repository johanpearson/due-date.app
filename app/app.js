import {
  todayIso, startDate, dueDate, gestationOn, trimester, progressPercent,
  validateLmp, validateDueDateOverride, formatLong, formatShort, daysLeftText,
  VISIT_TYPES, visitTitle, splitVisits, visitToIcs,
} from './calc.js';
import * as store from './store.js';

let data = store.load();
const view = document.getElementById('view');
const tabbar = document.getElementById('tabbar');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function commit() {
  store.save(data);
  checkReminders();
}

// ---------- Routing ----------

const routes = { idag: renderHome, besok: renderVisits, installningar: renderSettings };

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

window.addEventListener('hashchange', route);

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

function openVisit(visit) {
  editingId = visit ? visit.id : null;
  visitForm.reset();
  document.getElementById('visit-dialog-title').textContent = visit ? 'Ändra besök' : 'Nytt besök';
  visitForm.type.value = visit?.type || 'midwife';
  visitForm.title.value = visit?.title || '';
  visitForm.date.value = visit?.date || todayIso();
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

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
if (data.lmp) store.mirror(data).then(checkReminders);
route();
