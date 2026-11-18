// Inicio, movimientos y recurrentes.
import { html, raw, money, pct, fmtDate, byId, sum, esc, today, groupBy } from '../util.js';
import {
  periodOf, shiftPeriod, periodSummary, periodProgress, budgetStatus, alerts, netWorth, base,
  catName, rootCat, balance, activeAccounts, goalInfo, txBase, dueRecurring, recurringMonthly, upcomingRecurring, budgetTotal, savingsTarget,
} from '../calc.js';
import { donut, progress, PALETTE } from '../charts.js';
import { txForm, recurringForm, materialize, accountForm } from '../forms.js';
import { update } from '../store.js';
import { ACCOUNT_TYPES } from '../defaults.js';
import { toast, sheet, field, readForm } from '../ui.js';

// ---------- piezas reutilizables ----------
export function txRow(s, t) {
  const acc = byId(s.accounts, t.accountId);
  const cur = acc?.currency || base(s);
  let icon = '•', title = t.note || '', sub = '', amt = '', cls = '';
  if (t.type === 'expense' || t.type === 'income') {
    const c = byId(s.categories, t.categoryId); const r = rootCat(s, t.categoryId);
    icon = c?.icon || r?.icon || (t.type === 'income' ? '➕' : '➖');
    title = t.note || c?.name || 'Sin categoría';
    sub = `${t.note ? catName(s, t.categoryId) + ' · ' : ''}${acc?.name || '?'}`;
    amt = money(t.type === 'expense' ? -t.amount : t.amount, cur, { sign: true }); cls = t.type === 'income' ? 'pos' : '';
  } else if (t.type === 'transfer') {
    const to = byId(s.accounts, t.toAccountId);
    icon = '⇄'; title = t.note || 'Traspaso'; sub = `${acc?.name || '?'} → ${to?.name || '?'}`; amt = money(t.amount, cur); cls = 'neutral';
  } else if (t.type === 'adjust') {
    icon = '⚖️'; title = t.note || 'Ajuste de saldo'; sub = acc?.name || ''; amt = money(t.amount, cur, { sign: true }); cls = 'neutral';
  } else if (t.type === 'debtmove') {
    const d = byId(s.debts, t.debtId);
    icon = '🤝'; title = t.note || d?.name || 'Deuda'; sub = acc?.name || ''; amt = money(t.amount, cur, { sign: true }); cls = 'neutral';
  }
  return html`<button class="li" data-tx="${t.id}"><span class="ic">${icon}</span>
    <span class="tx"><b>${title}</b><small>${sub}${t.recurringId ? ' · 🔁' : ''}</small></span><span class="amt ${cls}">${amt}</span></button>`;
}
export function bindTxRows(el, s) {
  el.querySelectorAll('[data-tx]').forEach((b) => { b.onclick = () => txForm(byId(s.transactions, b.dataset.tx)); });
}
function alertList(s, list) {
  if (!list.length) return '';
  return html`<div class="alerts">${list.map((a) => html`<div class="alert ${a.level}"><a href="${a.go || '#/inicio'}"><span>${a.icon}</span><span>${a.text}</span></a>
    ${a.id ? html`<button class="icon-btn" data-dismiss="${a.id}" aria-label="Descartar">✕</button>` : ''}</div>`)}</div>`;
}
export function bindAlerts(el) {
  el.querySelectorAll('[data-dismiss]').forEach((b) => { b.onclick = () => update((st) => { st.dismissed[b.dataset.dismiss] = today(); }); });
}
export function periodNav(p, extra = '') {
  return html`<div class="pnav"><button class="icon-btn" data-pp="-1" aria-label="Anterior">‹</button>
    <div><b>${p.label}</b><small>${p.range}</small></div><button class="icon-btn" data-pp="1" aria-label="Siguiente">›</button>${raw(extra)}</div>`;
}

