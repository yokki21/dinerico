// Cuentas, detalle de cuenta, deudas y patrimonio.
import { html, raw, money, byId, sum, round2, num, fmtDate, pct, today, uid, monthShort, parseISO } from '../util.js';
import {
  base, balance, balanceBase, activeAccounts, netWorth, debtsSummary, debtOutstanding, debtMoves, amortization,
  portfolio, lastPeriods, periodOf, toBase,
} from '../calc.js';
import { line, donut, progress, PALETTE } from '../charts.js';
import { accountForm, debtForm, debtPaymentForm } from '../forms.js';
import { update } from '../store.js';
import { toast, sheet, field, readForm } from '../ui.js';
import { ACCOUNT_TYPES, DEBT_TYPES, ASSET_KINDS } from '../defaults.js';
import { txRow, bindTxRows } from './main.js';

// ======================= Cuentas =======================
let showArchived = false;
function cuentas(s) {
  const B = base(s);
  const list = s.accounts.filter((a) => showArchived || !a.archived);
  const total = sum(activeAccounts(s), (a) => balanceBase(s, a.id));
  const interest = sum(activeAccounts(s).filter((a) => a.interest > 0), (a) => Math.max(0, balanceBase(s, a.id)) * a.interest);
  return html`
  <section class="card hero slim"><small class="muted">Saldo total</small><div class="big">${money(total, B)}</div>
    ${interest ? html`<small class="pos">≈ ${money(interest, B)} al año en intereses (${money(interest / 12, B)}/mes, brutos)</small>` : ''}</section>
  <button class="btn primary block mb" data-new>+ Nueva cuenta</button>
  ${list.length ? html`<div class="list card flush">${list.map((a) => html`<a class="li ${a.archived ? 'dim' : ''}" href="#/cuenta/${a.id}"><span class="ic">${ACCOUNT_TYPES[a.type]?.icon}</span>
    <span class="tx"><b>${a.name}</b><small>${ACCOUNT_TYPES[a.type]?.label}${a.interest ? ` · ${pct(a.interest, 2)} TAE` : ''}${a.archived ? ' · archivada' : ''}</small></span>
    <span class="amt ${balance(s, a.id) < 0 ? 'neg' : ''}">${money(balance(s, a.id), a.currency)}${a.currency !== B ? html`<small>${money(balanceBase(s, a.id), B)}</small>` : ''}</span></a>`)}</div>`
    : html`<div class="empty"><p>Añade tus bancos, efectivo, brókers y tarjetas.</p></div>`}
  ${s.accounts.some((a) => a.archived) ? html`<p class="center"><button class="btn ghost small" data-arch>${showArchived ? 'Ocultar' : 'Mostrar'} archivadas</button></p>` : ''}
  <p class="small muted center">Para mover dinero entre tus bancos usa <b>Traspaso</b>: no cuenta como gasto ni ingreso y no se duplica.</p>`;
}
function mountCuentas(el, s) {
  el.querySelector('[data-new]').onclick = () => accountForm();
  el.querySelector('[data-arch]')?.addEventListener('click', () => { showArchived = !showArchived; update(() => {}); });
}

