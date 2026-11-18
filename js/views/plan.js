// Plan del mes: reparto sugerido, presupuestos y objetivos.
import { curSymbol, html, raw, money, byId, sum, round2, num, fmtDate, esc } from '../util.js';
import {
  periodOf, shiftPeriod, periodSummary, budgetStatus, suggestAllocation, averages, base, goalInfo, emergencyTarget, budgetTotal, savingsTarget,
} from '../calc.js';
import { progress } from '../charts.js';
import { goalForm, contributionForm } from '../forms.js';
import { update } from '../store.js';
import { toast, sheet, field, readForm } from '../ui.js';
import { periodNav } from './main.js';

let planPeriod = null;

function plan(s) {
  const B = base(s);
  const p = planPeriod ? periodOf(s, planPeriod) : periodOf(s);
  const sm = periodSummary(s, p);
  const sug = suggestAllocation(s, p);
  const saved = s.plans[p.key];
  const items = saved?.accepted ? saved.items : sug.items;
  const roots = s.categories.filter((c) => c.kind === 'expense' && !c.parent);
  const av = averages(s, 3, p);
  const bs = Object.fromEntries(budgetStatus(s, p).map((b) => [b.catId, b]));
  const bt = budgetTotal(s);
  const st = s.settings.plan;
  const income = sug.income;
  return html`
  <div class="subnav"><a class="on" href="#/plan">Este mes</a><a href="#/objetivos">Objetivos</a></div>
  ${periodNav(p)}
  <section class="card">
    <div class="row between"><h3>🧮 Ahorro del mes</h3><button class="btn small ghost" data-rules>Reglas</button></div>
    <form id="goalf" class="save-goal">
      <span class="lbl">¿Cuánto quieres ahorrar?</span>
      <div class="unit"><input name="sv" data-money inputmode="decimal" value="${String(st.savingsMode === 'amount' ? st.savingsAmount || 0 : Math.round((st.savingsRate || 0) * 1000) / 10).replace('.', ',')}">
        <select name="sm"><option value="percent" ${raw(st.savingsMode !== 'amount' ? 'selected' : '')}>% del ingreso</option><option value="amount" ${raw(st.savingsMode === 'amount' ? 'selected' : '')}>${curSymbol(B)}/mes</option></select></div>
    </form>
    <div class="row3 mt"><div><small>Ingreso ${sug.incomeSource}</small><b>${money(income, B, { decimals: 0 })}</b></div>
      <div><small>A ahorrar</small><b class="pos">${money(sug.target, B, { decimals: 0 })}</b></div>
      <div><small>Para gastar</small><b>${money(sug.spendable, B, { decimals: 0 })}</b></div></div>
    ${sug.budgetsOver ? html`<div class="callout warn mt"><span>⚠️</span><div><small>Tus presupuestos suman ${money(sug.budgets, B, { decimals: 0 })} y para gastar te quedan ${money(sug.spendable, B, { decimals: 0 })}. Baja algún presupuesto o ahorra menos.</small></div></div>` : ''}
    ${sug.missing.length ? html`<div class="callout warn mt"><span>🎯</span><div><small>No llega para todo: ${sug.missing.map((m) => `${m.name} (faltan ${money(m.short, B, { decimals: 0 })}/mes)`).join(', ')}. Sube el ahorro, alarga el plazo o fija una aportación en el objetivo.</small></div></div>` : ''}
    ${!income ? html`<p class="muted mt">Indica tu ingreso mensual en «Reglas» o apunta la nómina para calcular el reparto.</p>` : ''}
    ${items.length ? html`<h3 class="mt">Reparto ${saved?.accepted ? 'del mes' : 'sugerido'}</h3><form id="planf" class="alloc">${items.map((it, i) => html`<div class="alloc-row">
        ${saved?.accepted ? html`<input type="checkbox" name="done${i}" ${raw(it.done ? 'checked' : '')} aria-label="Hecho">` : ''}
        <div class="flex"><b>${it.label}</b>${it.why ? html`<small>${it.why}</small>` : ''}</div>
        <input name="a${i}" data-money inputmode="decimal" value="${String(it.amount).replace('.', ',')}"></div>`)}
      <div class="row between mt"><small class="muted">Total: <b id="ptot">${money(sum(items, (x) => x.amount), B)}</b></small>
        <div class="row gap">${saved?.accepted ? html`<button type="button" class="btn small ghost" data-reset>Recalcular</button><button class="btn small primary">Guardar</button>`
          : html`<button class="btn small primary">Aceptar reparto</button>`}</div></div></form>
    <p class="small muted mt">Puedes cambiar cualquier cantidad antes de aceptar. ${saved?.accepted ? 'Marca cada partida cuando hagas la transferencia.' : 'Si cobras menos, el reparto baja en proporción.'}</p>` : ''}
  </section>
  <section class="card">
    <div class="row between"><h3>📊 Presupuestos</h3><button class="btn small ghost" data-suggest>Sugerir</button></div>
    <p class="small muted">Total presupuestado: <b>${money(bt, B)}</b>${income ? html` · ${Math.round((bt / income) * 100)} % del ingreso` : ''}. Gastado: <b>${money(sm.expense, B)}</b>.</p>
    <form id="budf">${roots.map((c) => {
      const b = bs[c.id]; const spent = sm.byCat[c.id] || 0; const lim = s.budgets[c.id] || '';
      return html`<div class="bud-edit"><div class="row between"><span>${c.icon} ${c.name}${c.essential ? html` <small class="tag">esencial</small>` : ''}</span>
        <input name="${c.id}" data-money inputmode="decimal" placeholder="Sin límite" value="${lim ? String(lim).replace('.', ',') : ''}"></div>
        ${lim ? raw(progress(b?.ratio || 0, b?.level)) : ''}
        <small class="muted">Gastado ${money(spent, B, { decimals: 0 })}${av.byCat[c.id] ? ` · media ${money(av.byCat[c.id], B, { decimals: 0 })}` : ''}</small></div>`;
    })}<button class="btn primary block mt">Guardar presupuestos</button></form>
  </section>`;
}
function mountPlan(el, s) {
  const p = planPeriod ? periodOf(s, planPeriod) : periodOf(s);
  el.querySelectorAll('[data-pp]').forEach((b) => { b.onclick = () => { planPeriod = shiftPeriod(s, p, Number(b.dataset.pp)).start; update(() => {}); }; });
  const gf = el.querySelector('#goalf');
  const saveGoal = () => {
    const v = num(gf.sv.value); const mode = gf.sm.value;
    update((st) => {
      st.settings.plan.savingsMode = mode;
      if (mode === 'amount') st.settings.plan.savingsAmount = round2(v); else st.settings.plan.savingsRate = Math.min(100, v) / 100;
    });
  };
  gf.sv.onchange = saveGoal;
  gf.sm.onchange = () => {
    const inc = suggestAllocation(s, p).income; const cur = num(gf.sv.value);
    gf.sv.value = String(gf.sm.value === 'amount' ? Math.round(inc * cur / 100) : (inc ? Math.round(cur / inc * 1000) / 10 : 0)).replace('.', ',');
    saveGoal();
  };
  gf.onsubmit = (e) => { e.preventDefault(); saveGoal(); };
  const pf = el.querySelector('#planf');
  if (pf) {
    const saved = s.plans[p.key];
    const items = saved?.accepted ? saved.items : suggestAllocation(s, p).items;
    pf.oninput = () => { el.querySelector('#ptot').textContent = money(sum(items, (_, i) => num(pf[`a${i}`].value)), base(s)); };
    pf.onsubmit = (e) => {
      e.preventDefault();
      const out = items.map((it, i) => ({ ...it, amount: round2(num(pf[`a${i}`].value)), done: !!pf[`done${i}`]?.checked }));
      update((st) => { st.plans[p.key] = { items: out, accepted: true, at: new Date().toISOString() }; });
      toast(saved?.accepted ? 'Reparto guardado' : 'Reparto aceptado', 'ok');
    };
    el.querySelector('[data-reset]')?.addEventListener('click', () => update((st) => { delete st.plans[p.key]; }));
  }
  el.querySelector('#budf').onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    update((st) => { for (const inp of f.querySelectorAll('input')) { const v = num(inp.value); if (v > 0) st.budgets[inp.name] = round2(v); else delete st.budgets[inp.name]; } });
    toast('Presupuestos guardados', 'ok');
  };
  el.querySelector('[data-suggest]').onclick = () => suggestBudgets(s);
  el.querySelector('[data-rules]').onclick = () => rulesForm(s);
}

