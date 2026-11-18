// Inversiones, detalle de activo y fiscalidad.
import { html, raw, money, byId, sum, pct, fmtDate, fmtNum, today, esc } from '../util.js';
import { base, portfolio, staleAssets, taxYear, toBase } from '../calc.js';
import { donut, PALETTE } from '../charts.js';
import { assetForm, tradeForm, priceForm } from '../forms.js';
import { update, getState } from '../store.js';
import { toast } from '../ui.js';
import { ASSET_KINDS } from '../defaults.js';
import { refreshPrices, fetchFx } from '../prices.js';

const srcLabel = { manual: 'manual', coingecko: 'auto · CoinGecko', alphavantage: 'auto · Alpha Vantage' };

function inversiones(s) {
  const B = base(s);
  const pf = portfolio(s);
  const open = pf.holdings.filter((h) => !h.asset.closed && h.asset.kind !== 'other');
  const other = pf.holdings.filter((h) => !h.asset.closed && h.asset.kind === 'other');
  const value = sum(open, (h) => h.value), cost = sum(open, (h) => h.cost);
  const realizedYear = sum(pf.realized.filter((r) => r.date.startsWith(today().slice(0, 4))), (r) => r.gain);
  const divYear = sum(pf.dividends.filter((d) => d.date.startsWith(today().slice(0, 4))), (d) => d.gross);
  const stale = new Set(staleAssets(s).map((a) => a.id));
  const items = open.filter((h) => h.value > 0).map((h, i) => ({ label: h.asset.name, value: h.value, color: PALETTE[i % PALETTE.length] }));
  const hasAuto = s.assets.some((a) => a.source && a.source !== 'manual');
  const row = (h) => html`<a class="li" href="#/activo/${h.asset.id}"><span class="ic">${ASSET_KINDS[h.asset.kind]?.icon}</span>
    <span class="tx"><b>${h.asset.name}</b><small>${ASSET_KINDS[h.asset.kind]?.unit ? `${fmtNum(h.qty)} part. · ` : ''}${srcLabel[h.asset.source] || 'manual'}${stale.has(h.asset.id) ? ' · ⏰ precio antiguo' : ''}</small></span>
    <span class="amt">${money(h.value, B)}<small class="${h.gain >= 0 ? 'pos' : 'neg'}">${money(h.gain, B, { sign: true })} (${pct(h.gainPct)})</small></span></a>`;
  return html`
  <section class="card hero"><small class="muted">Valor de la cartera</small><div class="big">${money(value, B)}</div>
    <small class="${value - cost >= 0 ? 'pos' : 'neg'}">${money(value - cost, B, { sign: true })} (${pct(cost ? (value - cost) / cost : 0)}) sobre ${money(cost, B)} invertidos</small>
    <div class="row3 mt"><div><small>Realizado ${today().slice(0, 4)}</small><b class="${realizedYear >= 0 ? 'pos' : 'neg'}">${money(realizedYear, B, { decimals: 0 })}</b></div>
      <div><small>Dividendos ${today().slice(0, 4)}</small><b>${money(divYear, B, { decimals: 0 })}</b></div>
      <a href="#/fiscalidad"><small>Fiscalidad</small><b>Ver ›</b></a></div></section>
  <div class="row gap mb"><button class="btn primary flex" data-new>+ Añadir activo</button>${hasAuto || s.fx.date ? html`<button class="btn" data-refresh>↻ Precios</button>` : ''}</div>
  ${items.length > 1 ? html`<section class="card"><h3>Distribución</h3><div class="donut-row">${raw(donut(items, { center: money(value, B, { decimals: 0 }) }))}
    <ul class="legend">${items.map((x) => html`<li><i style="background:${x.color}"></i>${x.label}<b>${pct(x.value / value, 0)}</b></li>`)}</ul></div></section>` : ''}
  ${open.length ? html`<div class="list card flush">${open.map(row)}</div>` : html`<div class="empty"><p>Añade tus fondos, ETF, acciones, cripto, depósitos o planes de pensiones. Puedes partir de lo que tienes hoy y apuntar las compras nuevas.</p></div>`}
  ${other.length ? html`<h3 class="sec">Otros bienes</h3><div class="list card flush">${other.map(row)}</div>` : ''}
  ${pf.holdings.some((h) => h.asset.closed) ? html`<details class="card"><summary>Cerradas</summary><div class="list">${pf.holdings.filter((h) => h.asset.closed).map(row)}</div></details>` : ''}
  <p class="small muted">Precios automáticos: cripto con CoinGecko (sin clave) y acciones/ETF con Alpha Vantage (clave gratuita en Ajustes, 25 consultas al día). Los fondos por ISIN se actualizan a mano.</p>`;
}
async function doRefresh(btn) {
  const s = getState();
  btn.disabled = true; btn.textContent = '…';
  try {
    const copy = JSON.parse(JSON.stringify(s.assets));
    const res = await refreshPrices({ ...s, assets: copy });
    let fx = null; try { fx = await fetchFx(base(s)); } catch { /* */ }
    update((st) => {
      for (const a of copy) { const t = byId(st.assets, a.id); if (t) { t.price = a.price; t.priceDate = a.priceDate; } }
      if (fx) st.fx = { ...st.fx, ...fx };
      st.settings.lastPriceRefresh = Date.now();
    });
    toast(res.fail.length ? `Actualizados ${res.ok}. Fallaron: ${res.fail.map((f) => `${f.name} (${f.error})`).join(', ')}` : `Precios actualizados (${res.ok})${fx ? ' y tipos de cambio' : ''}`, res.fail.length ? 'warn' : 'ok');
  } catch (e) { toast('Sin conexión: ' + e.message, 'warn'); btn.disabled = false; btn.textContent = '↻ Precios'; }
}

