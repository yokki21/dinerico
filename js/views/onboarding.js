// Asistente inicial: configura Dinerico para cualquier persona en unos minutos.
import { curSymbol, html, raw, uid, today, num, round2, esc, money, addMonths, sum } from '../util.js';
import { update, getState, setPin, readBackup, replaceState } from '../store.js';
import { PROFILES, CURRENCIES, ACCOUNT_TYPES, ASSET_KINDS } from '../defaults.js';
import { toast, sheet, field } from '../ui.js';
import { newPin } from './lock.js';
import { nextDate } from '../calc.js';

const BANKS = ['Efectivo', 'Revolut', 'Imagin', 'Trade Republic', 'MyInvestor', 'ING', 'BBVA', 'Santander', 'CaixaBank', 'Openbank', 'N26', 'Sabadell', 'Bankinter', 'Unicaja', 'Kutxabank', 'Indexa Capital', 'Binance', 'Wise'];
const BANK_TYPE = { Efectivo: 'cash', 'Trade Republic': 'broker', MyInvestor: 'broker', 'Indexa Capital': 'broker', Binance: 'crypto' };
const FIXED = [['Alquiler / hipoteca', 'Alquiler / hipoteca'], ['Aportación a casa', 'Aportación a casa'], ['Luz', 'Luz'], ['Agua', 'Agua'], ['Internet y móvil', 'Internet y móvil'], ['Gimnasio', 'Gimnasio'],
  ['Seguro coche', 'Seguro coche'], ['Renting / cuota coche', 'Renting / cuota coche'], ['Transporte público', 'Transporte público'], ['Streaming', 'Streaming'], ['Música', 'Música'], ['Apps y software', 'Apps y software']];
const GOALS = [['🎓', 'Máster'], ['🚗', 'Coche'], ['🏠', 'Entrada de un piso'], ['✈️', 'Viaje'], ['💻', 'Ordenador'], ['💍', 'Boda'], ['🎁', 'Regalos de Navidad']];

const L = (label, inner) => html`<label class="field"><span>${label}</span>${inner}</label>`;
let step = 0;
let d = null;
const fresh = () => ({
  name: '', currency: 'EUR', profile: 'primerEmpleo', theme: 'auto',
  income: '', variable: false, payday: 28, periodMode: 'payday', weekendShift: true, extraPays: 12, incomeAcc: 0,
  accounts: [], fixed: [], goals: [], emergency: true, emergencyMonths: 6, emergencyAcc: '',
  assets: [], monthlyInvest: '', monthlyInvestAsset: 0,
  savingsMode: 'percent', savingsValue: 25, emergencyShare: 50, investShare: 50, pin: false,
});

const STEPS = ['Bienvenida', 'Sobre ti', 'Ingresos', 'Cuentas', 'Gastos fijos', 'Objetivos', 'Inversiones', 'Reglas', 'Listo'];