// ======================= Inicio =======================
function home(s) {
  const B = base(s);
  const p = periodOf(s);
  const sm = periodSummary(s, p);
  const nw = netWorth(s);
  const prevSnap = [...s.snapshots].reverse().find((x) => x.period < p.key);
  const delta = prevSnap ? nw.netWorth - prevSnap.netWorth : null;
  const al = alerts(s);
  const bs = budgetStatus(s, p);
  const bt = budgetTotal(s);
  const prog = periodProgress(p);
  const goals = s.goals.filter((g) => !g.closed).map((g) => goalInfo(s, g)).slice(0, 3);
  const cats = Object.entries(sm.byCat).sort((a, b) => b[1] - a[1]);
  const items = cats.slice(0, 6).map(([id, v], i) => ({ label: byId(s.categories, id)?.name || 'Sin categoría', value: v, color: PALETTE[i] }));
  if (cats.length > 6) items.push({ label: 'Otras', value: sum(cats.slice(6), (x) => x[1]), color: '#8a93a6' });
  const recent = [...s.transactions].sort((a, b) => b.date.localeCompare(a.date) || 0).slice(0, 6);
  const plan = s.plans[p.key];
  const plannedSave = plan?.accepted ? sum(plan.items, (i) => i.amount) : savingsTarget(s, sm.income || s.settings.expectedIncome);
  const canSpend = bt > 0 ? bt - sm.expense : (sm.income || s.settings.expectedIncome) - plannedSave - sm.expense;
  const up = upcomingRecurring(s, 10).filter((r) => r.type === 'expense');
  const hello = s.settings.name ? `Hola, ${s.settings.name}` : 'Hola';
  return html`
  <section class="hero card">
    <small class="muted">${hello} · patrimonio neto</small>
    <div class="big">${money(nw.netWorth, B)}</div>
    ${delta != null ? html`<small class="${delta >= 0 ? 'pos' : 'neg'}">${money(delta, B, { sign: true })} desde ${prevSnap.label.toLowerCase()}</small>` : ''}
    <div class="row3 mt"><a href="#/cuentas"><small>Liquidez</small><b>${money(nw.cash, B, { decimals: 0 })}</b></a>
      <a href="#/inversiones"><small>Inversiones</small><b>${money(nw.investments, B, { decimals: 0 })}</b></a>
      <a href="#/deudas"><small>Deudas</small><b>${money(nw.owe, B, { decimals: 0 })}</b></a></div>
  </section>
  ${alertList(s, al.slice(0, 5))}
  ${al.length > 5 ? html`<p class="small center"><a href="#/avisos">Ver los ${al.length} avisos</a></p>` : ''}
  <section class="card">
    <div class="row between"><h3>${p.label}</h3><small class="muted">${p.range}</small></div>
    ${raw(progress(prog))}<small class="muted">Llevas el ${Math.round(prog * 100)} % del periodo</small>
    <div class="row3 mt"><div><small>Ingresos</small><b class="pos">${money(sm.income, B, { decimals: 0 })}</b></div>
      <div><small>Gastos</small><b>${money(sm.expense, B, { decimals: 0 })}</b></div>
      <div><small>Ahorro</small><b class="${sm.savings >= 0 ? 'pos' : 'neg'}">${money(sm.savings, B, { decimals: 0 })}</b></div></div>
    <div class="callout mt"><span>💸</span><div><b>${money(Math.max(0, canSpend), B)}</b> <small>${bt > 0 ? 'quedan en tus presupuestos' : 'disponibles para gastar sin tocar el ahorro previsto'}</small></div></div>
    <div class="row gap mt"><a class="btn small" href="#/informe/${p.key}">Ver informe</a><a class="btn small ghost" href="#/plan">Reparto del mes</a></div>
  </section>
  ${items.length ? html`<section class="card"><h3>Gastos por categoría</h3>
    <div class="donut-row">${raw(donut(items, { center: money(sm.expense, B, { decimals: 0 }), sub: 'este periodo' }))}
    <ul class="legend">${items.map((x) => html`<li><i style="background:${x.color}"></i>${x.label}<b>${money(x.value, B, { decimals: 0 })}</b></li>`)}</ul></div></section>` : ''}
  ${bs.length ? html`<section class="card"><div class="row between"><h3>Presupuestos</h3><a class="small" href="#/plan">Todos</a></div>
    ${bs.slice(0, 4).map((b) => html`<div class="bud"><div class="row between"><span>${b.cat.icon} ${b.cat.name}</span><small>${money(b.spent, B, { decimals: 0 })} / ${money(b.limit, B, { decimals: 0 })}</small></div>${raw(progress(b.ratio, b.level))}</div>`)}</section>` : ''}
  ${goals.length ? html`<section class="card"><div class="row between"><h3>Objetivos</h3><a class="small" href="#/objetivos">Todos</a></div>
    ${goals.map((g) => html`<div class="bud"><div class="row between"><span>${g.g.icon} ${g.g.name}</span><small>${money(g.saved, B, { decimals: 0 })} / ${money(g.target, B, { decimals: 0 })}</small></div>${raw(progress(g.progress, g.done ? 'ok' : g.behind ? 'warn' : ''))}</div>`)}</section>` : ''}
  ${up.length ? html`<section class="card"><h3>Próximos cargos</h3>${up.map((r) => html`<div class="row between li-static"><span>📅 ${r.name}</span><small>${fmtDate(r.next)} · ${money(r.amount, B)}</small></div>`)}</section>` : ''}
  <section class="card"><div class="row between"><h3>Últimos movimientos</h3><a class="small" href="#/movimientos">Todos</a></div>
    ${recent.length ? html`<div class="list">${recent.map((t) => txRow(s, t))}</div>` : html`<p class="muted">Aún no hay movimientos. Pulsa <b>+</b> para apuntar el primero.</p>`}</section>
  <section class="card"><div class="row between"><h3>Cuentas</h3><a class="small" href="#/cuentas">Gestionar</a></div>
    ${activeAccounts(s).map((a) => html`<a class="row between li-static" href="#/cuenta/${a.id}"><span>${ACCOUNT_TYPES[a.type]?.icon} ${a.name}</span><b>${money(balance(s, a.id), a.currency)}</b></a>`)}</section>`;
}

