// Menú «Más», ajustes, copias de seguridad y categorías.
import { html, raw, money, byId, fmtDate, esc, today, num } from '../util.js';
import { base, missingRates, catName, txBase } from '../calc.js';
import * as store from '../store.js';
import { update } from '../store.js';
import { toast, field, select, checkbox, readForm, confirmDlg, sheet, segmented } from '../ui.js';
import { categoryForm } from '../forms.js';
import { CURRENCIES, TAX_BRACKETS_ES } from '../defaults.js';
import { newPin } from './lock.js';
import { accountCard, bindAccountCard } from './account.js';
import { fetchFx } from '../prices.js';
import { currentUser } from '../cloud.js';
const cloudOn = () => !!currentUser();

function mas(s) {
  const L = (href, icon, title, sub) => html`<a class="li" href="${href}"><span class="ic">${icon}</span><span class="tx"><b>${title}</b><small>${sub}</small></span><span class="chev">›</span></a>`;
  return html`
  <div class="list card flush">
    ${L('#/inversiones', '📈', 'Inversiones', 'Fondos, ETF, acciones, cripto, depósitos, pensiones')}
    ${L('#/patrimonio', '🏛️', 'Patrimonio neto', 'Evolución de lo que tienes menos lo que debes')}
    ${L('#/cuentas', '🏦', 'Cuentas', 'Bancos, efectivo, brókers y tarjetas')}
    ${L('#/deudas', '🤝', 'Deudas y compromisos', 'Préstamos, renting, lo que te deben')}
    ${L('#/objetivos', '🎯', 'Objetivos de ahorro', 'Colchón, máster, coche…')}
  </div>
  <div class="list card flush">
    ${L('#/informe', '📊', 'Informe mensual', 'Qué ha ido bien y cómo mejorar')}
    ${L('#/simuladores', '🧪', 'Simuladores', 'Interés compuesto, FIRE, préstamos…')}
    ${L('#/fiscalidad', '🧾', 'Fiscalidad', 'Plusvalías FIFO y estimación de la renta')}
    ${L('#/avisos', '🔔', 'Avisos', 'Presupuestos, recibos, precios, copias')}
  </div>
  <div class="list card flush">
    ${L('#/recurrentes', '🔁', 'Recurrentes', 'Nómina, recibos y aportaciones automáticas')}
    ${L('#/categorias', '🏷️', 'Categorías', 'Personaliza gastos e ingresos')}
    ${L('#/ajustes', '⚙️', 'Ajustes', 'Moneda, mes, PIN, copias, tema')}
  </div>
  <p class="small muted center">Dinerico guarda tus datos en este dispositivo${s.settings.pinEnabled ? ', cifrados con tu PIN' : ''}${cloudOn() ? ' y en tu cuenta' : ''}.</p>`;
}

