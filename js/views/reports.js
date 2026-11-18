// Informe mensual y simuladores.
import { html, raw, money, byId, sum, pct, num, fmtDate, monthShort, parseISO, round2 } from '../util.js';
import {
  base, periodOf, shiftPeriod, monthlyReport, lastPeriods, periodSummary, budgetStatus, emergencyTarget, averages,
  goalInfo, amortization, netWorth, txBase, catName, savingsTarget,
} from '../calc.js';
import { bars, line, donut, progress, PALETTE } from '../charts.js';
import { update } from '../store.js';
import { txRow, bindTxRows } from './main.js';

// ======================= Informe =======================
function informe(s, [key]) {
  const B = base(s);
  let p = key ? periodOf(s, key) : shiftPeriod(s, periodOf(s), -1);
  if (!key && !s.transactions.some((t) => t.date >= p.start && t.date <= p.end)) p = periodOf(s);
  const r = monthlyReport(s, p);
  const ps = lastPeriods(s, 6, p);
  const sums = ps.map((x) => periodSummary(s, x));
  const labels = ps.map((x) => monthShort(parseISO(x.end).getMonth()));
  const nav = html`<div class="pnav"><a class="icon-btn" href="#/informe/${shiftPeriod(s, p, -1).key}">‹</a><div><b>Informe de ${p.label.toLowerCase()}</b><small>${p.range}</small></div><a class="icon-btn" href="#/informe/${shiftPeriod(s, p, 1).key}">›</a></div>`;
  if (r.empty) return html`${nav}<div class="empty"><p>No hay movimientos en este periodo.</p></div>`;
  const sm = r.sm;
  const cats = Object.entries(sm.byCat).sort((a, b) => b[1] - a[1]);
  const items = cats.map(([id, v], i) => ({ label: byId(s.categories, id)?.name || 'Sin categoría', value: v, color: PALETTE[i % PALETTE.length], id }));
  const score = Math.round(Math.max(0, Math.min(100,
    50 * Math.min(1, Math.max(0, sm.savings) / (savingsTarget(s, sm.income) || sm.income * 0.2 || 1)) +
    30 * (r.budgets.length ? r.budgets.filter((b) => b.level !== 'over').length / r.budgets.length : 1) +
    20 * (sm.expense <= (r.av.expense || sm.expense) ? 1 : Math.max(0, 1 - (sm.expense / r.av.expense - 1) * 2)))));
  return html`${nav}
  <section class="card hero"><div class="row between"><div><small class="muted">Puntuación del mes</small><div class="big">${score}<small>/100</small></div></div>
    <div class="score ${score >= 75 ? 'ok' : score >= 50 ? 'warn' : 'bad'}">${score >= 75 ? '😎' : score >= 50 ? '🙂' : '😬'}</div></div>
    <div class="row3"><div><small>Ingresos</small><b class="pos">${money(sm.income, B, { decimals: 0 })}</b></div><div><small>Gastos</small><b>${money(sm.expense, B, { decimals: 0 })}</b></div>
      <div><small>Ahorro</small><b class="${sm.savings >= 0 ? 'pos' : 'neg'}">${money(sm.savings, B, { decimals: 0 })} · ${pct(Math.max(0, sm.rate), 0)}</b></div></div></section>
  <section class="card"><h3>Lo que ha pasado</h3><ul class="findings">${r.findings.map((f) => html`<li class="${f.good ? 'good' : 'bad'}">${f.good ? '✅' : '⚠️'} ${f.text}</li>`)}</ul></section>
  ${r.tips.length ? html`<section class="card"><h3>Cómo mejorar</h3><ul class="findings">${r.tips.map((t) => html`<li>💡 ${t}</li>`)}</ul></section>` : ''}
  <section class="card"><h3>Últimos 6 periodos</h3>${raw(bars(labels, [{ name: 'Ingresos', color: 'var(--good)', values: sums.map((x) => x.income) }, { name: 'Gastos', color: 'var(--accent)', values: sums.map((x) => x.expense) }], { fmt: (v) => money(v, B) }))}
    <div class="legend-inline"><span><i style="background:var(--good)"></i>Ingresos</span><span><i style="background:var(--accent)"></i>Gastos</span></div></section>
  <section class="card"><h3>En qué se fue</h3><div class="donut-row">${raw(donut(items.slice(0, 8), { center: money(sm.expense, B, { decimals: 0 }) }))}
    <ul class="legend">${items.map((x) => {
      const m = r.av.byCat[x.id]; const d = m ? x.value / m - 1 : null;
      return html`<li><i style="background:${x.color}"></i>${x.label}<b>${money(x.value, B, { decimals: 0 })}${d != null && Math.abs(d) > 0.1 ? html` <small class="${d > 0 ? 'neg' : 'pos'}">${d > 0 ? '▲' : '▼'}${Math.round(Math.abs(d) * 100)}%</small>` : ''}</b></li>`;
    })}</ul></div><small class="muted">▲▼ frente a tu media de los periodos anteriores.</small></section>
  ${r.budgets.length ? html`<section class="card"><h3>Presupuestos</h3>${r.budgets.map((b) => html`<div class="bud"><div class="row between"><span>${b.cat.icon} ${b.cat.name}</span><small>${money(b.spent, B, { decimals: 0 })} / ${money(b.limit, B, { decimals: 0 })}</small></div>${raw(progress(b.ratio, b.level))}</div>`)}</section>` : ''}
  ${r.top.length ? html`<section class="card flush"><h3 class="pad">Mayores gastos</h3><div class="list">${r.top.map((t) => txRow(s, t))}</div></section>` : ''}`;
}