// ======================= Movimientos =======================
const filters = { period: null, q: '', type: 'all', acc: '', cat: '', all: false };
function movimientos(s) {
  const B = base(s);
  const p = filters.period ? periodOf(s, filters.period) : periodOf(s);
  let txs = s.transactions;
  if (!filters.all) txs = txs.filter((t) => t.date >= p.start && t.date <= p.end);
  if (filters.type !== 'all') txs = txs.filter((t) => t.type === filters.type);
  if (filters.acc) txs = txs.filter((t) => t.accountId === filters.acc || t.toAccountId === filters.acc);
  if (filters.cat) txs = txs.filter((t) => t.categoryId === filters.cat || rootCat(s, t.categoryId)?.id === filters.cat);
  if (filters.q) {
    const q = filters.q.toLowerCase();
    txs = txs.filter((t) => (t.note || '').toLowerCase().includes(q) || catName(s, t.categoryId).toLowerCase().includes(q) || String(t.amount).includes(q));
  }
  txs = [...txs].sort((a, b) => b.date.localeCompare(a.date));
  const inc = sum(txs.filter((t) => t.type === 'income'), (t) => txBase(s, t));
  const exp = sum(txs.filter((t) => t.type === 'expense'), (t) => txBase(s, t));
  const byDay = groupBy(txs, (t) => t.date);
  const shown = Object.keys(byDay).slice(0, filters.all ? 120 : 400);
  const roots = s.categories.filter((c) => !c.parent);
  return html`
  ${filters.all ? html`<div class="pnav"><div><b>Todo el historial</b><small>${txs.length} movimientos</small></div></div>` : periodNav(p)}
  <div class="filters">
    <input type="search" id="q" placeholder="Buscar nota, categoría o importe" value="${filters.q}">
    <div class="chips">${[['all', 'Todo'], ['expense', 'Gastos'], ['income', 'Ingresos'], ['transfer', 'Traspasos']].map(([k, l]) => html`<button class="chip ${filters.type === k ? 'on' : ''}" data-ft="${k}">${l}</button>`)}
      <button class="chip ${filters.all ? 'on' : ''}" data-fall>Todo el historial</button></div>
    <div class="grid2"><select id="facc"><option value="">Todas las cuentas</option>${s.accounts.map((a) => html`<option value="${a.id}" ${raw(filters.acc === a.id ? 'selected' : '')}>${a.name}</option>`)}</select>
      <select id="fcat"><option value="">Todas las categorías</option>${roots.map((c) => html`<option value="${c.id}" ${raw(filters.cat === c.id ? 'selected' : '')}>${c.icon} ${c.name}</option>`)}</select></div>
  </div>
  <div class="row3 card slim"><div><small>Ingresos</small><b class="pos">${money(inc, B)}</b></div><div><small>Gastos</small><b>${money(exp, B)}</b></div><div><small>Balance</small><b class="${inc - exp >= 0 ? 'pos' : 'neg'}">${money(inc - exp, B)}</b></div></div>
  ${txs.length ? shown.map((d) => {
    const dayExp = sum(byDay[d].filter((t) => t.type === 'expense'), (t) => txBase(s, t));
    return html`<div class="day"><div class="day-h"><span>${fmtDate(d, true)}</span>${dayExp ? html`<small>−${money(dayExp, B)}</small>` : ''}</div>
      <div class="list card flush">${byDay[d].map((t) => txRow(s, t))}</div></div>`;
  }) : html`<div class="empty"><p>No hay movimientos con estos filtros.</p></div>`}
  <div class="row gap center mt"><a class="btn ghost small" href="#/recurrentes">🔁 Recurrentes</a><a class="btn ghost small" href="#/categorias">🏷️ Categorías</a></div>`;
}
function mountMov(el, s) {
  bindTxRows(el, s);
  el.querySelectorAll('[data-pp]').forEach((b) => { b.onclick = () => { const p = filters.period ? periodOf(s, filters.period) : periodOf(s); filters.period = shiftPeriod(s, p, Number(b.dataset.pp)).start; rerender(el, s); }; });
  el.querySelectorAll('[data-ft]').forEach((b) => { b.onclick = () => { filters.type = b.dataset.ft; rerender(el, s); }; });
  el.querySelector('[data-fall]').onclick = () => { filters.all = !filters.all; rerender(el, s); };
  el.querySelector('#facc').onchange = (e) => { filters.acc = e.target.value; rerender(el, s); };
  el.querySelector('#fcat').onchange = (e) => { filters.cat = e.target.value; rerender(el, s); };
  const q = el.querySelector('#q');
  q.oninput = () => { filters.q = q.value; rerender(el, s, true); };
}
function rerender(el, s, keepFocus) {
  const pos = keepFocus ? el.querySelector('#q').selectionStart : null;
  el.innerHTML = String(movimientos(s)); mountMov(el, s);
  if (keepFocus) { const q = el.querySelector('#q'); q.focus(); q.setSelectionRange(pos, pos); }
}