function activo(s, [id]) {
  const B = base(s);
  const pf = portfolio(s);
  const h = pf.holdings.find((x) => x.asset.id === id);
  if (!h) return html`<div class="empty"><p>Activo no encontrado.</p></div>`;
  const a = h.asset; const K = ASSET_KINDS[a.kind] || {};
  const trades = s.trades.filter((t) => t.assetId === id || t.toAssetId === id).sort((x, y) => y.date.localeCompare(x.date));
  const realized = pf.realized.filter((r) => r.assetId === id);
  const tl = { buy: K.unit ? 'Compra' : 'Aportación', sell: K.unit ? 'Venta' : 'Retirada', dividend: K.unit ? 'Dividendo' : 'Intereses', fee: 'Comisión', traspaso: 'Traspaso', value: 'Valoración' };
  const tdesc = (t) => {
    if (t.type === 'traspaso') return t.assetId === id ? `→ ${byId(s.assets, t.toAssetId)?.name || '?'} · ${fmtNum(t.qty)} part.` : `← ${byId(s.assets, t.assetId)?.name || '?'} · ${fmtNum(t.toQty)} part.`;
    if (t.type === 'value') return money(t.price, a.currency);
    if (t.type === 'dividend') return `${money(t.gross, a.currency)} brutos`;
    if (t.type === 'fee') return money(t.fee, a.currency);
    return K.unit ? `${fmtNum(t.qty)} × ${money(t.price, a.currency, { decimals: 4 })}` : money(t.qty, a.currency);
  };
  return html`
  <section class="card hero"><small class="muted">${K.icon} ${K.label}${a.isin ? ' · ' + a.isin : ''}</small><div class="big">${money(h.value, B)}</div>
    <small class="${h.gain >= 0 ? 'pos' : 'neg'}">${money(h.gain, B, { sign: true })} (${pct(h.gainPct)})</small>
    <div class="row3 mt">${K.unit ? html`<div><small>Participaciones</small><b>${fmtNum(h.qty)}</b></div><div><small>Precio medio</small><b>${money(h.avgPrice, B, { decimals: 4 })}</b></div>
      <div><small>Precio${a.priceDate ? ' · ' + fmtDate(a.priceDate) : ''}</small><b>${money(a.price || 0, a.currency, { decimals: 4 })}</b></div>`
      : html`<div><small>Aportado</small><b>${money(h.cost, B)}</b></div><div><small>Valor</small><b>${money(h.value, B)}</b></div><div><small>${a.kind === 'deposit' ? 'TAE' : 'Actualizado'}</small><b>${a.kind === 'deposit' ? pct(a.rate || 0, 2) : fmtDate(h.valueDate) || '—'}</b></div>`}</div>
    <div class="row gap mt wrap"><button class="btn small primary" data-tr="buy">${tl.buy}</button><button class="btn small" data-tr="sell">${tl.sell}</button>
      ${K.unit ? html`<button class="btn small ghost" data-price>Precio</button>` : a.kind !== 'deposit' ? html`<button class="btn small ghost" data-tr="value">Valoración</button>` : ''}
      <button class="btn small ghost" data-tr="dividend">${tl.dividend}</button><button class="btn small ghost" data-edit>Editar</button></div></section>
  ${realized.length || h.dividends ? html`<div class="row3 card slim"><div><small>Plusvalía realizada</small><b class="${h.realized >= 0 ? 'pos' : 'neg'}">${money(h.realized, B)}</b></div><div><small>${tl.dividend}</small><b>${money(h.dividends, B)}</b></div><div><small>Comisiones</small><b>${money(h.fees, B)}</b></div></div>` : ''}
  ${K.unit && h.lots.length ? html`<details class="card"><summary>Lotes FIFO (${h.lots.length})</summary><div class="table-wrap"><table class="tbl"><thead><tr><th>Fecha</th><th>Part.</th><th>Coste</th><th>Valor</th></tr></thead>
    <tbody>${h.lots.map((l) => html`<tr><td>${fmtDate(l.date)}</td><td>${fmtNum(l.qty)}</td><td>${money(l.cost, B)}</td><td>${money(toBase(s, l.qty * (a.price || 0), a.currency), B)}</td></tr>`)}</tbody></table></div>
    <small class="muted">Al vender se consumen primero los lotes más antiguos, como exige Hacienda.</small></details>` : ''}
  <section class="card flush"><div class="list">${trades.map((t) => html`<button class="li" data-edtr="${t.id}"><span class="ic">${{ buy: '🟢', sell: '🔴', dividend: '💶', fee: '🧾', traspaso: '⇄', value: '📍' }[t.type]}</span>
    <span class="tx"><b>${tl[t.type]}${t.estimated ? ' · part. estimadas' : ''}</b><small>${fmtDate(t.date)} · ${tdesc(t)}</small></span><span class="amt">${t.cashAmount ? money(t.cashAmount, byId(s.accounts, t.cashAccountId)?.currency || B) : ''}</span></button>`)}</div>
    ${!trades.length ? html`<p class="muted pad">Sin operaciones.</p>` : ''}</section>
  ${trades.some((t) => t.estimated) ? html`<p class="small muted">Las aportaciones periódicas calculan las participaciones con el último precio. Ábrelas y pon las reales cuando el bróker ejecute la orden.</p>` : ''}`;
}
function mountActivo(el, s, [id]) {
  const a = byId(s.assets, id); if (!a) return;
  el.querySelectorAll('[data-tr]').forEach((b) => { b.onclick = () => tradeForm(a, null, b.dataset.tr); });
  el.querySelector('[data-price]')?.addEventListener('click', () => priceForm(a));
  el.querySelector('[data-edit]').onclick = () => assetForm(a);
  el.querySelectorAll('[data-edtr]').forEach((b) => {
    b.onclick = () => { const t = byId(s.trades, b.dataset.edtr); tradeForm(byId(s.assets, t.assetId), t); };
  });
}