function cuenta(s, [id]) {
  const a = byId(s.accounts, id);
  if (!a) return html`<div class="empty"><p>Cuenta no encontrada.</p></div>`;
  const ps = lastPeriods(s, 12);
  const vals = ps.map((p) => balance(s, a.id, p.end > today() ? today() : p.end));
  const txs = s.transactions.filter((t) => t.accountId === id || t.toAccountId === id).sort((x, y) => y.date.localeCompare(x.date));
  const trades = s.trades.filter((t) => t.cashAccountId === id);
  return html`
  <section class="card hero slim"><small class="muted">${ACCOUNT_TYPES[a.type]?.icon} ${ACCOUNT_TYPES[a.type]?.label}</small>
    <div class="big">${money(balance(s, id), a.currency)}</div>
    ${a.interest ? html`<small class="pos">${pct(a.interest, 2)} TAE · ≈ ${money(Math.max(0, balance(s, id)) * a.interest / 12, a.currency)} al mes</small>` : ''}
    <div class="row gap mt"><button class="btn small" data-adjust>Cuadrar saldo</button><button class="btn small ghost" data-edit>Editar</button></div></section>
  <section class="card"><h3>Evolución</h3>${raw(line(ps.map((p) => monthShort(parseISO(p.end).getMonth())), [{ color: 'var(--accent)', values: vals }], { fmt: (v) => money(v, a.currency) }))}</section>
  ${trades.length ? html`<p class="small muted">Incluye ${trades.length} operaciones de inversión cargadas en esta cuenta.</p>` : ''}
  <section class="card flush"><div class="list">${txs.slice(0, 80).map((t) => txRow(s, t))}</div>
    ${!txs.length ? html`<p class="muted pad">Sin movimientos.</p>` : ''}</section>`;
}
function mountCuenta(el, s, [id]) {
  const a = byId(s.accounts, id); if (!a) return;
  bindTxRows(el, s);
  el.querySelector('[data-edit]').onclick = () => accountForm(a);
  el.querySelector('[data-adjust]').onclick = () => {
    const cur = balance(s, id);
    sheet('Cuadrar saldo', html`<form class="form"><p class="small muted">Escribe el saldo que ves en tu banco. Dinerico creará un ajuste por la diferencia (no cuenta como gasto ni ingreso).</p>
      ${field({ name: 'real', label: `Saldo real (${a.currency})`, type: 'money', value: cur, required: true })}
      <button class="btn primary block">Cuadrar</button></form>`, (f, close) => {
      f.querySelector('form').onsubmit = (e) => {
        e.preventDefault(); const v = readForm(e.target); const diff = round2((v.real || 0) - cur);
        if (!diff) { close(); return; }
        update((st) => { st.transactions.push({ id: uid(), type: 'adjust', date: today(), amount: diff, accountId: id, note: 'Cuadre de saldo' }); });
        close(); toast(`Ajuste de ${money(diff, a.currency, { sign: true })}`, 'ok');
      };
    });
  };
}