function view() {
  if (!d) d = fresh();
  const bar = `<div class="steps">${STEPS.map((_, i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>`;
  const nav = (next = 'Siguiente', back = true) => html`<div class="row gap mt wiz-nav">${back ? html`<button class="btn ghost" data-back>Atrás</button>` : ''}<span class="flex"></span><button class="btn primary" data-next>${next}</button></div>`;
  const S = [
    () => html`<div class="wiz-hero"><div class="logo">🪙</div><h1>Dinerico</h1><p>Tus finanzas, ahorro e inversiones en un solo sitio.</p></div>
      <ul class="feat"><li>🔒 Todo se guarda en tu dispositivo. Sin cuentas ni servidores.</li><li>🧮 Te propone cada mes cuánto ahorrar e invertir según lo que cobras.</li><li>📊 Informe mensual con lo que ha ido bien y qué mejorar.</li><li>📈 Inversiones, deudas, objetivos, patrimonio y fiscalidad.</li></ul>
      <p class="small muted">Te haré unas preguntas (unos 3 minutos) para personalizarlo. Todo se puede cambiar después.</p>
      ${getState()?.settings.onboarded ? html`<p class="small warn-text">Ya tienes Dinerico configurado: lo que añadas ahora se sumará a tus datos actuales.</p>` : ''}
      <div class="row gap mt"><label class="btn ghost">Restaurar una copia<input type="file" accept=".json" hidden data-restore></label><span class="flex"></span><button class="btn primary" data-next>Empezar</button></div>`,
    () => html`<h2>Sobre ti</h2>
      <label class="field"><span>¿Cómo te llamas?</span><input name="name" value="${d.name}" placeholder="Opcional"></label>
      <label class="field"><span>Moneda principal</span><select name="currency">${CURRENCIES.map((c) => html`<option ${raw(c === d.currency ? 'selected' : '')}>${c}</option>`)}</select></label>
      <span class="lbl">¿Qué te describe mejor?</span><div class="opts">${Object.entries(PROFILES).map(([k, p]) => html`<label class="opt"><input type="radio" name="profile" value="${k}" ${raw(d.profile === k ? 'checked' : '')}><span><b>${p.label}</b><small>Ahorro sugerido ${Math.round(p.savingsRate * 100)} % · colchón de ${p.emergencyMonths} meses</small></span></label>`)}</div>
      <span class="lbl">Tema</span><div class="seg">${[['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([v, l]) => html`<label><input type="radio" name="theme" value="${v}" ${raw(d.theme === v ? 'checked' : '')}><span>${l}</span></label>`)}</div>
      ${nav()}`,
    () => html`<h2>Ingresos</h2>
      <label class="field"><span>¿Cuánto cobras al mes (neto)?</span><input name="income" data-money inputmode="decimal" value="${d.income}" placeholder="Ej.: 1.450"><small>Si varía, pon una media prudente.</small></label>
      <label class="check"><input type="checkbox" name="variable" ${raw(d.variable ? 'checked' : '')}><span>Mis ingresos varían de un mes a otro<small>Dinerico pedirá confirmación al apuntar la nómina en lugar de hacerlo solo.</small></span></label>
      <label class="field"><span>Pagas al año</span><select name="extraPays">${[12, 14, 15].map((n) => html`<option ${raw(Number(d.extraPays) === n ? 'selected' : '')}>${n}</option>`)}</select><small>Con 14 pagas, las extra se tratan como ingreso puntual en junio y diciembre.</small></label>
      <label class="field"><span>¿Qué día sueles cobrar?</span><input name="payday" type="number" min="1" max="31" value="${d.payday}"></label>
      <span class="lbl">¿Cómo quieres contar el mes para presupuestos e informes?</span>
      <div class="opts"><label class="opt"><input type="radio" name="periodMode" value="payday" ${raw(d.periodMode === 'payday' ? 'checked' : '')}><span><b>De nómina a nómina</b><small>El mes empieza el día que cobras y acaba el día anterior al siguiente cobro. Ideal si cobras a final de mes.</small></span></label>
        <label class="opt"><input type="radio" name="periodMode" value="calendar" ${raw(d.periodMode === 'calendar' ? 'checked' : '')}><span><b>Mes natural</b><small>Del 1 al 30/31.</small></span></label></div>
      <label class="check"><input type="checkbox" name="weekendShift" ${raw(d.weekendShift ? 'checked' : '')}><span>Si el día de cobro cae en fin de semana, el mes empieza el viernes anterior</span></label>
      ${nav()}`,
    () => html`<h2>Tus cuentas</h2>
      <div class="hint-box"><b>Aquí va solo el dinero disponible</b>: el saldo de tus cuentas y el efectivo.<br>Lo que tengas <b>invertido</b> (fondos, ETF, acciones, cripto, planes de pensiones) <b>no lo pongas aquí</b>: va en el paso de Inversiones, si no se contaría dos veces.<br>En brókers como Trade Republic o MyInvestor pon solo el efectivo sin invertir (si no hay, 0).</div>
      <div class="chips mt">${BANKS.map((b) => html`<button type="button" class="chip" data-bank="${b}">+ ${b}</button>`)}<button type="button" class="chip" data-bank="">+ Otra</button></div>
      <div id="accs">${d.accounts.map((a, i) => html`<div class="card soft rowform" data-row="${i}">
        <div class="grid2">${L('Nombre', html`<input name="an${i}" value="${a.name}" placeholder="Nombre">`)}${L('Tipo', html`<select name="at${i}">${Object.entries(ACCOUNT_TYPES).map(([k, v]) => html`<option value="${k}" ${raw(a.type === k ? 'selected' : '')}>${v.icon} ${v.label}</option>`)}</select>`)}</div>
        <div class="grid2">${L('Saldo disponible hoy', html`<input name="ab${i}" data-money inputmode="decimal" value="${a.balance}" placeholder="0">`)}${L('Moneda', html`<select name="ac${i}">${[...new Set([d.currency, ...CURRENCIES])].map((c) => html`<option ${raw(a.currency === c ? 'selected' : '')}>${c}</option>`)}</select>`)}</div>
        <div class="grid2">${L('Interés (TAE %)', html`<input name="ai${i}" data-money inputmode="decimal" value="${a.interest}" placeholder="Si es remunerada">`)}<div class="field"><span>&nbsp;</span><button type="button" class="btn small ghost danger" data-rm="${i}">Quitar</button></div></div></div>`)}</div>
      ${d.accounts.length ? html`<label class="field mt"><span>¿En qué cuenta cobras la nómina?</span><select name="incomeAcc">${d.accounts.map((a, i) => html`<option value="${i}" ${raw(Number(d.incomeAcc) === i ? 'selected' : '')}>${a.name || 'Cuenta ' + (i + 1)}</option>`)}</select></label>` : ''}
      ${nav(d.accounts.length ? 'Siguiente' : 'Saltar')}`,
    () => html`<h2>Gastos fijos</h2><p class="small muted">Lo que pagas todos los meses. Se apuntarán solos en su día; si el importe cambia cada mes (luz, agua), marca «pedir confirmación».</p>
      <div class="chips">${FIXED.map(([n]) => html`<button type="button" class="chip" data-fix="${n}">+ ${n}</button>`)}<button type="button" class="chip" data-fix="">+ Otro</button></div>
      <div id="fx">${d.fixed.map((f, i) => html`<div class="card soft rowform">
        <div class="grid2">${L('Concepto', html`<input name="fn${i}" value="${f.name}" placeholder="Concepto">`)}${L('Importe al mes', html`<input name="fa${i}" data-money inputmode="decimal" value="${f.amount}" placeholder="0">`)}</div>
        <div class="grid2">${L('Día del mes', html`<input name="fd${i}" type="number" min="1" max="31" inputmode="numeric" value="${f.day}">`)}${L('Se paga desde', html`<select name="fac${i}">${d.accounts.map((a, j) => html`<option value="${j}" ${raw(Number(f.acc) === j ? 'selected' : '')}>${a.name}</option>`)}</select>`)}</div>
        <div class="row between"><label class="check inline"><input type="checkbox" name="fv${i}" ${raw(f.confirm ? 'checked' : '')}><span>Importe variable: pedir confirmación</span></label><button type="button" class="btn small ghost danger" data-rmf="${i}">Quitar</button></div></div>`)}</div>
      ${!d.accounts.length && d.fixed.length ? html`<p class="small bad">Añade al menos una cuenta para poder apuntarlos.</p>` : ''}
      ${d.fixed.length ? html`<p class="small">Total fijo: <b>${money(sum(d.fixed, (f) => num(f.amount)), d.currency)}</b>/mes${num(d.income) ? html` · ${Math.round(sum(d.fixed, (f) => num(f.amount)) / num(d.income) * 100)} % de tu ingreso` : ''}</p>` : ''}
      ${nav(d.fixed.length ? 'Siguiente' : 'Saltar')}`,
    () => html`<h2>Objetivos de ahorro</h2>
      <label class="check"><input type="checkbox" name="emergency" ${raw(d.emergency ? 'checked' : '')}><span><b>🛟 Fondo de emergencia</b><small>Dinero para imprevistos (despido, avería, contrato que no renuevan). Recomendado antes de invertir.</small></span></label>
      <div class="grid2">${L('Meses de gastos esenciales', html`<input name="emergencyMonths" type="number" min="1" max="24" inputmode="numeric" value="${d.emergencyMonths}">`)}
        ${L('¿Dónde lo guardas?', html`<select name="emergencyAcc"><option value="">Aportaciones a mano</option>${d.accounts.map((a, i) => html`<option value="${i}" ${raw(String(d.emergencyAcc) === String(i) ? 'selected' : '')}>${a.name}</option>`)}</select>`)}</div>
      <span class="lbl mt">Otros objetivos</span><div class="chips">${GOALS.map(([ic, n]) => html`<button type="button" class="chip" data-goal="${n}" data-ic="${ic}">${ic} ${n}</button>`)}<button type="button" class="chip" data-goal="" data-ic="🎯">+ Otro</button></div>
      <div id="gl">${d.goals.map((g, i) => {
        const n = num(g.target) - num(g.have); const m = Number(g.n) * (g.u === 'y' ? 12 : 1);
        return html`<div class="card soft rowform"><div class="grid-icon">${L('Icono', html`<input name="gi${i}" value="${g.icon}" maxlength="4">`)}${L('Objetivo', html`<input name="gn${i}" value="${g.name}" placeholder="Nombre">`)}</div>
        <div class="grid2">${L('¿Cuánto necesitas?', html`<input name="gt${i}" data-money inputmode="decimal" value="${g.target}" placeholder="0">`)}${L('Ya ahorrado', html`<input name="gh${i}" data-money inputmode="decimal" value="${g.have}" placeholder="0">`)}</div>
        <span class="lbl">¿En cuánto tiempo?</span><div class="unit"><input name="gn_${i}" type="number" min="1" inputmode="numeric" value="${g.n}" placeholder="Sin fecha"><select name="gu${i}"><option value="m" ${raw(g.u !== 'y' ? 'selected' : '')}>meses</option><option value="y" ${raw(g.u === 'y' ? 'selected' : '')}>años</option></select></div>
        <div class="row between"><small class="muted" data-gm="${i}">${n > 0 && m > 0 ? `≈ ${money(n / m, d.currency)} al mes` : ''}</small><button type="button" class="btn small ghost danger" data-rmg="${i}">Quitar</button></div></div>`;
      })}</div>
      ${nav()}`,
    () => html`<h2>Inversiones</h2>
      <div class="hint-box">Añade aquí lo que tienes <b>invertido</b> hoy (el dinero que no está como saldo en las cuentas del paso anterior). Si es un fondo, un ETF o una acción y sabes las participaciones, ponlas: así la rentabilidad y la fiscalidad serán exactas.</div>
      <div class="chips mt">${Object.entries(ASSET_KINDS).filter(([k]) => k !== 'other').map(([k, v]) => html`<button type="button" class="chip" data-asset="${k}">+ ${v.icon} ${v.label}</button>`)}</div>
      <div id="as">${d.assets.map((a, i) => html`<div class="card soft rowform"><b>${ASSET_KINDS[a.kind].icon} ${ASSET_KINDS[a.kind].label}</b>
        ${L('Nombre', html`<input name="sn${i}" value="${a.name}" placeholder="P. ej. Fidelity MSCI World">`)}
        <div class="grid2">${L('Total que metiste', html`<input name="sc${i}" data-money inputmode="decimal" value="${a.cost}" placeholder="0">`)}${L('Lo que vale hoy', html`<input name="sv${i}" data-money inputmode="decimal" value="${a.value}" placeholder="0">`)}</div>
        <div class="grid2">${ASSET_KINDS[a.kind].unit ? L('Participaciones (opcional)', html`<input name="sq${i}" data-money inputmode="decimal" value="${a.qty || ''}" placeholder="Si las sabes">`) : html`<span></span>`}
          ${L('Bróker / entidad', html`<select name="sa${i}"><option value="">—</option>${d.accounts.map((x, j) => html`<option value="${j}" ${raw(String(a.acc) === String(j) ? 'selected' : '')}>${x.name}</option>`)}</select>`)}</div>
        <div class="row end"><button type="button" class="btn small ghost danger" data-rma="${i}">Quitar</button></div></div>`)}</div>
      ${d.assets.length ? html`<div class="grid2 mt">${L('Aportación periódica mensual', html`<input name="monthlyInvest" data-money inputmode="decimal" value="${d.monthlyInvest}" placeholder="0">`)}
        ${L('A qué activo', html`<select name="monthlyInvestAsset">${d.assets.map((a, i) => html`<option value="${i}" ${raw(Number(d.monthlyInvestAsset) === i ? 'selected' : '')}>${a.name || ASSET_KINDS[a.kind].label}</option>`)}</select>`)}</div>` : ''}
      ${nav(d.assets.length ? 'Siguiente' : 'No invierto aún')}`,
    () => {
      const inc = num(d.income); const fixed = sum(d.fixed, (f) => num(f.amount));
      const amt = d.savingsMode === 'amount' ? num(d.savingsValue) : inc * num(d.savingsValue) / 100;
      return html`<h2>Tu ahorro</h2>
      <span class="lbl">¿Cuánto quieres ahorrar cada mes?</span>
      <div class="unit"><input name="savingsValue" data-money inputmode="decimal" value="${d.savingsValue}"><select name="savingsMode"><option value="percent" ${raw(d.savingsMode !== 'amount' ? 'selected' : '')}>% del ingreso</option><option value="amount" ${raw(d.savingsMode === 'amount' ? 'selected' : '')}>${curSymbol(d.currency)}/mes</option></select></div>
      <small class="muted" id="sre">${inc ? `= ${money(amt, d.currency, { decimals: 0 })} al mes; te quedan ${money(inc - amt, d.currency, { decimals: 0 })} para gastar${fixed ? ` (${money(fixed, d.currency, { decimals: 0 })} ya son gastos fijos)` : ''}.` : ''}</small>
      <small class="muted">Con % el ahorro se adapta si un mes cobras menos; con cantidad fija ahorras siempre lo mismo. Puedes cambiarlo cuando quieras en Plan.</small>
      <h3 class="mt">¿Cómo se reparte ese ahorro?</h3>
      ${L('% al fondo de emergencia mientras no esté completo', html`<input name="emergencyShare" type="number" min="0" max="100" inputmode="numeric" value="${d.emergencyShare}">`)}
      <small class="muted">Después se cubren tus objetivos según su plazo.</small>
      ${L('% de lo que sobre que va a inversión', html`<input name="investShare" type="number" min="0" max="100" inputmode="numeric" value="${d.investShare}">`)}
      <small class="muted">El resto queda como ahorro sin asignar. Cada mes podrás cambiar las cantidades antes de aceptar el reparto.</small>
      <label class="check mt"><input type="checkbox" name="pin" ${raw(d.pin ? 'checked' : '')}><span><b>🔒 Proteger con PIN</b><small>Cifra los datos del dispositivo. Si lo olvidas, no se pueden recuperar.</small></span></label>
      ${nav('Terminar')}`;
    },
    () => html`<div class="wiz-hero"><div class="logo">🎉</div><h1>¡Listo${d.name ? ', ' + esc(d.name) : ''}!</h1><p>Dinerico ya está configurado.</p></div>
      <ul class="feat"><li>Pulsa <b>+</b> para apuntar un gasto en dos toques.</li><li>En <b>Plan</b> verás el reparto del mes y los presupuestos (ya te he propuesto unos).</li><li>En <b>Más › Ajustes</b> descarga copias de seguridad de vez en cuando.</li><li>Instálala: en el navegador, «Añadir a pantalla de inicio».</li></ul>
      <a class="btn primary block mt" href="#/inicio">Ir al inicio</a>`,
  ];
  return html`<div class="wizard">${raw(bar)}<form id="wiz" class="form">${S[step]()}</form></div>`;
}