function ajustes(s) {
  const st = s.settings; const B = base(s);
  const miss = missingRates(s);
  const curs = [...new Set([...s.accounts.map((a) => a.currency), ...s.assets.map((a) => a.currency)])].filter((c) => c && c !== B);
  return html`
  ${accountCard()}
  <section class="card"><h3>💾 Copias de seguridad</h3>
    <p class="small muted">Descarga un archivo con todos tus datos para guardarlo donde quieras. Si no usas cuenta, es la única forma de recuperarlos si borras el navegador o cambias de móvil. Última: <b>${st.lastBackup ? fmtDate(st.lastBackup, true) : 'nunca'}</b>.</p>
    <div class="row gap wrap"><button class="btn primary" data-export>Descargar copia</button><label class="btn">Restaurar copia<input type="file" accept=".json,application/json" hidden data-import></label>
      <button class="btn ghost" data-csv>Exportar movimientos CSV</button></div>
    ${st.pinEnabled ? html`<p class="small muted mt">La copia va cifrada con tu PIN actual: guárdalo, sin él no se puede abrir.</p>` : ''}
    ${field({ name: 'backupEveryDays', label: 'Recordarme hacer copia cada (días)', type: 'number', value: st.backupEveryDays, attrs: 'data-set="backupEveryDays"' })}
  </section>
  <form class="card form" id="gen"><h3>👤 General</h3>
    ${field({ name: 'name', label: 'Tu nombre', value: st.name })}
    ${select({ name: 'currency', label: 'Moneda principal', options: CURRENCIES.map((c) => [c, c]), value: st.currency, hint: 'Todo se convierte a esta moneda para totales e informes.' })}
    <span class="lbl">Tema</span>${segmented('theme', [['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']], st.theme)}
    <h3 class="mt">📅 Cómo se cuenta el mes</h3>
    ${segmented('periodMode', [['calendar', 'Mes natural'], ['payday', 'De nómina a nómina']], st.periodMode)}
    <div id="pd">${field({ name: 'payday', label: 'Día de cobro', type: 'number', value: st.payday, min: 1, max: 31 })}
      ${checkbox({ name: 'paydayWeekendShift', label: 'Si cae en fin de semana, empieza el viernes anterior', checked: !!st.paydayWeekendShift })}</div>
    ${field({ name: 'priceStaleDays', label: 'Avisar si un precio tiene más de (días)', type: 'number', value: st.priceStaleDays })}
    <button class="btn primary block">Guardar</button></form>
  <section class="card"><h3>🔒 Privacidad</h3>
    ${st.pinEnabled ? html`<p class="small">PIN activado. Los datos se guardan cifrados (AES-256).</p>
      <div class="row gap wrap"><button class="btn" data-pin>Cambiar PIN</button><button class="btn ghost danger" data-nopin>Quitar PIN</button></div>
      ${field({ name: 'autoLockMin', label: 'Bloquear tras (minutos en segundo plano)', type: 'number', value: st.autoLockMin, attrs: 'data-set="autoLockMin"' })}`
      : html`<p class="small muted">Protege la app con un PIN y cifra los datos guardados.</p><button class="btn primary" data-pin>Activar PIN</button>`}
    <p class="small muted mt">Si olvidas el PIN no hay forma de recuperar los datos cifrados.</p></section>
  <section class="card"><h3>💱 Tipos de cambio</h3>
    ${curs.length ? html`<p class="small muted">1 ${B} = … · fuente BCE${s.fx.date ? ' · ' + fmtDate(s.fx.date) : ''}. Puedes fijar uno a mano.</p>
      ${curs.map((c) => html`<div class="row between fx"><span>${c}${miss.includes(c) ? ' ⚠️' : ''}</span><small class="muted">${s.fx.rates?.[c] ?? '—'}</small>
        <input data-fx="${c}" data-money inputmode="decimal" placeholder="manual" value="${s.fx.manual?.[c] ? String(s.fx.manual[c]).replace('.', ',') : ''}"></div>`)}
      <button class="btn small mt" data-fxr>↻ Actualizar</button>` : html`<p class="small muted">Todas tus cuentas están en ${B}. Si añades cuentas o activos en otra moneda, aquí verás los tipos.</p>`}</section>
  <section class="card"><h3>📈 Precios automáticos</h3>
    <p class="small muted">Cripto funciona sin clave. Para acciones y ETF, consigue una clave gratuita en alphavantage.co (25 consultas al día).</p>
    ${field({ name: 'av', label: 'Clave de Alpha Vantage', value: st.apiKeys.alphavantage, attrs: 'data-key autocomplete="off"' })}</section>
  <section class="card"><h3>🧾 Tramos fiscales del ahorro</h3>
    <p class="small muted">Por defecto, los de 2026 en territorio común. Cámbialos si vives en País Vasco o Navarra o si cambian.</p>
    <form id="taxf">${st.tax.brackets.map((b, i) => html`<div class="grid2">${field({ name: `u${i}`, label: 'Hasta', type: 'money', value: b.upTo ?? '', placeholder: 'resto' })}${field({ name: `r${i}`, label: 'Tipo %', type: 'money', value: Math.round(b.rate * 1000) / 10 })}</div>`)}
    <div class="row gap"><button class="btn small primary">Guardar tramos</button><button type="button" class="btn small ghost" data-taxreset>Restablecer</button></div></form></section>
  <section class="card"><h3>🧭 Empezar</h3><div class="row gap wrap"><a class="btn" href="#/bienvenida">Repetir el asistente</a><button class="btn ghost danger" data-wipe>Borrar todos los datos</button></div></section>
  <p class="small muted center">Dinerico · datos locales · sin anuncios ni rastreo</p>`;
}