// ======================= Deudas =======================
function deudas(s) {
  const B = base(s);
  const ds = debtsSummary(s);
  const closed = s.debts.filter((d) => d.closed);
  const card = (x) => {
    const d = x.d; const T = DEBT_TYPES[d.type];
    const paid = d.principal > 0 && d.type !== 'personal' && d.type !== 'renting' ? 1 - x.out / d.principal : null;
    const left = d.type === 'renting' ? Math.max(0, (d.termMonths || 0) - Math.round((Date.now() - parseISO(d.startDate || today())) / 2629800000)) : null;
    return html`<section class="card"><div class="row between"><h3>${T?.icon} ${d.name}</h3><small class="tag">${d.type === 'personal' ? (d.direction === 'owed' ? 'Me deben' : 'Debo') : T?.label}</small></div>
      <div class="row between"><span class="muted small">${d.type === 'renting' ? 'Compromiso pendiente' : 'Pendiente'}</span><b class="${d.direction === 'owed' ? 'pos' : ''}">${money(x.out, B)}</b></div>
      ${paid != null ? html`${raw(progress(paid, 'ok'))}<small class="muted">Pagado el ${Math.round(paid * 100)} % · ${d.rate ? pct(d.rate, 2) + ' TIN · ' : ''}${d.payment ? money(d.payment, B) + '/mes' : ''}</small>` : ''}
      ${left != null ? html`<small class="muted">${money(d.payment, B)}/mes · quedan ${left} cuotas · no cuenta como deuda en el patrimonio</small>` : ''}
      ${d.counterparty ? html`<small class="muted block">${d.counterparty}</small>` : ''}
      <div class="row gap mt"><button class="btn small" data-pay="${d.id}">${d.type === 'personal' ? 'Movimiento' : 'Registrar pago'}</button>
        ${d.type !== 'personal' && d.type !== 'renting' && d.payment ? html`<button class="btn small ghost" data-amort="${d.id}">Amortización</button>` : ''}
        <button class="btn small ghost" data-edit="${d.id}">Editar</button></div></section>`;
  };
  return html`
  <div class="row3 card slim"><div><small>Debo</small><b>${money(ds.owe, B, { decimals: 0 })}</b></div><div><small>Me deben</small><b class="pos">${money(ds.owed, B, { decimals: 0 })}</b></div><div><small>Rentings</small><b>${money(ds.commitments, B, { decimals: 0 })}</b></div></div>
  <button class="btn primary block mb" data-new>+ Nueva deuda o compromiso</button>
  ${ds.list.length ? ds.list.map(card) : html`<div class="empty"><p>Préstamos, hipoteca, renting del coche o dinero que te deben amigos.</p></div>`}
  ${closed.length ? html`<details class="card"><summary>Saldadas (${closed.length})</summary>${closed.map((d) => html`<p class="row between"><span>${d.name}</span><button class="btn small ghost" data-edit="${d.id}">Ver</button></p>`)}</details>` : ''}`;
}
function mountDeudas(el, s) {
  el.querySelector('[data-new]').onclick = () => debtForm();
  el.querySelectorAll('[data-edit]').forEach((b) => { b.onclick = () => debtForm(byId(s.debts, b.dataset.edit)); });
  el.querySelectorAll('[data-pay]').forEach((b) => { b.onclick = () => debtPaymentForm(byId(s.debts, b.dataset.pay)); });
  el.querySelectorAll('[data-amort]').forEach((b) => { b.onclick = () => amortSheet(s, byId(s.debts, b.dataset.amort)); });
}
function amortSheet(s, d) {
  const B = base(s);
  const out = debtOutstanding(s, d);
  const draw = (extra) => {
    const a = amortization(out, d.rate, 600, d.payment + extra);
    return a;
  };
  const a0 = draw(0);
  sheet(`Amortización · ${d.name}`, html`
    <p class="small">Pendiente hoy <b>${money(out, B)}</b>. Con la cuota actual terminas en <b>${a0.months} meses</b> y pagas <b>${money(a0.totalInterest, B)}</b> de intereses.</p>
    <label class="field"><span>¿Y si pagas cada mes un extra de…?</span><input id="ex" data-money inputmode="decimal" placeholder="0"></label>
    <p class="small" id="exr"></p>
    <div class="table-wrap"><table class="tbl"><thead><tr><th>#</th><th>Cuota</th><th>Interés</th><th>Capital</th><th>Pendiente</th></tr></thead>
    <tbody>${a0.rows.slice(0, 360).map((r) => html`<tr><td>${r.i}</td><td>${money(r.pay, B)}</td><td>${money(r.int, B)}</td><td>${money(r.princ, B)}</td><td>${money(r.bal, B)}</td></tr>`)}</tbody></table></div>`,
  (el) => {
    el.querySelector('#ex').oninput = (e) => {
      const ex = num(e.target.value); if (!ex) { el.querySelector('#exr').textContent = ''; return; }
      const a = draw(ex);
      el.querySelector('#exr').innerHTML = `Terminarías en <b>${a.months} meses</b> (${a0.months - a.months} menos) y ahorrarías <b>${money(a0.totalInterest - a.totalInterest, B)}</b> en intereses.`;
    };
  }, { wide: true });
}