/** Copia los valores del formulario al borrador. */
function collect(f) {
  const g = (n) => f.elements[n];
  const val = (n) => (g(n) ? (g(n).type === 'checkbox' ? g(n).checked : g(n).value) : undefined);
  for (const k of ['name', 'currency', 'income', 'payday', 'extraPays', 'incomeAcc', 'emergencyMonths', 'emergencyAcc', 'monthlyInvest', 'monthlyInvestAsset', 'savingsValue', 'savingsMode', 'emergencyShare', 'investShare']) if (g(k)) d[k] = val(k);
  for (const k of ['variable', 'weekendShift', 'emergency', 'pin']) if (g(k)) d[k] = val(k);
  for (const k of ['profile', 'theme', 'periodMode']) { const c = f.querySelector(`[name=${k}]:checked`); if (c) d[k] = c.value; }
  d.accounts.forEach((a, i) => { if (g('an' + i)) Object.assign(a, { name: val('an' + i), type: val('at' + i), balance: val('ab' + i), currency: val('ac' + i), interest: val('ai' + i) }); });
  d.fixed.forEach((x, i) => { if (g('fn' + i)) Object.assign(x, { name: val('fn' + i), amount: val('fa' + i), day: val('fd' + i), acc: val('fac' + i), confirm: val('fv' + i) }); });
  d.goals.forEach((x, i) => { if (g('gn' + i)) Object.assign(x, { icon: val('gi' + i), name: val('gn' + i), target: val('gt' + i), n: val('gn_' + i), u: val('gu' + i), have: val('gh' + i) }); });
  d.assets.forEach((x, i) => { if (g('sn' + i)) Object.assign(x, { name: val('sn' + i), cost: val('sc' + i), value: val('sv' + i), acc: val('sa' + i), qty: val('sq' + i) }); });
}