// ======================= Recurrentes =======================
function recurrentes(s) {
  const B = base(s);
  const due = dueRecurring(s).filter((d) => d.rec.mode === 'confirm');
  const act = s.recurring.filter((r) => r.active).sort((a, b) => a.next.localeCompare(b.next));
  const inact = s.recurring.filter((r) => !r.active);
  const monthlyOut = sum(act.filter((r) => r.type === 'expense'), recurringMonthly);
  const monthlyIn = sum(act.filter((r) => r.type === 'income'), recurringMonthly);
  const monthlyInv = sum(act.filter((r) => r.type === 'invest' || r.type === 'transfer'), recurringMonthly);
  const tl = { expense: 'Gasto', income: 'Ingreso', transfer: 'Traspaso', invest: 'Aportación' };
  const fl = { monthly: 'mensual', weekly: 'semanal', biweekly: 'quincenal', quarterly: 'trimestral', yearly: 'anual' };
  const row = (r) => html`<button class="li" data-rec="${r.id}"><span class="ic">${byId(s.categories, r.categoryId)?.icon || (r.type === 'invest' ? '📈' : r.type === 'transfer' ? '⇄' : '🔁')}</span>
    <span class="tx"><b>${r.name}</b><small>${tl[r.type]} ${fl[r.freq]} · próximo ${fmtDate(r.next)}${r.mode === 'confirm' ? ' · con confirmación' : ''}</small></span>
    <span class="amt ${r.type === 'income' ? 'pos' : ''}">${money(r.amount, byId(s.accounts, r.accountId)?.currency || B)}</span></button>`;
  return html`
  <div class="row3 card slim"><div><small>Ingresos fijos/mes</small><b class="pos">${money(monthlyIn, B, { decimals: 0 })}</b></div>
    <div><small>Gastos fijos/mes</small><b>${money(monthlyOut, B, { decimals: 0 })}</b></div><div><small>Ahorro automático</small><b>${money(monthlyInv, B, { decimals: 0 })}</b></div></div>
  ${due.length ? html`<section class="card"><h3>Por confirmar</h3>${due.map((d, i) => html`<div class="pending" data-i="${i}">
      <div><b>${d.rec.name}</b><small>${fmtDate(d.date)}</small></div>
      <input data-money inputmode="decimal" value="${String(d.rec.amount).replace('.', ',')}">
      <button class="btn small primary" data-ok="${i}">✓</button><button class="btn small ghost" data-skip="${i}">Saltar</button></div>`)}</section>` : ''}
  <section class="card"><div class="row between"><h3>Activos</h3><button class="btn small" data-new>+ Nuevo</button></div>
    ${act.length ? html`<div class="list">${act.map(row)}</div>` : html`<p class="muted">Añade tu nómina, alquiler, suscripciones o aportaciones periódicas para que se apunten solos.</p>`}</section>
  ${inact.length ? html`<section class="card"><h3>Pausados</h3><div class="list">${inact.map(row)}</div></section>` : ''}`;
}
function mountRec(el, s) {
  const due = dueRecurring(s).filter((d) => d.rec.mode === 'confirm');
  el.querySelector('[data-new]').onclick = () => recurringForm();
  el.querySelectorAll('[data-rec]').forEach((b) => { b.onclick = () => recurringForm(byId(s.recurring, b.dataset.rec)); });
  el.querySelectorAll('[data-ok]').forEach((b) => {
    b.onclick = () => {
      const i = Number(b.dataset.ok); const d = due[i];
      const v = el.querySelector(`.pending[data-i="${i}"] input`).value.replace(/\./g, '').replace(',', '.');
      update((st) => materialize(st, byId(st.recurring, d.rec.id), d.date, Number(v) || d.rec.amount));
      toast('Apuntado', 'ok');
    };
  });
  el.querySelectorAll('[data-skip]').forEach((b) => {
    b.onclick = () => { const d = due[Number(b.dataset.skip)]; update((st) => { const r = byId(st.recurring, d.rec.id); r.next = nextAfter(r, d.date); }); };
  });
}
import { nextDate as nd } from '../calc.js';
const nextAfter = (r, d) => nd(r, d);

// ======================= Avisos =======================
function avisos(s) {
  const al = alerts(s);
  return html`${al.length ? alertList(s, al) : html`<div class="empty"><p>✅ Todo en orden. No hay avisos.</p></div>`}
  ${Object.keys(s.dismissed).length ? html`<p class="center"><button class="btn ghost small" data-restore>Restaurar avisos descartados</button></p>` : ''}`;
}

export const routes = {
  inicio: { title: 'Dinerico', render: home, mount: (el, s) => { bindTxRows(el, s); bindAlerts(el); } },
  movimientos: { title: 'Movimientos', render: movimientos, mount: mountMov },
  recurrentes: { title: 'Recurrentes', back: '#/movimientos', render: recurrentes, mount: mountRec },
  avisos: { title: 'Avisos', back: '#/inicio', render: avisos, mount: (el) => { bindAlerts(el); el.querySelector('[data-restore]')?.addEventListener('click', () => update((st) => { st.dismissed = {}; })); } },
};
export { accountForm, sheet, field, readForm, esc, pct };