// ======================= Fiscalidad =======================
let taxY = null;
function fiscalidad(s) {
  const B = base(s);
  const years = [...new Set([...s.trades.map((t) => t.date.slice(0, 4)), ...s.transactions.map((t) => t.date.slice(0, 4)), today().slice(0, 4)])].sort().reverse();
  const y = taxY || years[0];
  const pf = portfolio(s);
  const t = taxYear(s, y, pf);
  return html`
  <div class="chips mb">${years.map((x) => html`<button class="chip ${x === y ? 'on' : ''}" data-y="${x}">${x}</button>`)}</div>
  <section class="card hero"><small class="muted">Cuota estimada de la base del ahorro ${y}</small><div class="big">${money(t.tax, B)}</div>
    <small class="muted">Base ${money(t.taxBase, B)} · retenciones ${money(t.withholding, B)} · ${t.toPay >= 0 ? 'a pagar' : 'a devolver'} ≈ <b>${money(Math.abs(t.toPay), B)}</b></small></section>
  <section class="card"><h3>Ganancias y pérdidas patrimoniales</h3>
    <div class="row between"><span>Computables</span><b class="${t.gp >= 0 ? 'pos' : 'neg'}">${money(t.gp, B)}</b></div>
    ${t.deferred ? html`<div class="row between"><span>⚠️ Posiblemente diferidas</span><b class="neg">${money(t.deferred, B)}</b></div><small class="muted">Pérdidas con compras del mismo valor dentro de la ventana anti-recompra. No se restan este año; se integran cuando vendas lo recomprado.</small>` : ''}
    ${t.gains.length ? html`<div class="table-wrap mt"><table class="tbl"><thead><tr><th>Fecha</th><th>Activo</th><th>Transmisión</th><th>Adquisición</th><th>Resultado</th></tr></thead>
      <tbody>${t.gains.map((g) => html`<tr class="${g.wash ? 'warnrow' : ''}"><td>${fmtDate(g.date)}</td><td>${byId(s.assets, g.assetId)?.name}${g.wash ? ' ⚠️' : ''}</td><td>${money(g.proceeds, B)}</td><td>${money(g.cost, B)}</td><td class="${g.gain >= 0 ? 'pos' : 'neg'}">${money(g.gain, B)}</td></tr>`)}</tbody></table></div>` : html`<p class="muted small">Sin ventas en ${y}.</p>`}
  </section>
  <section class="card"><h3>Rendimientos del capital mobiliario</h3>
    <div class="row between"><span>Dividendos (bruto)</span><b>${money(sum(t.divs, (d) => d.gross), B)}</b></div>
    <div class="row between"><span>Intereses (bruto)</span><b>${money(sum(t.intTx, (x) => toBase(s, x.amount, byId(s.accounts, x.accountId)?.currency) + (Number(x.withholding) || 0)), B)}</b></div>
    <small class="muted">Se toman de las operaciones de dividendo y de los ingresos con categoría «Intereses» o «Dividendos». Añade la retención al apuntarlos para que el bruto sea exacto.</small></section>
  <section class="card"><h3>Cómo se calcula</h3><ul class="small">
    <li>Compensación entre los dos bloques hasta el 25 % del saldo positivo del otro.</li>
    <li>Tramos: ${s.settings.tax.brackets.map((b) => `${b.upTo ? 'hasta ' + money(b.upTo, B, { decimals: 0 }) : 'resto'} ${Math.round(b.rate * 100)} %`).join(' · ')}.</li>
    ${t.lossCarry < 0 ? html`<li>Te quedan ${money(-t.lossCarry, B)} de pérdidas para compensar en los 4 años siguientes.</li>` : ''}
    <li>Los traspasos entre fondos no tributan; el coste y la fecha pasan al fondo de destino.</li>
    <li>No incluye planes de pensiones (tributan como rendimiento del trabajo al rescatar), depósitos (sus intereses van como ingreso) ni deducciones personales.</li></ul>
    <p class="small muted">Es una estimación para planificar, no sustituye al borrador de la Agencia Tributaria ni a un asesor.</p></section>`;
}

export const routes = {
  inversiones: { title: 'Inversiones', back: '#/mas', render: inversiones, mount: (el) => { el.querySelector('[data-new]').onclick = () => assetForm(); el.querySelector('[data-refresh]')?.addEventListener('click', (e) => doRefresh(e.currentTarget)); } },
  activo: { title: (s, [id]) => byId(s.assets, id)?.name || 'Activo', back: '#/inversiones', render: activo, mount: mountActivo },
  fiscalidad: { title: 'Fiscalidad', back: '#/inversiones', render: fiscalidad, mount: (el) => { el.querySelectorAll('[data-y]').forEach((b) => { b.onclick = () => { taxY = b.dataset.y; update(() => {}); }; }); } },
};
export { esc };