function applyProfile() {
  const p = PROFILES[d.profile]; if (!p) return;
  if (d.savingsMode !== 'amount') d.savingsValue = Math.round(p.savingsRate * 100); d.emergencyMonths = p.emergencyMonths;
  d.emergencyShare = Math.round(p.emergencyShare * 100); d.investShare = Math.round(p.investShare * 100);
}

function firstDate(day) {
  const t = today(); const y = Number(t.slice(0, 4)), m = Number(t.slice(5, 7)) - 1;
  const dd = Math.min(Number(day) || 1, new Date(y, m + 1, 0).getDate());
  let iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  if (iso < t) iso = nextDate({ freq: 'monthly', day: Number(day) || 1 }, iso);
  return iso;
}

async function finish() {
  const cur = d.currency;
  update((st) => {
    const S = st.settings;
    Object.assign(S, {
      name: d.name.trim(), currency: cur, theme: d.theme, profile: d.profile, periodMode: d.periodMode,
      payday: Math.min(31, Math.max(1, Number(d.payday) || 1)), paydayWeekendShift: !!d.weekendShift,
      expectedIncome: round2(num(d.income)), incomeVariable: !!d.variable, onboarded: true,
    });
    if (st.fx.base !== cur) st.fx = { base: cur, rates: { [cur]: 1 }, date: null, manual: {} };
    Object.assign(S.plan, { savingsMode: d.savingsMode, savingsRate: d.savingsMode === 'amount' ? S.plan.savingsRate : Math.min(100, num(d.savingsValue)) / 100, savingsAmount: d.savingsMode === 'amount' ? round2(num(d.savingsValue)) : 0, emergencyMonths: Number(d.emergencyMonths) || 6, emergencyShare: num(d.emergencyShare) / 100, investShare: num(d.investShare) / 100 });
    const accIds = d.accounts.map((a) => {
      const id = uid();
      st.accounts.push({ id, name: a.name?.trim() || 'Cuenta', type: a.type || 'bank', currency: a.currency || cur, initial: round2(num(a.balance)), interest: num(a.interest) / 100 });
      return id;
    });
    const cat = (name, kind = 'expense') => st.categories.find((c) => c.kind === kind && c.name.toLowerCase() === name.toLowerCase())?.id;
    if (accIds.length && num(d.income) > 0) {
      const inc = round2(num(d.income));
      st.recurring.push({ id: uid(), name: 'Nómina', type: 'income', amount: inc, accountId: accIds[Number(d.incomeAcc) || 0], categoryId: cat('Nómina', 'income'), freq: 'monthly', next: firstDate(d.payday), day: Number(d.payday) || 1, mode: d.variable ? 'confirm' : 'auto', active: true });
      if (Number(d.extraPays) > 12) {
        const y = today().slice(0, 4);
        const dates = [`${y}-06-${String(Math.min(30, Number(d.payday) || 30)).padStart(2, '0')}`, `${y}-12-${String(Math.min(20, Number(d.payday) || 20)).padStart(2, '0')}`].map((x) => (x < today() ? addMonths(x, 12) : x));
        const base = { name: 'Paga extra', type: 'income', amount: inc, accountId: accIds[Number(d.incomeAcc) || 0], categoryId: cat('Nómina', 'income'), freq: 'yearly', mode: 'confirm', active: true };
        st.recurring.push({ ...base, id: uid(), next: dates[1], day: Number(dates[1].slice(8)) });
        if (Number(d.extraPays) >= 14) st.recurring.push({ ...base, id: uid(), next: dates[0], day: Number(dates[0].slice(8)) });
      }
    }
    if (accIds.length) for (const f of d.fixed) {
      if (!num(f.amount)) continue;
      const c = FIXED.find(([n]) => n === f.name);
      st.recurring.push({ id: uid(), name: f.name?.trim() || 'Gasto fijo', type: 'expense', amount: round2(num(f.amount)), accountId: accIds[Number(f.acc) || 0], categoryId: (c && cat(c[1])) || cat('Otros gastos'), freq: 'monthly', next: firstDate(f.day || 1), day: Number(f.day) || 1, mode: f.confirm ? 'confirm' : 'auto', active: true });
    }
    if (d.emergency) {
      const accIdx = d.emergencyAcc === '' ? null : Number(d.emergencyAcc);
      st.goals.push({ id: uid(), kind: 'emergency', autoTarget: true, icon: '🛟', name: 'Fondo de emergencia', priority: 1, accountId: accIdx != null ? accIds[accIdx] : null, initial: 0, contributions: [], createdAt: new Date().toISOString() });
    }
    for (const g of d.goals) {
      if (!g.name) continue;
      st.goals.push({ id: uid(), kind: 'normal', icon: g.icon || '🎯', name: g.name.trim(), target: round2(num(g.target)), targetDate: Number(g.n) > 0 ? addMonths(today(), Number(g.n) * (g.u === 'y' ? 12 : 1)) : null, priority: 3, initial: round2(num(g.have)), contributions: [], createdAt: new Date().toISOString() });
    }
    const assetIds = d.assets.map((a) => {
      const id = uid(); const unit = ASSET_KINDS[a.kind].unit;
      const acc = a.acc === '' || a.acc == null ? null : accIds[Number(a.acc)];
      const cost = round2(num(a.cost)), value = round2(num(a.value) || cost);
      // Con participaciones: precio = valor / participaciones. Sin ellas: 1 participación (se puede corregir luego)
      const qty = unit ? num(a.qty) || 1 : 0;
      st.assets.push({ id, kind: a.kind, name: a.name?.trim() || ASSET_KINDS[a.kind].label, currency: cur, source: 'manual', accountId: acc, price: unit ? round2(value / qty * 1e4) / 1e4 : undefined, priceDate: today(), startDate: today(), rate: 0 });
      if (cost) st.trades.push({ id: uid(), seq: Date.now(), assetId: id, date: today(), type: 'buy', qty: unit ? qty : cost, price: unit ? cost / qty : 1, fee: 0, note: num(a.qty) || !unit ? 'Posición inicial' : 'Posición inicial (pon tus participaciones reales)' });
      if (!unit && value && value !== cost && a.kind !== 'deposit') st.trades.push({ id: uid(), seq: Date.now() + 1, assetId: id, date: today(), type: 'value', price: value });
      return id;
    });
    if (num(d.monthlyInvest) > 0 && assetIds.length && accIds.length) {
      const ai = Number(d.monthlyInvestAsset) || 0; const a = d.assets[ai];
      const acc = a.acc !== '' && a.acc != null ? accIds[Number(a.acc)] : accIds[Number(d.incomeAcc) || 0];
      st.recurring.push({ id: uid(), name: `Aportación ${a.name || ''}`.trim(), type: 'invest', amount: round2(num(d.monthlyInvest)), accountId: acc, assetId: assetIds[ai], freq: 'monthly', next: firstDate(Math.min(28, (Number(d.payday) || 1) + 1)), day: Math.min(28, (Number(d.payday) || 1) + 1), mode: 'auto', active: true });
    }
    // Presupuestos orientativos a partir del ingreso
    const inc = num(d.income);
    if (inc) {
      const spend = inc - (S.plan.savingsMode === 'amount' ? S.plan.savingsAmount : inc * S.plan.savingsRate);
      const fixedBy = {};
      for (const r of st.recurring.filter((x) => x.type === 'expense')) {
        let c = st.categories.find((x) => x.id === r.categoryId); while (c?.parent) c = st.categories.find((x) => x.id === c.parent);
        if (c) fixedBy[c.id] = (fixedBy[c.id] || 0) + r.amount;
      }
      const w = { Vivienda: 0.3, Alimentación: 0.22, Transporte: 0.12, 'Salud y cuidado': 0.05, Ocio: 0.12, Compras: 0.07, Suscripciones: 0.03, Educación: 0.03, Finanzas: 0.02, 'Otros gastos': 0.04 };
      for (const c of st.categories.filter((x) => x.kind === 'expense' && !x.parent)) {
        const v = Math.max(fixedBy[c.id] || 0, w[c.name] ? Math.round((spend * w[c.name]) / 5) * 5 : 0);
        if (v) st.budgets[c.id] = round2(v);
      }
    }
  });
  if (d.pin) { const pin = await newPin(); if (pin) await setPin(pin); }
  step = 8; d = { ...d }; update(() => {});
}