function suggestBudgets(s) {
  const av = averages(s, 3);
  const roots = s.categories.filter((c) => c.kind === 'expense' && !c.parent);
  const inc = s.settings.expectedIncome || av.income;
  let sug = {};
  if (av.n >= 1) {
    for (const c of roots) if (av.byCat[c.id]) sug[c.id] = Math.ceil((av.byCat[c.id] * (c.essential ? 1 : 0.9)) / 5) * 5;
  } else if (inc) {
    // Sin historial: reparto orientativo del gasto previsto
    const spend = inc - savingsTarget(s, inc);
    const w = { Vivienda: 0.3, Alimentación: 0.22, Transporte: 0.12, 'Salud y cuidado': 0.05, Ocio: 0.12, Compras: 0.07, Suscripciones: 0.03, Educación: 0.03, Finanzas: 0.02, 'Otros gastos': 0.04 };
    for (const c of roots) if (w[c.name]) sug[c.id] = Math.round((spend * w[c.name]) / 5) * 5;
  }
  if (!Object.keys(sug).length) { toast('Necesito tu ingreso o algún mes con gastos para sugerir'); return; }
  update((st) => { st.budgets = { ...st.budgets, ...sug }; });
  toast(av.n ? 'Presupuestos ajustados a tu gasto real (−10 % en no esenciales)' : 'Presupuestos orientativos según tu ingreso', 'ok');
}

