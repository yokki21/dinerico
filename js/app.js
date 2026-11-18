// Punto de entrada: arranque, bloqueo, enrutado y marco de la app.
import * as store from './store.js';
import { setLocale, setHidden, esc, today, daysBetween } from './util.js';
import { dueRecurring, refreshSnapshot, alerts, base, missingRates } from './calc.js';
import { materialize, txForm } from './forms.js';
import { fetchFx, refreshPrices } from './prices.js';
import { toast, closeAllSheets } from './ui.js';
import { lockScreen } from './views/lock.js';
import * as main from './views/main.js';
import * as plan from './views/plan.js';
import * as money from './views/money.js';
import * as invest from './views/invest.js';
import * as reports from './views/reports.js';
import * as settings from './views/settings.js';
import * as onboarding from './views/onboarding.js';

const ROUTES = { ...main.routes, ...plan.routes, ...money.routes, ...invest.routes, ...reports.routes, ...settings.routes, ...onboarding.routes };
const TAB_OF = { inicio: 'inicio', movimientos: 'movimientos', recurrentes: 'movimientos', plan: 'plan', objetivos: 'plan' };

const viewEl = () => document.getElementById('view');
let current = null;
let hiddenAt = null;

function applyTheme(s) {
  const t = s?.settings.theme || 'auto';
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#0f1320' : '#f5f6fa');
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme(store.getState()));

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [name, ...params] = h.split('/').map(decodeURIComponent);
  return { name: name || 'inicio', params };
}