function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
}
function csv(s) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Fecha', 'Tipo', 'Cuenta', 'Hacia', 'Categoría', 'Importe', 'Moneda', `Importe ${base(s)}`, 'Nota']];
  const tl = { expense: 'Gasto', income: 'Ingreso', transfer: 'Traspaso', adjust: 'Ajuste', debtmove: 'Deuda' };
  for (const t of [...s.transactions].sort((a, b) => a.date.localeCompare(b.date))) {
    const a = byId(s.accounts, t.accountId);
    rows.push([t.date, tl[t.type], a?.name, byId(s.accounts, t.toAccountId)?.name || '', t.categoryId ? catName(s, t.categoryId) : '',
      String(t.type === 'expense' ? -t.amount : t.amount).replace('.', ','), a?.currency, String(Math.round(txBase(s, t) * 100) / 100).replace('.', ','), t.note]);
  }
  return '﻿' + rows.map((r) => r.map(q).join(';')).join('\n');
}

function mountAjustes(el, s) {
  bindAccountCard(el, confirmDlg);
  const gen = el.querySelector('#gen');
  const syncPd = () => { el.querySelector('#pd').hidden = gen.querySelector('[name=periodMode]:checked').value !== 'payday'; };
  gen.addEventListener('change', syncPd); syncPd();
  gen.onsubmit = (e) => {
    e.preventDefault(); const v = readForm(gen);
    const curChanged = v.currency !== s.settings.currency;
    update((st) => {
      Object.assign(st.settings, { name: v.name.trim(), currency: v.currency, theme: v.theme, periodMode: v.periodMode, payday: Math.min(31, Math.max(1, Number(v.payday) || 1)), paydayWeekendShift: !!v.paydayWeekendShift, priceStaleDays: Number(v.priceStaleDays) || 7 });
      if (curChanged) { st.fx = { base: v.currency, rates: { [v.currency]: 1 }, date: null, manual: {} }; st.snapshots = []; }
    });
    toast(curChanged ? 'Moneda cambiada: actualizando tipos de cambio…' : 'Ajustes guardados', 'ok');
    if (curChanged) fetchFx(v.currency).then((fx) => update((st) => { st.fx = { ...st.fx, ...fx }; })).catch(() => toast('Sin conexión: fija los tipos a mano', 'warn'));
  };
  el.querySelectorAll('[data-set]').forEach((i) => { i.onchange = () => update((st) => { st.settings[i.dataset.set] = Number(i.value) || st.settings[i.dataset.set]; }); });
  el.querySelector('[data-key]').onchange = (e) => update((st) => { st.settings.apiKeys.alphavantage = e.target.value.trim(); });
  el.querySelectorAll('[data-fx]').forEach((i) => { i.onchange = () => update((st) => { const v = num(i.value); if (v > 0) st.fx.manual[i.dataset.fx] = v; else delete st.fx.manual[i.dataset.fx]; }); });
  el.querySelector('[data-fxr]')?.addEventListener('click', async () => {
    try { const fx = await fetchFx(base(s)); update((st) => { st.fx = { ...st.fx, ...fx }; }); toast('Tipos actualizados', 'ok'); } catch (e) { toast('No se pudo: ' + e.message, 'warn'); }
  });
  el.querySelector('#taxf').onsubmit = (e) => {
    e.preventDefault(); const v = readForm(e.target);
    const br = s.settings.tax.brackets.map((_, i) => ({ upTo: v[`u${i}`] || null, rate: (v[`r${i}`] || 0) / 100 }));
    update((st) => { st.settings.tax.brackets = br; }); toast('Tramos guardados', 'ok');
  };
  el.querySelector('[data-taxreset]').onclick = () => update((st) => { st.settings.tax.brackets = TAX_BRACKETS_ES; });
  el.querySelector('[data-export]').onclick = () => store.exportBackup().then(() => toast('Copia descargada', 'ok'));
  el.querySelector('[data-csv]').onclick = () => download(`dinerico-movimientos-${today()}.csv`, csv(s), 'text/csv');
  el.querySelector('[data-import]').onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const text = await file.text();
    const restore = async (pin) => {
      try {
        const data = await store.readBackup(text, pin);
        if (!(await confirmDlg(`Se sustituirán los datos actuales por la copia (${data.transactions.length} movimientos). ¿Continuar?`, { ok: 'Restaurar', danger: true }))) return;
        store.replaceState(data);
        if (s.settings.pinEnabled && !data.settings.pinEnabled) update((st) => { st.settings.pinEnabled = true; });
        toast('Copia restaurada', 'ok'); location.hash = '#/inicio';
      } catch (err) {
        if (err.needPin) {
          sheet('PIN de la copia', html`<form class="form">${field({ name: 'pin', label: 'PIN con el que se hizo la copia', type: 'password', inputmode: 'numeric' })}<button class="btn primary block">Abrir</button></form>`, (f, close) => {
            f.querySelector('form').onsubmit = (ev) => { ev.preventDefault(); const p = f.querySelector('[name=pin]').value; close(); restore(p); };
          });
        } else toast(err.message, 'warn');
      }
    };
    restore(null); e.target.value = '';
  };
  el.querySelectorAll('[data-pin]').forEach((b) => { b.onclick = async () => { const pin = await newPin(); if (!pin) return; await store.setPin(pin); toast('PIN activado', 'ok'); update(() => {}); }; });
  el.querySelector('[data-nopin]')?.addEventListener('click', async () => {
    if (!(await confirmDlg('Los datos dejarán de estar cifrados. ¿Quitar el PIN?', { ok: 'Quitar', danger: true }))) return;
    await store.setPin(null); toast('PIN quitado'); update(() => {});
  });
  el.querySelector('[data-wipe]').onclick = async () => {
    if (!(await confirmDlg('Se borrarán todos tus datos de este dispositivo. Haz antes una copia si los quieres conservar.', { ok: 'Borrar todo', danger: true }))) return;
    await store.wipe(); location.hash = '#/bienvenida'; location.reload();
  };
}