// ======================= Patrimonio =======================
function patrimonio(s) {
  const B = base(s);
  const pf = portfolio(s);
  const nw = netWorth(s, pf);
  const snaps = s.snapshots.slice(-24);
  const labels = snaps.map((x) => monthShort(parseISO(x.date).getMonth()) + ' ' + x.date.slice(2, 4));
  const byKind = {};
  pf.holdings.filter((h) => !h.asset.closed && h.value).forEach((h) => { byKind[h.asset.kind] = (byKind[h.asset.kind] || 0) + h.value; });
  const comp = [
    { label: 'Liquidez', value: Math.max(0, nw.cash), color: PALETTE[0] },
    ...Object.entries(byKind).map(([k, v], i) => ({ label: ASSET_KINDS[k]?.label || k, value: v, color: PALETTE[i + 1] })),
    ...(nw.owed ? [{ label: 'Me deben', value: nw.owed, color: PALETTE[7] }] : []),
  ];
  const ds = debtsSummary(s);
  const first = snaps[0];
  return html`
  <section class="card hero"><small class="muted">Patrimonio neto</small><div class="big">${money(nw.netWorth, B)}</div>
    ${first && snaps.length > 1 ? html`<small class="${nw.netWorth - first.netWorth >= 0 ? 'pos' : 'neg'}">${money(nw.netWorth - first.netWorth, B, { sign: true })} desde ${first.label?.toLowerCase() || fmtDate(first.date)}</small>` : ''}
    ${snaps.length > 1 ? raw(line(labels, [{ color: 'var(--accent)', values: snaps.map((x) => x.netWorth) }, { color: 'var(--good)', values: snaps.map((x) => x.investments), area: false, dash: true }], { fmt: (v) => money(v, B) })) : html`<p class="small muted mt">La evolución aparecerá a partir del próximo periodo: Dinerico guarda una foto cada mes.</p>`}
    ${snaps.length > 1 ? html`<div class="legend-inline"><span><i style="background:var(--accent)"></i>Neto</span><span><i style="background:var(--good)"></i>Invertido</span></div>` : ''}
  </section>
  <section class="card"><h3>Composición</h3><div class="donut-row">${raw(donut(comp, { center: money(nw.assets, B, { decimals: 0 }), sub: 'activos' }))}
    <ul class="legend">${comp.map((x) => html`<li><i style="background:${x.color}"></i>${x.label}<b>${money(x.value, B, { decimals: 0 })}</b></li>`)}</ul></div></section>
  <section class="card"><h3>Tienes</h3>
    ${activeAccounts(s).filter((a) => balance(s, a.id) > 0).map((a) => html`<div class="row between li-static"><span>${ACCOUNT_TYPES[a.type]?.icon} ${a.name}</span><b>${money(balanceBase(s, a.id), B)}</b></div>`)}
    ${pf.holdings.filter((h) => !h.asset.closed && h.value > 0).map((h) => html`<a class="row between li-static" href="#/activo/${h.asset.id}"><span>${ASSET_KINDS[h.asset.kind]?.icon} ${h.asset.name}</span><b>${money(h.value, B)}</b></a>`)}
    ${ds.list.filter((x) => x.d.direction === 'owed').map((x) => html`<div class="row between li-static"><span>🤝 ${x.d.name}</span><b>${money(x.out, B)}</b></div>`)}
    <div class="row between total"><span>Total</span><b>${money(nw.assets, B)}</b></div></section>
  <section class="card"><h3>Debes</h3>
    ${activeAccounts(s).filter((a) => balance(s, a.id) < 0).map((a) => html`<div class="row between li-static"><span>${ACCOUNT_TYPES[a.type]?.icon} ${a.name}</span><b>${money(-balanceBase(s, a.id), B)}</b></div>`)}
    ${ds.list.filter((x) => x.d.direction !== 'owed' && x.liability).map((x) => html`<div class="row between li-static"><span>${DEBT_TYPES[x.d.type]?.icon} ${x.d.name}</span><b>${money(x.out, B)}</b></div>`)}
    <div class="row between total"><span>Total</span><b>${money(nw.liabilities, B)}</b></div>
    ${ds.commitments ? html`<p class="small muted">Además tienes ${money(ds.commitments, B)} comprometidos en rentings (no son deuda, pero son pagos futuros).</p>` : ''}</section>
  ${snaps.length ? html`<details class="card"><summary>Histórico mensual</summary><div class="table-wrap"><table class="tbl"><thead><tr><th>Mes</th><th>Activos</th><th>Deudas</th><th>Neto</th></tr></thead>
    <tbody>${[...snaps].reverse().map((x) => html`<tr><td>${x.label}</td><td>${money(x.assets, B, { decimals: 0 })}</td><td>${money(x.liabilities, B, { decimals: 0 })}</td><td><b>${money(x.netWorth, B, { decimals: 0 })}</b></td></tr>`)}</tbody></table></div></details>` : ''}`;
}

export const routes = {
  cuentas: { title: 'Cuentas', back: '#/mas', render: cuentas, mount: mountCuentas },
  cuenta: { title: (s, [id]) => byId(s.accounts, id)?.name || 'Cuenta', back: '#/cuentas', render: cuenta, mount: mountCuenta },
  deudas: { title: 'Deudas y compromisos', back: '#/mas', render: deudas, mount: mountDeudas },
  patrimonio: { title: 'Patrimonio', back: '#/mas', render: patrimonio },
};
export { toBase, periodOf, debtMoves };