function rulesForm(s) {
  const st = s.settings.plan;
  sheet('Reglas del reparto', html`<form class="form">
    ${field({ name: 'expectedIncome', label: 'Ingreso mensual previsto', type: 'money', value: s.settings.expectedIncome || '', hint: 'Se usa hasta que entra la nómina del periodo; después se usa lo cobrado de verdad.' })}
    <span class="lbl">Objetivo de ahorro</span>
    <div class="unit"><input name="sv" data-money inputmode="decimal" value="${String(st.savingsMode === 'amount' ? st.savingsAmount || 0 : Math.round((st.savingsRate || 0) * 1000) / 10).replace('.', ',')}">
      <select name="sm"><option value="percent" ${raw(st.savingsMode !== 'amount' ? 'selected' : '')}>% del ingreso</option><option value="amount" ${raw(st.savingsMode === 'amount' ? 'selected' : '')}>${curSymbol(base(s))}/mes</option></select></div>
    <small class="muted">Con % el ahorro se adapta si un mes cobras menos; con cantidad fija ahorras siempre lo mismo.</small>
    ${field({ name: 'emergencyMonths', label: 'Meses de gastos esenciales en el colchón', type: 'number', value: st.emergencyMonths, min: 1, max: 24, hint: `Colchón objetivo actual: ${money(emergencyTarget(s), base(s))}` })}
    ${field({ name: 'emergencyShare', label: '% del ahorro que va al colchón mientras no esté completo', type: 'money', value: Math.round(st.emergencyShare * 100) })}
    ${field({ name: 'investShare', label: '% de lo que sobre tras colchón y objetivos que va a inversión', type: 'money', value: Math.round(st.investShare * 100), hint: 'El resto queda como ahorro sin asignar.' })}
    <button class="btn primary block">Guardar</button></form>`, (el, close) => {
    el.querySelector('form').onsubmit = (e) => {
      e.preventDefault(); const v = readForm(e.target); const sv = num(e.target.sv.value);
      update((x) => {
        const P = x.settings.plan;
        P.savingsMode = e.target.sm.value;
        if (P.savingsMode === 'amount') P.savingsAmount = round2(sv); else P.savingsRate = Math.min(100, sv) / 100;
        Object.assign(P, { emergencyMonths: Number(v.emergencyMonths) || 6, emergencyShare: Math.min(1, (v.emergencyShare || 0) / 100), investShare: Math.min(1, (v.investShare || 0) / 100) });
        x.settings.expectedIncome = v.expectedIncome || 0;
      });
      close(); toast('Reglas guardadas', 'ok');
    };
  });
}

