// Utilidades generales: ids, fechas, formato, plantillas HTML seguras.

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ---------- HTML seguro ----------
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(s);

/** Plantilla etiquetada: escapa interpolaciones salvo raw() y arrays de raw. */
export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < vals.length) out += render(vals[i]);
  });
  return raw(out);
}
function render(v) {
  if (v == null || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(render).join('');
  return esc(v);
}

// ---------- Números y dinero ----------
export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const num = (v) => {
  if (typeof v === 'number') return v;
  if (v == null || v === '') return 0;
  const s = String(v).trim().replace(/\s/g, '');
  // Acepta "1.234,56", "1234,56" y "1234.56"
  const norm = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = parseFloat(norm);
  return Number.isFinite(n) ? n : 0;
};

let LOCALE = 'es-ES';
let HIDE = false;
export const setLocale = (l) => { LOCALE = l || 'es-ES'; };
export const setHidden = (h) => { HIDE = !!h; };

export function money(n, cur = 'EUR', opts = {}) {
  if (HIDE && !opts.force) return '•••• ' + curSymbol(cur);
  const v = Number(n) || 0;
  try {
    return new Intl.NumberFormat(LOCALE, {
      style: 'currency', currency: cur,
      minimumFractionDigits: opts.decimals ?? 2,
      maximumFractionDigits: opts.decimals ?? 2,
      signDisplay: opts.sign ? 'exceptZero' : 'auto', useGrouping: 'always',
    }).format(v);
  } catch {
    return v.toFixed(2) + ' ' + cur;
  }
}
export function curSymbol(cur) {
  try {
    return new Intl.NumberFormat(LOCALE, { style: 'currency', currency: cur, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0).find((p) => p.type === 'currency')?.value || cur;
  } catch { return cur; }
}
export const pct = (n, d = 1) =>
  (Number.isFinite(n) ? (n * 100).toFixed(d).replace('.', ',') : '0') + ' %';
export const fmtNum = (n, d = 4) =>
  new Intl.NumberFormat(LOCALE, { maximumFractionDigits: d, useGrouping: 'always' }).format(Number(n) || 0);

// ---------- Fechas (siempre YYYY-MM-DD, hora local) ----------
export const pad = (n) => String(n).padStart(2, '0');
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => toISO(new Date());
export const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d || 1); };
export const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate(); // m: 0-11
export function addDays(iso, n) { const d = parseISO(iso); d.setDate(d.getDate() + n); return toISO(d); }
export function addMonths(iso, n, dayWanted) {
  const d = parseISO(iso);
  const day = dayWanted ?? d.getDate();
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  t.setDate(Math.min(day, daysInMonth(t.getFullYear(), t.getMonth())));
  return toISO(t);
}
export const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
export function monthsBetween(a, b) {
  const da = parseISO(a), db = parseISO(b);
  return (db.getFullYear() - da.getFullYear()) * 12 + (db.getMonth() - da.getMonth()) +
    (db.getDate() >= da.getDate() ? 0 : -1);
}
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const monthShort = (m) => MESES[m];
export const monthLong = (m) => MESES_L[m];
export function fmtDate(iso, long = false) {
  if (!iso) return '';
  const d = parseISO(iso);
  return long ? `${d.getDate()} de ${MESES_L[d.getMonth()]} de ${d.getFullYear()}`
    : `${d.getDate()} ${MESES[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''}`;
}

// ---------- Varios ----------
export const sum = (arr, f = (x) => x) => arr.reduce((a, x) => a + (Number(f(x)) || 0), 0);
export const groupBy = (arr, f) => arr.reduce((m, x) => { const k = f(x); (m[k] ||= []).push(x); return m; }, {});
export const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
export const byId = (arr, id) => arr.find((x) => x.id === id);
export const deepClone = (o) => JSON.parse(JSON.stringify(o));
export function debounce(fn, ms = 300) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