function mount(el) {
  const f = el.querySelector('#wiz');
  const rerender = () => { el.innerHTML = String(view()); mount(el); window.scrollTo(0, 0); };
  const addRow = (fn) => { collect(f); fn(); el.innerHTML = String(view()); mount(el); };
  f.onsubmit = (e) => e.preventDefault();
  f.querySelector('a[href="#/inicio"]')?.addEventListener('click', () => { step = 0; d = null; });
  f.querySelector('[data-next]')?.addEventListener('click', async () => {
    collect(f);
    if (step === 1) applyProfile();
    if (step === 7) { await finish(); return; }
    step = Math.min(STEPS.length - 1, step + 1); rerender();
  });
  f.querySelector('[data-back]')?.addEventListener('click', () => { collect(f); step = Math.max(0, step - 1); rerender(); });
  f.querySelectorAll('[data-bank]').forEach((b) => { b.onclick = () => addRow(() => d.accounts.push({ name: b.dataset.bank, type: BANK_TYPE[b.dataset.bank] || 'bank', balance: '', currency: d.currency, interest: '' })); });
  f.querySelectorAll('[data-rm]').forEach((b) => { b.onclick = () => addRow(() => d.accounts.splice(Number(b.dataset.rm), 1)); });
  f.querySelectorAll('[data-fix]').forEach((b) => { b.onclick = () => addRow(() => d.fixed.push({ name: b.dataset.fix, amount: '', day: 1, acc: d.incomeAcc || 0, confirm: /luz|agua|gas/i.test(b.dataset.fix) })); });
  f.querySelectorAll('[data-rmf]').forEach((b) => { b.onclick = () => addRow(() => d.fixed.splice(Number(b.dataset.rmf), 1)); });
  f.querySelectorAll('[data-goal]').forEach((b) => { b.onclick = () => addRow(() => d.goals.push({ icon: b.dataset.ic, name: b.dataset.goal, target: '', n: '', u: 'm', have: '' })); });
  f.querySelectorAll('[data-rmg]').forEach((b) => { b.onclick = () => addRow(() => d.goals.splice(Number(b.dataset.rmg), 1)); });
  f.querySelectorAll('[data-asset]').forEach((b) => { b.onclick = () => addRow(() => d.assets.push({ kind: b.dataset.asset, name: '', cost: '', value: '', acc: '' })); });
  f.querySelectorAll('[data-rma]').forEach((b) => { b.onclick = () => addRow(() => d.assets.splice(Number(b.dataset.rma), 1)); });
  const sre = el.querySelector('#sre');
  if (sre) {
    const upd = () => {
      const inc = num(d.income); const v = num(f.savingsValue.value);
      const amt = f.savingsMode.value === 'amount' ? v : inc * v / 100;
      sre.textContent = inc ? `= ${money(amt, d.currency, { decimals: 0 })} al mes; te quedan ${money(inc - amt, d.currency, { decimals: 0 })} para gastar.` : '';
    };
    f.savingsValue.addEventListener('input', upd);
    f.savingsMode.addEventListener('change', () => {
      const inc = num(d.income); const v = num(f.savingsValue.value);
      if (inc) f.savingsValue.value = String(f.savingsMode.value === 'amount' ? Math.round(inc * v / 100) : Math.round(v / inc * 1000) / 10).replace('.', ',');
      upd();
    });
  }
  // Calcula al vuelo cuánto apartar al mes para cada objetivo, sin redibujar (no se pierde el foco)
  const goalHint = () => {
    collect(f);
    d.goals.forEach((g, i) => {
      const box = el.querySelector(`[data-gm="${i}"]`); if (!box) return;
      const n = num(g.target) - num(g.have); const m = Number(g.n) * (g.u === 'y' ? 12 : 1);
      box.textContent = n > 0 && m > 0 ? `≈ ${money(n / m, d.currency)} al mes durante ${m} meses` : '';
    });
  };
  f.querySelectorAll('[name^=gt],[name^=gh],[name^=gn_],[name^=gu]').forEach((i) => { i.addEventListener('input', goalHint); i.addEventListener('change', goalHint); });
  f.querySelector('[data-restore]')?.addEventListener('change', async (e) => {
    const text = await e.target.files[0]?.text(); if (!text) return;
    const go = async (pin) => {
      try { const data = await readBackup(text, pin); data.settings.onboarded = true; replaceState(data); toast('Copia restaurada', 'ok'); location.hash = '#/inicio'; }
      catch (err) {
        if (err.needPin) sheet('PIN de la copia', html`<form class="form">${field({ name: 'pin', label: 'PIN', type: 'password', inputmode: 'numeric' })}<button class="btn primary block">Abrir</button></form>`, (x, close) => { x.querySelector('form').onsubmit = (ev) => { ev.preventDefault(); const p = x.querySelector('[name=pin]').value; close(); go(p); }; });
        else toast(err.message, 'warn');
      }
    };
    go(null);
  });
}

export const routes = {
  bienvenida: {
    title: 'Bienvenida', bare: true, noTop: true,
    render: () => view(),
    mount: (el) => mount(el),
  },
};
export { getState };