export function render() {
  const s = store.getState(); if (!s) return;
  setHidden(s.settings.hideAmounts); setLocale(s.settings.locale);
  let { name, params } = parseHash();
  if (!s.settings.onboarded && name !== 'bienvenida' && name !== 'ajustes') { location.replace('#/bienvenida'); return; }
  const r = ROUTES[name] || ROUTES.inicio;
  if (!ROUTES[name]) name = 'inicio';
  const sameView = current === location.hash;
  const y = sameView ? window.scrollY : 0;
  document.body.dataset.view = name;
  document.getElementById('title').textContent = typeof r.title === 'function' ? r.title(s, params) : r.title;
  document.getElementById('back').hidden = !r.back;
  document.getElementById('back').onclick = () => { if (history.length > 1) history.back(); else location.hash = r.back; };
  const shell = !r.bare;
  document.querySelector('.tabs').hidden = !shell; document.getElementById('fab').hidden = !shell || r.noFab;
  document.querySelector('.top').hidden = !!r.noTop;
  const tab = TAB_OF[name] || (shell ? 'mas' : null);
  document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  document.getElementById('eye').textContent = s.settings.hideAmounts ? '🙈' : '👁️';
  document.getElementById('lockbtn').hidden = !s.settings.pinEnabled;
  const badge = document.getElementById('badge');
  const n = alerts(s).filter((a) => a.level === 'bad' || a.level === 'warn').length;
  badge.textContent = n; badge.hidden = !n;
  const el = viewEl();
  // Conserva el campo con el foco al redibujar (p. ej. al guardar un valor y tocar el siguiente)
  const act = document.activeElement;
  const focusSel = act && el.contains(act) && act.name ? `[name="${CSS.escape(act.name)}"]` : null;
  try {
    el.innerHTML = String(r.render(s, params));
    r.mount?.(el, s, params);
    if (focusSel && sameView) el.querySelector(focusSel)?.focus({ preventScroll: true });
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div class="card"><h3>Algo ha fallado</h3><p class="small">${esc(e.message)}</p><a class="btn" href="#/inicio">Volver al inicio</a></div>`;
  }
  current = location.hash;
  window.scrollTo(0, y);
}

/** Apunta recurrentes automáticos y actualiza la foto del patrimonio. */
function housekeeping() {
  const s = store.getState();
  const due = dueRecurring(s).filter((d) => d.rec.mode === 'auto');
  if (due.length) {
    store.update((st) => { for (const d of due) materialize(st, d.rec, d.date); }, { silent: true });
    toast(`${due.length} movimiento${due.length > 1 ? 's' : ''} recurrente${due.length > 1 ? 's' : ''} apuntado${due.length > 1 ? 's' : ''}`);
  }
  if (refreshSnapshot(s)) store.update(() => {}, { silent: true });
}

async function onlineRefresh(force = false) {
  const s = store.getState(); if (!s || !navigator.onLine) return;
  const needFx = s.accounts.some((a) => a.currency !== base(s)) || s.assets.some((a) => a.currency !== base(s));
  if (needFx && (force || !s.fx.date || s.fx.base !== base(s) || daysBetween(s.fx.date, today()) >= 1 || missingRates(s).length)) {
    try { const fx = await fetchFx(base(s)); store.update((st) => { st.fx = { ...st.fx, ...fx }; }); } catch { /* sin conexión: se mantienen los tipos guardados */ }
  }
  const auto = s.assets.some((a) => !a.closed && a.source !== 'manual' && a.source);
  const last = s.settings.lastPriceRefresh;
  if (auto && (force || !last || Date.now() - last > 6 * 3600 * 1000)) {
    try {
      const copy = JSON.parse(JSON.stringify(s.assets));
      const res = await refreshPrices({ ...s, assets: copy });
      store.update((st) => { for (const a of copy) { const t = st.assets.find((x) => x.id === a.id); if (t) { t.price = a.price; t.priceDate = a.priceDate; } } st.settings.lastPriceRefresh = Date.now(); });
      if (force) toast(res.fail.length ? `Actualizados ${res.ok}; fallaron ${res.fail.map((f) => f.name).join(', ')}` : `Precios actualizados (${res.ok})`, res.fail.length ? 'warn' : 'ok');
    } catch { /* */ }
  }
}
export const refreshOnline = () => onlineRefresh(true);

function start() {
  const s = store.getState();
  applyTheme(s);
  document.getElementById('app').hidden = false;
  housekeeping();
  if (!location.hash) location.replace(s.settings.onboarded ? '#/inicio' : '#/bienvenida');
  render();
  onlineRefresh();
}

async function showLock() {
  closeAllSheets();
  document.getElementById('app').hidden = true;
  await lockScreen(async (pin) => {
    const ok = await store.unlock(pin);
    if (ok) start();
    return ok;
  });
}

async function boot() {
  const status = await store.boot();
  applyTheme(store.getState());
  let pending = null; // agrupa redibujados y deja que el foco llegue al campo tocado antes de redibujar
  store.onChange(() => { applyTheme(store.getState()); clearTimeout(pending); pending = setTimeout(render, 30); });
  window.addEventListener('hashchange', () => { closeAllSheets(); render(); });
  document.getElementById('fab').onclick = () => txForm();
  document.getElementById('eye').onclick = () => store.update((st) => { st.settings.hideAmounts = !st.settings.hideAmounts; });
  document.getElementById('lockbtn').onclick = () => { store.save().then(() => { store.lock(); showLock(); }); };
  document.addEventListener('visibilitychange', () => {
    const s = store.getState();
    if (document.hidden) { hiddenAt = Date.now(); store.save().catch(() => {}); return; }
    if (s && s.settings.pinEnabled && hiddenAt && Date.now() - hiddenAt > (s.settings.autoLockMin || 5) * 60000) { store.lock(); showLock(); }
    else if (s) { housekeeping(); render(); onlineRefresh(); }
    hiddenAt = null;
  });
  window.addEventListener('online', () => onlineRefresh());
  if (status === 'locked') showLock(); else start();
  store.requestPersistence();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {});
}

boot().catch((e) => {
  document.body.innerHTML = `<div style="padding:24px;font-family:sans-serif"><h2>No se pudo abrir Dinerico</h2><p>${esc(e.message)}</p></div>`;
});