// ======================= Simuladores =======================
const SIMS = {
  compuesto: { icon: '📈', title: 'Interés compuesto', desc: 'Cuánto tendrás invirtiendo cada mes.' },
  objetivo: { icon: '🎯', title: '¿Cuánto ahorrar para…?', desc: 'Aportación mensual para llegar a una cifra.' },
  emergencia: { icon: '🛟', title: 'Fondo de emergencia', desc: 'Cuánto colchón necesitas según tus gastos.' },
  fire: { icon: '🔥', title: 'Independencia financiera', desc: 'Cuándo podrías vivir de tus inversiones.' },
  prestamo: { icon: '🏦', title: 'Préstamo y amortización', desc: 'Cuota, intereses y efecto de amortizar.' },
  habito: { icon: '☕', title: 'Coste de un hábito', desc: 'Lo que cuesta un gasto diario si lo invirtieras.' },
};
function simuladores(s, [id]) {
  if (!id) return html`<div class="grid-cards">${Object.entries(SIMS).map(([k, v]) => html`<a class="card tile" href="#/simuladores/${k}"><span class="tile-ic">${v.icon}</span><b>${v.title}</b><small>${v.desc}</small></a>`)}</div>`;
  const B = base(s); const av = averages(s, 3); const nw = netWorth(s);
  const F = (name, label, value, hint = '') => html`<label class="field"><span>${label}</span><input name="${name}" data-money inputmode="decimal" value="${String(value).replace('.', ',')}">${hint ? html`<small>${hint}</small>` : ''}</label>`;
  const forms = {
    compuesto: html`${F('ini', 'Capital inicial', round2(nw.investments) || 1000)}${F('mon', 'Aportación mensual', 200)}${F('r', 'Rentabilidad anual esperada %', 6, 'Histórico aproximado de un índice mundial: 6-8 % nominal, con años muy negativos.')}${F('y', 'Años', 20)}${F('inf', 'Inflación anual %', 2.5)}`,
    objetivo: html`${F('goal', 'Cifra objetivo', 20000)}${F('have', 'Ya tienes', 0)}${F('y', 'Años', 3)}${F('r', 'Rentabilidad anual %', 2, 'Para plazos cortos lo prudente es una cuenta remunerada o un monetario (≈2 %).')}`,
    emergencia: html`${F('ess', 'Gasto esencial mensual', round2(av.essential) || 900, av.essential ? 'Calculado con tus últimos meses.' : '')}${F('m', 'Meses de cobertura', s.settings.plan.emergencyMonths)}${F('have', 'Ya tienes', 0)}${F('mon', 'Puedes apartar al mes', 300)}`,
    fire: html`${F('exp', 'Gasto anual en la independencia', round2((av.expense || 1500) * 12))}${F('have', 'Patrimonio invertido hoy', round2(nw.investments))}${F('mon', 'Aportación mensual', 500)}${F('r', 'Rentabilidad real anual % (descontada inflación)', 4)}${F('wr', 'Tasa de retirada %', 4, 'La «regla del 4 %»: patrimonio necesario = gasto anual × 25.')}`,
    prestamo: html`${F('p', 'Capital', 15000)}${F('r', 'Interés anual (TIN) %', 6)}${F('m', 'Plazo (meses)', 60)}${F('ex', 'Extra mensual para amortizar', 0)}`,
    habito: html`${F('d', 'Gasto por día', 3)}${F('days', 'Días a la semana', 5)}${F('y', 'Años', 10)}${F('r', 'Rentabilidad si lo invirtieras %', 6)}`,
  };
  return html`<section class="card"><h3>${SIMS[id].icon} ${SIMS[id].title}</h3><form id="sim" class="form">${forms[id]}</form></section>
    <section class="card" id="simout"></section>`;
}
function mountSim(el, s, [id]) {
  if (!id) return;
  const B = base(s); const f = el.querySelector('#sim'); const out = el.querySelector('#simout');
  const v = (n) => num(f[n]?.value);
  const M = (x) => money(x, B, { decimals: 0 });
  const calc = {
    compuesto() {
      const r = v('r') / 100 / 12, n = Math.round(v('y') * 12); let bal = v('ini'); const pts = [bal]; const contrib = [bal];
      for (let i = 1; i <= n; i++) { bal = bal * (1 + r) + v('mon'); if (i % 12 === 0) { pts.push(bal); contrib.push(v('ini') + v('mon') * i); } }
      const put = v('ini') + v('mon') * n; const real = bal / Math.pow(1 + v('inf') / 100, v('y'));
      return html`<div class="big">${M(bal)}</div><p class="small">Aportas ${M(put)} y la rentabilidad añade <b>${M(bal - put)}</b>. En poder adquisitivo de hoy serían unos ${M(real)}.</p>
        ${raw(line(pts.map((_, i) => String(i)), [{ color: 'var(--accent)', values: pts }, { color: 'var(--muted)', values: contrib, area: false, dash: true }], { fmt: M }))}
        <div class="legend-inline"><span><i style="background:var(--accent)"></i>Valor</span><span><i style="background:var(--muted)"></i>Aportado</span></div>`;
    },
    objetivo() {
      const r = v('r') / 100 / 12, n = Math.max(1, Math.round(v('y') * 12));
      const fvHave = v('have') * Math.pow(1 + r, n); const need = Math.max(0, v('goal') - fvHave);
      const pmt = r ? need * r / (Math.pow(1 + r, n) - 1) : need / n;
      return html`<div class="big">${M(pmt)}<small>/mes</small></div><p class="small">Durante ${n} meses. Aportarías ${M(pmt * n)} y los intereses pondrían ${M(Math.max(0, v('goal') - v('have') - pmt * n))}.</p>
        <button class="btn small" data-mkgoal>Crear este objetivo</button>`;
    },
    emergencia() {
      const t = v('ess') * v('m'); const left = Math.max(0, t - v('have')); const months = v('mon') > 0 ? Math.ceil(left / v('mon')) : null;
      return html`<div class="big">${M(t)}</div><p class="small">${left ? html`Te faltan ${M(left)}${months ? html`: lo completas en <b>${months} meses</b> apartando ${M(v('mon'))}/mes` : ''}.` : '✅ Ya lo tienes cubierto.'}</p>
        <p class="small muted">Con ingresos estables suelen bastar 3-6 meses; con contrato temporal o ingresos variables conviene ir a 6-12. Guárdalo en una cuenta remunerada disponible al momento, no en inversión.</p>
        <p class="small muted">Tu objetivo actual en Dinerico: ${M(emergencyTarget(s))}.</p>`;
    },
    fire() {
      const target = v('exp') / (v('wr') / 100 || 0.04); const r = v('r') / 100 / 12;
      let bal = v('have'), m = 0; while (bal < target && m < 1200) { bal = bal * (1 + r) + v('mon'); m++; }
      return html`<div class="big">${M(target)}</div><p class="small">Es el patrimonio necesario. ${m < 1200 ? html`Al ritmo actual lo alcanzarías en <b>${Math.floor(m / 12)} años y ${m % 12} meses</b>.` : 'Con estos datos no llegas en 100 años: sube la aportación o baja el gasto.'}</p>
        <p class="small muted">Cada 100 €/mes menos de gasto reduce el objetivo en ${M(1200 / (v('wr') / 100 || 0.04))}.</p>`;
    },
    prestamo() {
      const a = amortization(v('p'), v('r') / 100, Math.max(1, v('m'))); const b = v('ex') ? amortization(v('p'), v('r') / 100, Math.max(1, v('m')), a.payment + v('ex')) : null;
      return html`<div class="big">${money(a.payment, B)}<small>/mes</small></div><p class="small">Pagarías ${M(a.totalInterest)} de intereses en total (${M(v('p') + a.totalInterest)} en total).</p>
        ${b ? html`<p class="small">Con ${M(v('ex'))} extra al mes terminas en <b>${b.months} meses</b> (${a.months - b.months} menos) y ahorras <b>${M(a.totalInterest - b.totalInterest)}</b>.</p>` : ''}
        <p class="small muted">Antes de amortizar, compara el TIN con lo que te daría invertir ese dinero y revisa la comisión de amortización anticipada.</p>`;
    },
    habito() {
      const monthly = v('d') * v('days') * 52 / 12; const r = v('r') / 100 / 12; const n = Math.round(v('y') * 12);
      let bal = 0; for (let i = 0; i < n; i++) bal = bal * (1 + r) + monthly;
      return html`<div class="big">${M(monthly * 12)}<small>/año</small></div><p class="small">En ${v('y')} años gastas ${M(monthly * n)}. Invertido, serían unos <b>${M(bal)}</b>.</p>`;
    },
  };
  const run = () => { out.innerHTML = String(calc[id]()); out.querySelector('[data-mkgoal]')?.addEventListener('click', () => {
    const d = new Date(); d.setMonth(d.getMonth() + Math.round(v('y') * 12));
    update((st) => { st.goals.push({ id: Date.now().toString(36), kind: 'normal', icon: '🎯', name: 'Nuevo objetivo', target: v('goal'), initial: v('have'), targetDate: d.toISOString().slice(0, 10), priority: 3, contributions: [], createdAt: new Date().toISOString() }); });
    location.hash = '#/objetivos';
  }); };
  f.addEventListener('input', run); run();
}

export const routes = {
  informe: { title: 'Informe mensual', back: '#/inicio', render: informe, mount: (el, s) => bindTxRows(el, s) },
  simuladores: { title: (s, [id]) => (id ? SIMS[id]?.title : 'Simuladores'), back: '#/mas', render: simuladores, mount: mountSim },
};
export { fmtDate, txBase, catName, goalInfo, budgetStatus, sum };