// ======================= Objetivos =======================
function objetivos(s) {
  const B = base(s);
  const list = s.goals.map((g) => goalInfo(s, g)).sort((a, b) => (a.g.closed ? 1 : 0) - (b.g.closed ? 1 : 0) || (a.g.priority || 3) - (b.g.priority || 3));
  const totalNeed = sum(list.filter((x) => !x.g.closed && x.monthlyNeed), (x) => x.monthlyNeed);
  const hasEmer = s.goals.some((g) => g.kind === 'emergency');
  return html`
  <div class="subnav"><a href="#/plan">Este mes</a><a class="on" href="#/objetivos">Objetivos</a></div>
  <div class="row gap mb"><button class="btn primary flex" data-new>+ Nuevo objetivo</button>${!hasEmer ? html`<button class="btn" data-emer>🛟 Crear colchón</button>` : ''}</div>
  ${totalNeed ? html`<div class="callout"><span>📆</span><div><small>Para cumplir todos a tiempo necesitas apartar</small> <b>${money(totalNeed, B)}</b> <small>al mes.</small></div></div>` : ''}
  ${list.length ? list.map((x) => html`<section class="card goal ${x.g.closed ? 'dim' : ''}">
    <div class="row between"><h3>${x.g.icon} ${x.g.name}</h3><small class="tag">P${x.g.priority || 3}</small></div>
    <div class="row between"><b>${money(x.saved, B)}</b><small class="muted">de ${money(x.target, B)}${x.g.kind === 'emergency' && x.g.autoTarget !== false ? ' (auto)' : ''}</small></div>
    ${raw(progress(x.progress, x.done ? 'ok' : x.behind ? 'warn' : ''))}
    <small class="muted">${x.done ? '✅ Conseguido' : x.g.targetDate ? `${fmtDate(x.g.targetDate, true)} · ${x.months} meses · ${money(x.monthlyNeed, B)}/mes` : `Faltan ${money(x.left, B)}`}${x.behind ? ' · va por detrás' : ''}</small>
    ${x.g.accountId ? html`<small class="muted block">Saldo de ${byId(s.accounts, x.g.accountId)?.name || '?'}</small>` : ''}
    <div class="row gap mt">${!x.g.accountId ? html`<button class="btn small" data-contrib="${x.g.id}">Aportar</button>` : ''}<button class="btn small ghost" data-edit="${x.g.id}">Editar</button></div>
  </section>`) : html`<div class="empty"><p>Crea objetivos con fecha (máster, coche, viaje…) y Dinerico calculará cuánto apartar cada mes y los incluirá en el reparto.</p></div>`}`;
}
function mountObj(el, s) {
  el.querySelector('[data-new]').onclick = () => goalForm();
  el.querySelector('[data-emer]')?.addEventListener('click', () => {
    update((st) => { st.goals.push({ id: crypto.randomUUID?.() || String(Date.now()), kind: 'emergency', autoTarget: true, icon: '🛟', name: 'Fondo de emergencia', priority: 1, contributions: [], initial: 0, createdAt: new Date().toISOString() }); });
    toast('Colchón creado. Edítalo para vincularlo a la cuenta donde lo guardas.', 'ok');
  });
  el.querySelectorAll('[data-edit]').forEach((b) => { b.onclick = () => goalForm(byId(s.goals, b.dataset.edit)); });
  el.querySelectorAll('[data-contrib]').forEach((b) => { b.onclick = () => contributionForm(byId(s.goals, b.dataset.contrib)); });
}

export const routes = {
  plan: { title: 'Plan del mes', render: plan, mount: mountPlan },
  objetivos: { title: 'Objetivos', render: objetivos, mount: mountObj },
};
export { esc };