function categorias(s) {
  const kind = catKind;
  const roots = s.categories.filter((c) => c.kind === kind && !c.parent);
  const used = {}; s.transactions.forEach((t) => { if (t.categoryId) used[t.categoryId] = (used[t.categoryId] || 0) + 1; });
  return html`${segmented('ck', [['expense', 'Gastos'], ['income', 'Ingresos']], kind)}
  <button class="btn primary block mt mb" data-new>+ Nueva categoría</button>
  ${roots.map((r) => html`<section class="card flush"><button class="li" data-cat="${r.id}"><span class="ic">${r.icon}</span><span class="tx"><b>${r.name}</b><small>${r.essential ? 'Esencial · ' : ''}${used[r.id] || 0} movimientos</small></span><span class="chev">✎</span></button>
    ${s.categories.filter((c) => c.parent === r.id).map((c) => html`<button class="li sub" data-cat="${c.id}"><span class="tx"><b>${c.name}</b><small>${used[c.id] || 0} movimientos</small></span><span class="chev">✎</span></button>`)}
    <button class="li sub add" data-addsub="${r.id}"><span class="tx"><small>+ Subcategoría</small></span></button></section>`)}`;
}
let catKind = 'expense';

export const routes = {
  mas: { title: 'Más', render: mas },
  ajustes: { title: 'Ajustes', back: '#/mas', render: ajustes, mount: mountAjustes },
  categorias: { title: 'Categorías', back: '#/mas', render: categorias, mount: (el, s) => {
    el.querySelectorAll('[name=ck]').forEach((r) => { r.onchange = () => { catKind = r.value; update(() => {}); }; });
    el.querySelector('[data-new]').onclick = () => categoryForm(null, { kind: catKind });
    el.querySelectorAll('[data-cat]').forEach((b) => { b.onclick = () => categoryForm(byId(s.categories, b.dataset.cat)); });
    el.querySelectorAll('[data-addsub]').forEach((b) => { b.onclick = () => categoryForm(null, { kind: catKind, parent: b.dataset.addsub, icon: byId(s.categories, b.dataset.addsub).icon }); });
  } },
};
export { esc, raw, money };
