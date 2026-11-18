// Formularios compartidos (en hojas inferiores): movimientos, cuentas, recurrentes,
// objetivos, deudas, activos, operaciones y categorías.
import { html, raw, esc, uid, today, num, round2, byId, money, sum, daysBetween, addMonths } from './util.js';
import { sheet, field, select, checkbox, segmented, readForm, toast, confirmDlg } from './ui.js';
import { getState, update } from './store.js';
import { ACCOUNT_TYPES, ASSET_KINDS, DEBT_TYPES, CURRENCIES } from './defaults.js';
import { catName, rate, base, toBase, fromBase, balance, balanceBase, nextDate } from './calc.js';
import { searchCrypto, searchSymbol, fetchQuote, fetchCrypto } from './prices.js';

const S = () => getState();

// ---------- Opciones comunes ----------
export function accountOptions(s, { includeNone = false, filter = () => true } = {}) {
  const o = s.accounts.filter((a) => !a.archived && filter(a)).map((a) => ({ value: a.id, label: `${ACCOUNT_TYPES[a.type]?.icon || ''} ${a.name}${a.currency !== base(s) ? ' (' + a.currency + ')' : ''}` }));
  return includeNone ? [{ value: '', label: '— Ninguna —' }, ...o] : o;
}
export function categoryOptions(s, kind, placeholder = false) {
  const roots = s.categories.filter((c) => c.kind === kind && !c.parent);
  const out = placeholder ? [{ value: '', label: '— Elige categoría —' }] : [];
  for (const r of roots) {
    out.push({ value: r.id, label: `${r.icon} ${r.name} (general)`, group: r.name });
    s.categories.filter((c) => c.parent === r.id).forEach((c) => out.push({ value: c.id, label: c.name, group: r.name }));
  }
  return out;
}
const currencyOptions = (cur) => [...new Set([cur, ...CURRENCIES])].filter(Boolean).map((c) => [c, c]);

function topCategories(s, kind, n = 8) {
  const counts = {};
  s.transactions.slice(-300).forEach((t) => { if (t.type === kind && t.categoryId) counts[t.categoryId] = (counts[t.categoryId] || 0) + 1; });
  const ids = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([id]) => id).filter((id) => byId(s.categories, id));
  const roots = s.categories.filter((c) => c.kind === kind && !c.parent).map((c) => c.id);
  return [...new Set([...ids, ...roots])].slice(0, n).map((id) => byId(s.categories, id));
}

// ======================= Movimiento =======================
export function txForm(tx = null, preset = {}) {
  const s = S();
  if (!s.accounts.length) { toast('Primero crea una cuenta'); location.hash = '#/cuentas'; return; }
  const t = tx || { type: 'expense', date: today(), accountId: s.settings.lastAccount || s.accounts.find((a) => !a.archived)?.id, ...preset };
  const isEdit = !!tx;
  const body = html`<form class="form" id="txf">
    ${segmented('type', [['expense', 'Gasto'], ['income', 'Ingreso'], ['transfer', 'Traspaso'], ['adjust', 'Ajuste']], t.type)}
    <label class="amount-big"><input name="amount" data-money inputmode="decimal" autocomplete="off" placeholder="0,00"
      value="${t.amount != null ? String(Math.abs(t.amount)).replace('.', ',') : ''}" required data-noautofocus><span class="cur" id="txcur"></span></label>
    <div data-show="expense income" class="chips" id="catchips"></div>
    <div data-show="expense">${select({ name: 'catE', label: 'Categoría', options: categoryOptions(s, 'expense', true), value: t.type === 'expense' ? t.categoryId : '' })}</div>
    <div data-show="income">${select({ name: 'catI', label: 'Categoría', options: categoryOptions(s, 'income', true), value: t.type === 'income' ? t.categoryId : '' })}</div>
    <div class="grid2">
      ${select({ name: 'accountId', label: 'Cuenta', options: accountOptions(s), value: t.accountId })}
      ${field({ name: 'date', label: 'Fecha', type: 'date', value: t.date, required: true })}
    </div>
    <div data-show="transfer">
      ${select({ name: 'toAccountId', label: 'Hacia la cuenta', options: accountOptions(s), value: t.toAccountId || s.accounts.find((a) => a.id !== t.accountId && !a.archived)?.id })}
      <div id="toamt">${field({ name: 'toAmount', label: 'Importe recibido (otra divisa)', type: 'money', value: t.toAmount ?? '' , hint: 'Déjalo vacío para usar el tipo de cambio actual.' })}</div>
    </div>
    <div data-show="adjust"><p class="muted small">Corrige el saldo sin contar como gasto ni ingreso. Indica el importe con signo (−20 resta).</p>
      ${checkbox({ name: 'neg', label: 'Restar (ajuste negativo)', checked: t.type === 'adjust' && t.amount < 0 })}</div>
    ${field({ name: 'note', label: 'Nota', value: t.note || '', placeholder: 'Opcional' })}
    <div data-show="income">${field({ name: 'withholding', label: 'Retención (intereses/dividendos)', type: 'money', value: t.withholding ?? '', hint: 'Solo para la estimación fiscal. El importe de arriba es el neto cobrado.' })}</div>
    <div class="row gap end mt">
      ${isEdit ? html`<button type="button" class="btn danger ghost" data-del>Eliminar</button><span class="flex"></span>` : ''}
      ${!isEdit ? html`<button type="button" class="btn ghost" data-again>Guardar y otro</button>` : ''}
      <button class="btn primary">${isEdit ? 'Guardar' : 'Añadir'}</button></div>
  </form>`;
  sheet(isEdit ? 'Editar movimiento' : 'Nuevo movimiento', body, (el, close) => {
    const f = el.querySelector('#txf');
    const sync = () => {
      const type = f.querySelector('[name=type]:checked').value;
      el.querySelectorAll('[data-show]').forEach((d) => { d.hidden = !d.dataset.show.split(' ').includes(type); });
      const acc = byId(s.accounts, f.accountId.value);
      el.querySelector('#txcur').textContent = acc?.currency || base(s);
      const to = byId(s.accounts, f.toAccountId.value);
      el.querySelector('#toamt').hidden = !(type === 'transfer' && to && acc && to.currency !== acc.currency);
      // chips
      const chips = el.querySelector('#catchips');
      if (type === 'expense' || type === 'income') {
        const sel = type === 'expense' ? f.catE : f.catI;
        chips.innerHTML = topCategories(s, type).map((c) => `<button type="button" class="chip ${sel.value === c.id ? 'on' : ''}" data-cat="${c.id}">${esc(c.icon)} ${esc(c.name)}</button>`).join('');
        chips.querySelectorAll('[data-cat]').forEach((b) => { b.onclick = () => { sel.value = b.dataset.cat; sync(); }; });
      }
    };
    f.addEventListener('change', sync); sync();
    setTimeout(() => f.amount.focus(), 260);
    const save = (again) => {
      const v = readForm(f);
      const amount = round2(Math.abs(v.amount || 0));
      if (!amount) { toast('Indica un importe'); return; }
      const rec = { ...(tx || {}), id: tx?.id || uid(), type: v.type, date: v.date || today(), accountId: v.accountId, note: v.note?.trim() || '', amount };
      delete rec.toAccountId; delete rec.toAmount; delete rec.categoryId; delete rec.withholding;
      if ((v.type === 'expense' && !v.catE) || (v.type === 'income' && !v.catI)) { toast('Elige una categoría'); return; }
      if (v.type === 'expense') rec.categoryId = v.catE;
      if (v.type === 'income') { rec.categoryId = v.catI; if (v.withholding) rec.withholding = round2(v.withholding); }
      if (v.type === 'transfer') {
        if (v.toAccountId === v.accountId) { toast('Elige otra cuenta de destino'); return; }
        rec.toAccountId = v.toAccountId;
        const a = byId(s.accounts, v.accountId), b = byId(s.accounts, v.toAccountId);
        if (a.currency !== b.currency) rec.toAmount = v.toAmount ? round2(v.toAmount) : round2(fromBase(s, toBase(s, amount, a.currency), b.currency));
      }
      if (v.type === 'adjust') rec.amount = v.neg ? -amount : amount;
      update((st) => {
        const i = st.transactions.findIndex((x) => x.id === rec.id);
        if (i >= 0) st.transactions[i] = rec; else st.transactions.push(rec);
        st.settings.lastAccount = rec.accountId;
      });
      toast(isEdit ? 'Movimiento guardado' : 'Movimiento añadido', 'ok');
      if (again) { f.amount.value = ''; f.note.value = ''; f.amount.focus(); } else close();
    };
    f.onsubmit = (e) => { e.preventDefault(); save(false); };
    el.querySelector('[data-again]')?.addEventListener('click', () => save(true));
    el.querySelector('[data-del]')?.addEventListener('click', async () => {
      if (!(await confirmDlg('¿Eliminar este movimiento?', { ok: 'Eliminar', danger: true }))) return;
      update((st) => { st.transactions = st.transactions.filter((x) => x.id !== tx.id); });
      close(); toast('Eliminado');
    });
  });
}

// ======================= Cuenta =======================
export function accountForm(acc = null) {
  const s = S();
  const a = acc || { type: 'bank', currency: base(s), initial: 0 };
  const body = html`<form class="form">
    ${field({ name: 'name', label: 'Nombre', value: a.name || '', placeholder: 'Ej.: Revolut, Imagin, efectivo…', required: true })}
    <div class="grid2">
      ${select({ name: 'type', label: 'Tipo', options: Object.entries(ACCOUNT_TYPES).map(([k, v]) => [k, `${v.icon} ${v.label}`]), value: a.type })}
      ${select({ name: 'currency', label: 'Moneda', options: currencyOptions(a.currency), value: a.currency })}
    </div>
    ${field({ name: 'initial', label: acc ? 'Saldo inicial' : 'Saldo actual', type: 'money', value: a.initial ?? 0, hint: acc ? 'Saldo de partida; el actual se calcula con los movimientos.' : 'Lo que hay hoy en la cuenta.' })}
    ${field({ name: 'interest', label: 'Interés anual (TAE %)', type: 'money', value: a.interest ? a.interest * 100 : '', hint: 'Opcional: cuentas remuneradas. Muestra el interés estimado.' })}
    ${field({ name: 'note', label: 'Nota', value: a.note || '' })}
    ${acc ? checkbox({ name: 'archived', label: 'Archivar (ocultar y excluir del patrimonio)', checked: !!a.archived }) : ''}
    <div class="row gap end mt">${acc ? html`<button type="button" class="btn danger ghost" data-del>Eliminar</button><span class="flex"></span>` : ''}<button class="btn primary">Guardar</button></div>
  </form>`;
  sheet(acc ? 'Editar cuenta' : 'Nueva cuenta', body, (el, close) => {
    const f = el.querySelector('form');
    f.onsubmit = (e) => {
      e.preventDefault(); const v = readForm(f);
      const rec = { ...(acc || {}), id: acc?.id || uid(), name: v.name.trim(), type: v.type, currency: v.currency, initial: round2(v.initial || 0), interest: v.interest ? v.interest / 100 : 0, note: v.note, archived: !!v.archived };
      update((st) => { const i = st.accounts.findIndex((x) => x.id === rec.id); if (i >= 0) st.accounts[i] = rec; else st.accounts.push(rec); });
      close(); toast('Cuenta guardada', 'ok');
    };
    el.querySelector('[data-del]')?.addEventListener('click', async () => {
      const used = s.transactions.some((t) => t.accountId === acc.id || t.toAccountId === acc.id) || s.trades.some((t) => t.cashAccountId === acc.id);
      if (used) { toast('Tiene movimientos: archívala en lugar de eliminarla'); return; }
      if (!(await confirmDlg(`¿Eliminar ${acc.name}?`, { ok: 'Eliminar', danger: true }))) return;
      update((st) => { st.accounts = st.accounts.filter((x) => x.id !== acc.id); }); close();
    });
  });
}

// ======================= Recurrente =======================
export function recurringForm(rec = null, preset = {}) {
  const s = S();
  if (!s.accounts.length) { toast('Primero crea una cuenta'); return; }
  const r = rec || { type: 'expense', freq: 'monthly', mode: 'auto', active: true, next: today(), accountId: s.accounts[0].id, ...preset };
  const body = html`<form class="form">
    ${field({ name: 'name', label: 'Nombre', value: r.name || '', placeholder: 'Ej.: Nómina, Spotify, aportación a casa', required: true })}
    ${segmented('type', [['expense', 'Gasto'], ['income', 'Ingreso'], ['transfer', 'Traspaso'], ['invest', 'Aportación']], r.type)}
    ${field({ name: 'amount', label: 'Importe', type: 'money', value: r.amount ?? '', required: true })}
    <div data-show="expense">${select({ name: 'catE', label: 'Categoría', options: categoryOptions(s, 'expense'), value: r.categoryId })}</div>
    <div data-show="income">${select({ name: 'catI', label: 'Categoría', options: categoryOptions(s, 'income'), value: r.categoryId })}</div>
    ${select({ name: 'accountId', label: 'Cuenta', options: accountOptions(s), value: r.accountId })}
    <div data-show="transfer">${select({ name: 'toAccountId', label: 'Hacia', options: accountOptions(s), value: r.toAccountId })}</div>
    <div data-show="invest">${select({ name: 'assetId', label: 'Activo', options: s.assets.filter((a) => !a.closed).map((a) => [a.id, a.name]), value: r.assetId, hint: 'Compra periódica: las participaciones se calculan con el último precio y puedes corregirlas.' })}</div>
    <div class="grid2">
      ${select({ name: 'freq', label: 'Frecuencia', options: [['monthly', 'Mensual'], ['weekly', 'Semanal'], ['biweekly', 'Quincenal'], ['quarterly', 'Trimestral'], ['yearly', 'Anual']], value: r.freq })}
      ${field({ name: 'next', label: 'Próxima fecha', type: 'date', value: r.next, required: true })}
    </div>
    ${field({ name: 'end', label: 'Fecha de fin (opcional)', type: 'date', value: r.end || '' })}
    ${select({ name: 'mode', label: 'Al llegar la fecha', options: [['auto', 'Apuntarlo automáticamente'], ['confirm', 'Pedirme confirmación (importe variable)']], value: r.mode })}
    ${s.debts.length ? select({ name: 'debtId', label: 'Vincular a deuda', options: [['', '— Ninguna —'], ...s.debts.map((d) => [d.id, d.name])], value: r.debtId || '' }) : ''}
    ${rec ? checkbox({ name: 'active', label: 'Activo', checked: r.active }) : ''}
    <div class="row gap end mt">${rec ? html`<button type="button" class="btn danger ghost" data-del>Eliminar</button><span class="flex"></span>` : ''}<button class="btn primary">Guardar</button></div>
  </form>`;
  sheet(rec ? 'Editar recurrente' : 'Nuevo recurrente', body, (el, close) => {
    const f = el.querySelector('form');
    const sync = () => { const type = f.querySelector('[name=type]:checked').value; el.querySelectorAll('[data-show]').forEach((d) => { d.hidden = d.dataset.show !== type; }); };
    f.addEventListener('change', sync); sync();
    f.onsubmit = (e) => {
      e.preventDefault(); const v = readForm(f);
      if (v.type === 'invest' && !v.assetId) { toast('Crea antes el activo en Inversiones'); return; }
      const day = Number(v.next.slice(8, 10));
      const out = { ...(rec || {}), id: rec?.id || uid(), name: v.name.trim(), type: v.type, amount: round2(v.amount || 0), accountId: v.accountId, freq: v.freq, next: v.next, day, end: v.end || null, mode: v.mode, active: rec ? !!v.active : true, debtId: v.debtId || null };
      out.categoryId = v.type === 'expense' ? v.catE : v.type === 'income' ? v.catI : null;
      out.toAccountId = v.type === 'transfer' ? v.toAccountId : null;
      out.assetId = v.type === 'invest' ? v.assetId : null;
      update((st) => { const i = st.recurring.findIndex((x) => x.id === out.id); if (i >= 0) st.recurring[i] = out; else st.recurring.push(out); });
      close(); toast('Recurrente guardado', 'ok');
    };
    el.querySelector('[data-del]')?.addEventListener('click', async () => {
      if (!(await confirmDlg('¿Eliminar este recurrente? Los movimientos ya creados se mantienen.', { ok: 'Eliminar', danger: true }))) return;
      update((st) => { st.recurring = st.recurring.filter((x) => x.id !== rec.id); }); close();
    });
  });
}

/** Crea el movimiento u operación de una ocurrencia de recurrente y avanza la fecha. */
export function materialize(st, r, date, amountOverride = null) {
  const amount = round2(amountOverride ?? r.amount);
  if (r.type === 'invest') {
    const a = byId(st.assets, r.assetId);
    if (a) {
      const acc = byId(st.accounts, r.accountId);
      const assetAmt = acc && acc.currency !== a.currency ? fromBase(st, toBase(st, amount, acc.currency), a.currency) : amount;
      const unit = ASSET_KINDS[a.kind]?.unit;
      const price = unit ? Number(a.price) || 0 : 1;
      st.trades.push({ id: uid(), seq: Date.now(), assetId: a.id, date, type: 'buy', qty: unit ? (price ? round6(assetAmt / price) : 0) : round2(assetAmt), price: unit ? price : 1, fee: 0, cashAccountId: r.accountId, cashAmount: amount, recurringId: r.id, estimated: unit });
    }
  } else {
    const t = { id: uid(), type: r.type, date, amount, accountId: r.accountId, note: r.name, recurringId: r.id };
    if (r.categoryId) t.categoryId = r.categoryId;
    if (r.type === 'transfer') {
      t.toAccountId = r.toAccountId;
      const a = byId(st.accounts, r.accountId), b = byId(st.accounts, r.toAccountId);
      if (a && b && a.currency !== b.currency) t.toAmount = round2(fromBase(st, toBase(st, amount, a.currency), b.currency));
    }
    if (r.debtId) t.debtId = r.debtId;
    st.transactions.push(t);
  }
  const rr = byId(st.recurring, r.id);
  if (rr) rr.next = nextDate(rr, date);
}
const round6 = (n) => Math.round(n * 1e6) / 1e6;

// ======================= Objetivo =======================
export function goalForm(goal = null) {
  const s = S();
  const g = goal || { icon: '🎯', priority: 3, kind: 'normal' };
  const body = html`<form class="form">
    <div class="grid-icon">${field({ name: 'icon', label: 'Icono', value: g.icon, attrs: 'maxlength="4"' })}
      ${field({ name: 'name', label: 'Nombre', value: g.name || '', placeholder: 'Ej.: Máster, coche, viaje…', required: true })}</div>
    ${g.kind === 'emergency' ? checkbox({ name: 'autoTarget', label: 'Calcular la meta automáticamente (meses de gastos esenciales)', checked: g.autoTarget !== false }) : ''}
    <div data-manual>${field({ name: 'target', label: 'Cuánto necesitas', type: 'money', value: g.target ?? '' })}</div>
    <span class="lbl">¿Para cuándo?</span>
    <div class="unit"><input name="plazo" type="number" min="1" inputmode="numeric" placeholder="Sin fecha" value="${g.targetDate ? Math.max(1, Math.round(daysBetween(today(), g.targetDate) / 30.44)) : ''}">
      <select name="plazoU"><option value="m">meses</option><option value="y">años</option></select></div>
    ${field({ name: 'targetDate', label: 'o elige la fecha exacta', type: 'date', value: g.targetDate || '' })}
    <p class="small muted" id="gneed"></p>
    ${field({ name: 'monthly', label: 'Aportación mensual fija (opcional)', type: 'money', value: g.monthly || '', hint: 'Si la pones, el reparto usará esta cantidad en lugar de calcularla con la fecha.' })}
    ${select({ name: 'priority', label: 'Prioridad', options: [[1, '1 · Máxima'], [2, '2 · Alta'], [3, '3 · Media'], [4, '4 · Baja'], [5, '5 · Cuando se pueda']], value: g.priority })}
    ${select({ name: 'accountId', label: 'Dinero guardado en', options: accountOptions(s, { includeNone: true }), value: g.accountId || '', hint: 'Si eliges una cuenta, lo ahorrado es su saldo. Si no, apuntas aportaciones a mano.' })}
    <div id="initwrap">${field({ name: 'initial', label: 'Ya ahorrado', type: 'money', value: g.initial ?? 0 })}</div>
    <div class="row gap end mt">${goal ? html`<button type="button" class="btn danger ghost" data-del>Eliminar</button><span class="flex"></span>` : ''}<button class="btn primary">Guardar</button></div>
  </form>`;
  sheet(goal ? 'Editar objetivo' : 'Nuevo objetivo', body, (el, close) => {
    const f = el.querySelector('form');
    const need = () => {
      const t = num(f.target?.value); const saved = f.accountId.value ? balanceBase(s, f.accountId.value) : num(f.initial.value);
      const m = f.targetDate.value ? Math.max(1, Math.round(daysBetween(today(), f.targetDate.value) / 30.44)) : 0;
      el.querySelector('#gneed').textContent = t && m ? `Necesitas apartar ${money(Math.max(0, t - saved) / m, base(s))} al mes durante ${m} meses.` : '';
    };
    const sync = () => { el.querySelector('#initwrap').hidden = !!f.accountId.value; need(); };
    const fromPlazo = () => {
      const n = Number(f.plazo.value); if (!n) { f.targetDate.value = ''; need(); return; }
      f.targetDate.value = addMonths(today(), f.plazoU.value === 'y' ? n * 12 : n); need();
    };
    f.plazo.addEventListener('input', fromPlazo); f.plazoU.addEventListener('change', fromPlazo);
    f.targetDate.addEventListener('change', () => { f.plazoU.value = 'm'; f.plazo.value = f.targetDate.value ? Math.max(1, Math.round(daysBetween(today(), f.targetDate.value) / 30.44)) : ''; need(); });
    f.addEventListener('input', need);
    if (g.kind === 'emergency') { const tw = el.querySelector('[data-manual]'); const auto = f.autoTarget; const st2 = () => { tw.hidden = auto.checked; }; auto.addEventListener('change', st2); st2(); }
    f.addEventListener('change', sync); sync();
    f.onsubmit = (e) => {
      e.preventDefault(); const v = readForm(f);
      const out = { contributions: [], createdAt: new Date().toISOString(), ...(goal || {}), id: goal?.id || uid(), icon: v.icon || '🎯', name: v.name.trim(), target: round2(v.target || 0), targetDate: v.targetDate || null, monthly: round2(v.monthly || 0) || null, priority: Number(v.priority), accountId: v.accountId || null, initial: round2(v.initial || 0), kind: g.kind };
      if (g.kind === 'emergency') out.autoTarget = !!v.autoTarget;
      update((st) => { const i = st.goals.findIndex((x) => x.id === out.id); if (i >= 0) st.goals[i] = out; else st.goals.push(out); });
      close(); toast('Objetivo guardado', 'ok');
    };
    el.querySelector('[data-del]')?.addEventListener('click', async () => {
      if (!(await confirmDlg(`¿Eliminar ${goal.name}?`, { ok: 'Eliminar', danger: true }))) return;
      update((st) => { st.goals = st.goals.filter((x) => x.id !== goal.id); }); close();
    });
  });
}
export function contributionForm(goal) {
  sheet(`Aportar a ${goal.name}`, html`<form class="form">
    ${segmented('dir', [['in', 'Aportar'], ['out', 'Retirar']], 'in')}
    ${field({ name: 'amount', label: 'Importe', type: 'money', required: true })}
    ${field({ name: 'date', label: 'Fecha', type: 'date', value: today() })}
    <button class="btn primary block">Guardar</button></form>`, (el, close) => {
    el.querySelector('form').onsubmit = (e) => {
      e.preventDefault(); const v = readForm(e.target);
      const amt = round2((v.amount || 0) * (v.dir === 'out' ? -1 : 1));
      update((st) => { const g = byId(st.goals, goal.id); (g.contributions ||= []).push({ id: uid(), date: v.date, amount: amt }); });
      close(); toast('Aportación guardada', 'ok');
    };
  });
}

// ======================= Deuda =======================
export function debtForm(debt = null) {
  const s = S();
  const d = debt || { type: 'loan', direction: 'owe', startDate: today(), rate: 0 };
  const body = html`<form class="form">
    ${field({ name: 'name', label: 'Nombre', value: d.name || '', placeholder: 'Ej.: Renting Mazda, préstamo coche, Pablo me debe…', required: true })}
    <div class="grid2">${select({ name: 'type', label: 'Tipo', options: Object.entries(DEBT_TYPES).map(([k, v]) => [k, `${v.icon} ${v.label}`]), value: d.type })}
      <div data-show="personal">${select({ name: 'direction', label: 'Dirección', options: [['owe', 'Yo debo'], ['owed', 'Me deben']], value: d.direction })}</div></div>
    <div data-show="personal">${field({ name: 'counterparty', label: 'Persona', value: d.counterparty || '' })}</div>
    ${field({ name: 'principal', label: 'Importe inicial / capital', type: 'money', value: d.principal ?? '', hint: 'En renting no hace falta: se calcula el compromiso pendiente con la cuota y los meses.' })}
    <div class="grid2" data-hide="personal">${field({ name: 'rate', label: 'Interés anual (TIN %)', type: 'money', value: d.rate ? d.rate * 100 : '' })}
      ${field({ name: 'payment', label: 'Cuota mensual', type: 'money', value: d.payment ?? '' })}</div>
    <div class="grid2">${field({ name: 'startDate', label: 'Fecha de inicio', type: 'date', value: d.startDate })}
      <div data-hide="personal">${field({ name: 'termMonths', label: 'Plazo (meses)', type: 'number', value: d.termMonths ?? '' })}</div></div>
    <div data-hide="personal renting"><details><summary>Corregir saldo pendiente</summary>
      <div class="grid2">${field({ name: 'mbAmount', label: 'Pendiente a fecha', type: 'money', value: d.manualBalance?.amount ?? '' })}
      ${field({ name: 'mbDate', label: 'Fecha', type: 'date', value: d.manualBalance?.date || '' })}</div>
      <small class="muted">Útil si ya llevabas tiempo pagando: el banco te dice cuánto queda.</small></details></div>
    ${!debt ? html`<div data-hide="personal renting">${checkbox({ name: 'mkRec', label: 'Crear la cuota como gasto recurrente mensual', checked: true })}</div>
      <div data-show="personal">${checkbox({ name: 'mkMove', label: 'Registrar el movimiento de dinero en una cuenta', checked: false })}
      ${select({ name: 'moveAcc', label: 'Cuenta', options: accountOptions(s), value: s.accounts[0]?.id })}</div>` : ''}
    ${debt ? checkbox({ name: 'closed', label: 'Saldada / cerrada', checked: !!d.closed }) : ''}
    <div class="row gap end mt">${debt ? html`<button type="button" class="btn danger ghost" data-del>Eliminar</button><span class="flex"></span>` : ''}<button class="btn primary">Guardar</button></div>
  </form>`;
  sheet(debt ? 'Editar deuda' : 'Nueva deuda o compromiso', body, (el, close) => {
    const f = el.querySelector('form');
    const sync = () => {
      const t = f.type.value;
      el.querySelectorAll('[data-show]').forEach((x) => { x.hidden = !x.dataset.show.split(' ').includes(t); });
      el.querySelectorAll('[data-hide]').forEach((x) => { x.hidden = x.dataset.hide.split(' ').includes(t); });
    };
    f.addEventListener('change', sync); sync();
    f.onsubmit = (e) => {
      e.preventDefault(); const v = readForm(f);
      const out = { ...(debt || {}), id: debt?.id || uid(), name: v.name.trim(), type: v.type, direction: v.type === 'personal' ? v.direction : 'owe', counterparty: v.counterparty || '', principal: round2(v.principal || 0), rate: (v.rate || 0) / 100, payment: round2(v.payment || 0), startDate: v.startDate, termMonths: Number(v.termMonths) || null, closed: !!v.closed };
      out.manualBalance = v.mbAmount != null && v.mbDate ? { amount: round2(v.mbAmount), date: v.mbDate } : null;
      update((st) => {
        const i = st.debts.findIndex((x) => x.id === out.id); if (i >= 0) st.debts[i] = out; else st.debts.push(out);
        if (!debt && v.mkRec && out.type !== 'personal' && out.payment > 0 && st.accounts.length) {
          const fin = st.categories.find((c) => /renting|cuota coche/i.test(c.name) && out.type === 'renting') || st.categories.find((c) => /intereses de deuda/i.test(c.name));
          st.recurring.push({ id: uid(), name: out.name, type: 'expense', amount: out.payment, accountId: st.accounts[0].id, categoryId: fin?.id, freq: 'monthly', next: nextDue(out.startDate), day: Number(out.startDate.slice(8, 10)), mode: 'auto', active: true, debtId: out.id, end: null });
        }
        if (!debt && v.mkMove && out.type === 'personal' && out.principal > 0) {
          st.transactions.push({ id: uid(), type: 'debtmove', opening: true, date: out.startDate, amount: out.direction === 'owed' ? -out.principal : out.principal, accountId: v.moveAcc, debtId: out.id, note: out.name });
        }
      });
      close(); toast('Guardado', 'ok');
    };
    el.querySelector('[data-del]')?.addEventListener('click', async () => {
      if (!(await confirmDlg(`¿Eliminar ${debt.name}? Los movimientos vinculados se mantienen.`, { ok: 'Eliminar', danger: true }))) return;
      update((st) => { st.debts = st.debts.filter((x) => x.id !== debt.id); st.transactions.forEach((t) => { if (t.debtId === debt.id) delete t.debtId; }); }); close();
    });
  });
}
function nextDue(start) { let d = start; let g = 0; while (d < today() && g++ < 600) d = nextDate({ freq: 'monthly', day: Number(start.slice(8, 10)) }, d); return d; }

export function debtPaymentForm(d) {
  const s = S();
  const personal = d.type === 'personal';
  sheet(`Movimiento · ${d.name}`, html`<form class="form">
    ${personal ? segmented('dir', d.direction === 'owed' ? [['in', 'Me devuelven'], ['out', 'Le presto más']] : [['out', 'Devuelvo'], ['in', 'Me presta más']], d.direction === 'owed' ? 'in' : 'out') : ''}
    ${field({ name: 'amount', label: personal ? 'Importe' : 'Pago (cuota o amortización)', type: 'money', value: personal ? '' : d.payment || '', required: true })}
    <div class="grid2">${select({ name: 'accountId', label: 'Cuenta', options: accountOptions(s), value: s.settings.lastAccount })}
      ${field({ name: 'date', label: 'Fecha', type: 'date', value: today() })}</div>
    <button class="btn primary block">Guardar</button></form>`, (el, close) => {
    el.querySelector('form').onsubmit = (e) => {
      e.preventDefault(); const v = readForm(e.target); const amt = round2(v.amount || 0);
      update((st) => {
        if (personal) st.transactions.push({ id: uid(), type: 'debtmove', date: v.date, amount: v.dir === 'in' ? amt : -amt, accountId: v.accountId, debtId: d.id, note: d.name });
        else {
          const cat = st.categories.find((c) => /intereses de deuda/i.test(c.name));
          st.transactions.push({ id: uid(), type: 'expense', date: v.date, amount: amt, accountId: v.accountId, debtId: d.id, categoryId: cat?.id, note: `Pago ${d.name}` });
        }
      });
      close(); toast('Guardado', 'ok');
    };
  });
}

// ======================= Activo =======================
export function assetForm(asset = null) {
  const s = S();
  const a = asset || { kind: 'fund', currency: base(s), source: 'manual' };
  const body = html`<form class="form">
    ${select({ name: 'kind', label: 'Tipo', options: Object.entries(ASSET_KINDS).map(([k, v]) => [k, `${v.icon} ${v.label}`]), value: a.kind })}
    ${field({ name: 'name', label: 'Nombre', value: a.name || '', placeholder: 'Ej.: Fidelity MSCI World, Bitcoin, Apple…', required: true })}
    <div class="grid2" data-unit>${field({ name: 'isin', label: 'ISIN / ticker', value: a.isin || '', placeholder: 'IE00BYX5NX33' })}
      ${select({ name: 'currency', label: 'Moneda de cotización', options: currencyOptions(a.currency), value: a.currency })}</div>
    <div data-unit>${select({ name: 'source', label: 'Precio', options: [['manual', 'Manual'], ['coingecko', 'Automático · CoinGecko (cripto)'], ['alphavantage', 'Automático · Alpha Vantage (acciones/ETF, requiere clave)']], value: a.source })}
      <div data-src="coingecko alphavantage" class="row gap">${field({ name: 'sourceId', label: 'Identificador en la fuente', value: a.sourceId || '', placeholder: 'bitcoin · AAPL · VWCE.DEX' })}<button type="button" class="btn ghost" data-search>Buscar</button></div>
      <div id="sres"></div>
      ${field({ name: 'price', label: 'Precio actual por participación', type: 'money', value: a.price ?? '' })}</div>
    <div data-kind="deposit"><div class="grid2">${field({ name: 'rate', label: 'TAE %', type: 'money', value: a.rate ? a.rate * 100 : '' })}
      ${field({ name: 'startDate', label: 'Inicio', type: 'date', value: a.startDate || today() })}</div>
      ${field({ name: 'maturity', label: 'Vencimiento', type: 'date', value: a.maturity || '' })}</div>
    ${field({ name: 'entity', label: 'Bróker / entidad', value: byId(s.accounts, a.accountId)?.name || '', placeholder: 'P. ej. MyInvestor', attrs: 'list="brokerlist" autocomplete="off"', hint: 'Escríbela o elígela. Si no la tienes como cuenta, se crea sola con saldo 0.' })}
    <datalist id="brokerlist">${[...new Set([...s.accounts.filter((x) => !x.archived).map((x) => x.name), 'MyInvestor', 'Trade Republic', 'Indexa Capital', 'DEGIRO', 'Interactive Brokers', 'XTB', 'eToro', 'Revolut', 'Binance', 'Coinbase', 'Bit2Me'])].map((n) => html`<option value="${n}"></option>`)}</datalist>
    <div data-unit>${field({ name: 'washDays', label: 'Ventana anti-recompra (días)', type: 'number', value: a.washDays ?? '', hint: 'Por defecto: 61 días en acciones/ETF cotizados en la UE, 365 en fondos no cotizados. Ajústalo si tu caso es otro.' })}</div>
    ${!asset ? html`<div class="card soft"><b>Posición inicial (opcional)</b><p class="small muted">Si ya tienes este activo, indica lo que hay hoy. Para la fiscalidad exacta es mejor apuntar cada compra con su fecha.</p>
      <div class="grid2" data-unit>${field({ name: 'iCost', label: 'Total que metiste', type: 'money' })}${field({ name: 'iQty', label: 'Participaciones (si las sabes)', type: 'money' })}</div>
      <div data-nounit>${field({ name: 'iAmount', label: 'Importe aportado', type: 'money' })}${field({ name: 'iValue', label: 'Valor actual', type: 'money' })}</div>
      ${field({ name: 'iDate', label: 'Fecha de compra (aprox.)', type: 'date', value: today() })}</div>` : ''}
    ${asset ? checkbox({ name: 'closed', label: 'Cerrado (vendido por completo)', checked: !!a.closed }) : ''}
    <div class="row gap end mt">${asset ? html`<button type="button" class="btn danger ghost" data-del>Eliminar</button><span class="flex"></span>` : ''}<button class="btn primary">Guardar</button></div>
  </form>`;
  sheet(asset ? 'Editar activo' : 'Nuevo activo', body, (el, close) => {
    const f = el.querySelector('form');
    const sync = () => {
      const unit = ASSET_KINDS[f.kind.value]?.unit;
      el.querySelectorAll('[data-unit]').forEach((x) => { x.hidden = !unit; });
      el.querySelectorAll('[data-nounit]').forEach((x) => { x.hidden = unit; });
      el.querySelectorAll('[data-kind]').forEach((x) => { x.hidden = x.dataset.kind !== f.kind.value; });
      el.querySelectorAll('[data-src]').forEach((x) => { x.hidden = !x.dataset.src.split(' ').includes(f.source.value); });
    };
    f.addEventListener('change', sync); sync();
    el.querySelector('[data-search]').onclick = async () => {
      const q = f.sourceId.value || f.name.value; const box = el.querySelector('#sres');
      if (!q) return; box.innerHTML = '<p class="muted small">Buscando…</p>';
      try {
        let list;
        if (f.source.value === 'coingecko') list = (await searchCrypto(q)).map((c) => ({ id: c.id, text: `${c.name} (${c.symbol})` }));
        else {
          const key = s.settings.apiKeys.alphavantage; if (!key) { box.innerHTML = '<p class="small bad">Añade tu clave gratuita de Alpha Vantage en Ajustes.</p>'; return; }
          list = (await searchSymbol(q, key)).map((m) => ({ id: m.symbol, text: `${m.symbol} · ${m.name} · ${m.region} · ${m.currency}`, cur: m.currency }));
        }
        box.innerHTML = list.length ? list.map((x, i) => `<button type="button" class="chip" data-i="${i}">${esc(x.text)}</button>`).join('') : '<p class="muted small">Sin resultados</p>';
        box.querySelectorAll('[data-i]').forEach((b) => { b.onclick = async () => {
          const x = list[b.dataset.i]; f.sourceId.value = x.id; if (x.cur) f.currency.value = x.cur; box.innerHTML = '<p class="muted small">Consultando precio…</p>';
          try {
            const px = f.source.value === 'coingecko' ? (await fetchCrypto([x.id], f.currency.value))[x.id] : (await fetchQuote(x.id, s.settings.apiKeys.alphavantage)).price;
            if (px != null) f.price.value = String(px).replace('.', ','); box.innerHTML = `<p class="small ok">Precio: ${esc(px)}</p>`;
          } catch (err) { box.innerHTML = `<p class="small bad">${esc(err.message)}</p>`; }
        }; });
      } catch (err) { box.innerHTML = `<p class="small bad">No se pudo buscar: ${esc(err.message)}</p>`; }
    };
    f.onsubmit = (e) => {
      e.preventDefault(); const v = readForm(f);
      const unit = ASSET_KINDS[v.kind]?.unit;
      const out = { ...(asset || {}), id: asset?.id || uid(), kind: v.kind, name: v.name.trim(), isin: v.isin || '', currency: unit ? v.currency : base(s), source: unit ? v.source : 'manual', sourceId: v.sourceId || '', accountId: null, closed: !!v.closed };
      if (unit && v.price != null) { if (v.price !== asset?.price) out.priceDate = today(); out.price = v.price; }
      out.washDays = v.washDays != null && v.washDays !== '' ? Number(v.washDays) : null;
      if (v.kind === 'deposit') { out.rate = (v.rate || 0) / 100; out.startDate = v.startDate; out.maturity = v.maturity || null; }
      update((st) => {
        const en = (v.entity || '').trim();
        if (en) {
          const ex = st.accounts.find((x) => x.name.trim().toLowerCase() === en.toLowerCase());
          if (ex) out.accountId = ex.id;
          else { out.accountId = uid(); st.accounts.push({ id: out.accountId, name: en, type: v.kind === 'crypto' ? 'crypto' : 'broker', currency: base(st), initial: 0, interest: 0 }); }
        }
        const i = st.assets.findIndex((x) => x.id === out.id); if (i >= 0) st.assets[i] = out; else st.assets.push(out);
        if (!asset) {
          if (unit && (v.iQty || v.iCost)) {
            // Sin participaciones: se deducen del precio actual; si tampoco hay precio, 1 participación
            const q = v.iQty || (v.iCost && out.price ? round6(v.iCost / out.price) : 1);
            if (!out.price) { out.price = v.iCost / q; out.priceDate = today(); }
            st.trades.push({ id: uid(), seq: Date.now(), assetId: out.id, date: v.iDate || today(), type: 'buy', qty: q, price: v.iCost ? v.iCost / q : out.price || 0, fee: 0, note: 'Posición inicial' });
          }
          if (!unit && (v.iAmount || v.iValue)) {
            st.trades.push({ id: uid(), seq: Date.now(), assetId: out.id, date: v.iDate || today(), type: 'buy', qty: v.iAmount || v.iValue, price: 1, fee: 0, note: 'Aportación inicial' });
            if (v.iValue != null && v.kind !== 'deposit') st.trades.push({ id: uid(), seq: Date.now() + 1, assetId: out.id, date: today(), type: 'value', price: v.iValue });
          }
        }
      });
      close(); toast('Activo guardado', 'ok');
    };
    el.querySelector('[data-del]')?.addEventListener('click', async () => {
      if (!(await confirmDlg(`¿Eliminar ${asset.name} y todas sus operaciones?`, { ok: 'Eliminar', danger: true }))) return;
      update((st) => { st.assets = st.assets.filter((x) => x.id !== asset.id); st.trades = st.trades.filter((t) => t.assetId !== asset.id && t.toAssetId !== asset.id); st.recurring = st.recurring.filter((r) => r.assetId !== asset.id); });
      close(); location.hash = '#/inversiones';
    });
  });
}

// ======================= Operación =======================
export function tradeForm(asset, trade = null, presetType = null) {
  const s = S();
  const unit = ASSET_KINDS[asset.kind]?.unit;
  const tr = trade || { type: presetType || 'buy', date: today(), price: asset.price || '', fee: 0, cashAccountId: asset.accountId && balance(s, asset.accountId) > 0 ? asset.accountId : '' };
  const types = unit ? [['buy', 'Compra'], ['sell', 'Venta'], ['dividend', 'Dividendo'], ['traspaso', 'Traspaso'], ['fee', 'Comisión']]
    : [['buy', 'Aportación'], ['sell', 'Retirada'], ['value', 'Valoración'], ['dividend', 'Intereses']];
  const others = s.assets.filter((x) => x.id !== asset.id && !x.closed && ASSET_KINDS[x.kind]?.unit);
  const foreign = asset.currency !== base(s);
  const body = html`<form class="form">
    ${segmented('type', types, tr.type)}
    <div data-t="buy sell traspaso" data-unit>${field({ name: 'qty', label: 'Participaciones', type: 'money', value: tr.qty ?? '' })}</div>
    <div data-t="buy sell" data-unit>${field({ name: 'price', label: `Precio por participación (${asset.currency})`, type: 'money', value: tr.price ?? '' })}
      <p class="small muted" id="tot"></p></div>
    <div data-t="buy sell" data-nounit>${field({ name: 'amount', label: 'Importe', type: 'money', value: tr.qty ?? '' })}</div>
    <div data-t="value">${field({ name: 'value', label: 'Valor total actual', type: 'money', value: tr.type === 'value' ? tr.price : '' })}</div>
    <div data-t="dividend">${field({ name: 'gross', label: 'Importe bruto', type: 'money', value: tr.gross ?? '' })}${field({ name: 'withholding', label: 'Retención', type: 'money', value: tr.withholding ?? '' })}</div>
    <div data-t="traspaso">${select({ name: 'toAssetId', label: 'Fondo de destino', options: others.map((x) => [x.id, x.name]), value: tr.toAssetId, hint: 'Traspaso entre fondos sin tributar: el coste y la antigüedad pasan al destino.' })}
      ${field({ name: 'toQty', label: 'Participaciones recibidas', type: 'money', value: tr.toQty ?? '' })}</div>
    <div data-t="buy sell fee">${field({ name: 'fee', label: tr.type === 'fee' ? 'Comisión' : 'Comisiones', type: 'money', value: tr.fee ?? 0 })}</div>
    ${field({ name: 'date', label: 'Fecha de la orden', type: 'date', value: tr.date, hint: 'Usa la fecha en que das la orden: cuenta como invertido desde ese día aunque el bróker tarde en ejecutarla.' })}
    <div data-t="buy sell dividend fee">${select({ name: 'cashAccountId', label: 'Cuenta de la que sale o a la que entra el dinero', options: accountOptions(s, { includeNone: true }), value: tr.cashAccountId || '', hint: 'Déjala en «Ninguna» si solo quieres registrar la operación sin mover saldo.' })}
      ${field({ name: 'cashAmount', label: 'Importe en la cuenta', type: 'money', value: tr.cashAmount ?? '', hint: 'Se calcula solo; cámbialo si el bróker cargó otra cantidad (divisa, redondeos).' })}</div>
    ${foreign ? html`<div data-t="buy sell dividend fee">${field({ name: 'fx', label: `Tipo de cambio: ${base(s)} por 1 ${asset.currency}`, type: 'money', value: tr.fx ?? (rate(s, asset.currency) ? round6(1 / rate(s, asset.currency)) : ''), hint: 'Para calcular plusvalías en tu moneda. Pon el del día de la operación.' })}</div>` : ''}
    ${field({ name: 'note', label: 'Nota', value: tr.note || '' })}
    <div class="row gap end mt">${trade ? html`<button type="button" class="btn danger ghost" data-del>Eliminar</button><span class="flex"></span>` : ''}<button class="btn primary">Guardar</button></div>
  </form>`;
  sheet(trade ? 'Editar operación' : `Operación · ${asset.name}`, body, (el, close) => {
    const f = el.querySelector('form');
    let cashTouched = !!trade;
    f.cashAmount?.addEventListener('input', () => { cashTouched = true; });
    const calcCash = () => {
      const t = f.querySelector('[name=type]:checked').value;
      const q = num(f.qty?.value), p = num(f.price?.value), fee = num(f.fee?.value), amt = num(f.amount?.value);
      let assetAmt = 0;
      if (t === 'buy') assetAmt = unit ? q * p + fee : amt + fee;
      else if (t === 'sell') assetAmt = unit ? q * p - fee : amt - fee;
      else if (t === 'dividend') assetAmt = num(f.gross.value) - num(f.withholding.value);
      else if (t === 'fee') assetAmt = fee;
      const acc = byId(s.accounts, f.cashAccountId?.value);
      let cash = assetAmt;
      if (acc && acc.currency !== asset.currency) {
        const fx = f.fx ? num(f.fx.value) : 0; // base por unidad del activo
        const inBase = fx ? assetAmt * fx : toBase(s, assetAmt, asset.currency);
        cash = fromBase(s, inBase, acc.currency);
      }
      const totEl = el.querySelector('#tot'); if (totEl) totEl.textContent = unit && q && p ? `Total: ${money(q * p, asset.currency)}` : '';
      if (f.cashAmount && !cashTouched) f.cashAmount.value = assetAmt ? String(round2(cash)).replace('.', ',') : '';
    };
    const sync = () => {
      const t = f.querySelector('[name=type]:checked').value;
      el.querySelectorAll('[data-t]').forEach((x) => { x.hidden = !x.dataset.t.split(' ').includes(t) || (x.hasAttribute('data-unit') && !unit) || (x.hasAttribute('data-nounit') && unit); });
      calcCash();
    };
    f.addEventListener('input', calcCash); f.addEventListener('change', sync); sync();
    f.onsubmit = (e) => {
      e.preventDefault(); const v = readForm(f);
      const out = { ...(trade || {}), id: trade?.id || uid(), seq: trade?.seq || Date.now(), assetId: asset.id, date: v.date, type: v.type, note: v.note || '' };
      for (const k of ['qty', 'price', 'fee', 'gross', 'withholding', 'toAssetId', 'toQty', 'cashAccountId', 'cashAmount', 'fx', 'estimated']) delete out[k];
      if (v.type === 'buy' || v.type === 'sell') {
        if (unit) { out.qty = v.qty || 0; out.price = v.price || 0; } else { out.qty = v.amount || 0; out.price = 1; }
        out.fee = v.fee || 0;
        if (!out.qty) { toast('Indica la cantidad'); return; }
      }
      if (v.type === 'value') out.price = v.value || 0;
      if (v.type === 'dividend') { out.gross = v.gross || 0; out.withholding = v.withholding || 0; }
      if (v.type === 'fee') out.fee = v.fee || 0;
      if (v.type === 'traspaso') { if (!v.toAssetId) { toast('Elige el fondo de destino'); return; } out.qty = v.qty || 0; out.toAssetId = v.toAssetId; out.toQty = v.toQty || 0; }
      if (['buy', 'sell', 'dividend', 'fee'].includes(v.type) && v.cashAccountId) { out.cashAccountId = v.cashAccountId; out.cashAmount = round2(v.cashAmount || 0); }
      if (foreign && v.fx) out.fx = v.fx;
      update((st) => {
        const i = st.trades.findIndex((x) => x.id === out.id); if (i >= 0) st.trades[i] = out; else st.trades.push(out);
        const a = byId(st.assets, asset.id);
        if (unit && (v.type === 'buy' || v.type === 'sell') && out.price && (!a.priceDate || v.date >= a.priceDate) && a.source === 'manual') { a.price = out.price; a.priceDate = v.date; }
      });
      close(); toast('Operación guardada', 'ok');
    };
    el.querySelector('[data-del]')?.addEventListener('click', async () => {
      if (!(await confirmDlg('¿Eliminar esta operación?', { ok: 'Eliminar', danger: true }))) return;
      update((st) => { st.trades = st.trades.filter((x) => x.id !== trade.id); }); close();
    });
  });
}
export function priceForm(asset) {
  sheet(`Precio · ${asset.name}`, html`<form class="form">
    ${field({ name: 'price', label: `Precio por participación (${asset.currency})`, type: 'money', value: asset.price ?? '', required: true })}
    ${field({ name: 'date', label: 'Fecha del precio', type: 'date', value: today() })}
    <button class="btn primary block">Guardar</button></form>`, (el, close) => {
    el.querySelector('form').onsubmit = (e) => {
      e.preventDefault(); const v = readForm(e.target);
      update((st) => { const a = byId(st.assets, asset.id); a.price = v.price; a.priceDate = v.date; });
      close(); toast('Precio actualizado', 'ok');
    };
  });
}

// ======================= Categoría =======================
export function categoryForm(cat = null, preset = {}) {
  const s = S();
  const c = cat || { kind: 'expense', icon: '🏷️', parent: null, ...preset };
  const roots = s.categories.filter((x) => !x.parent && x.kind === c.kind && x.id !== c.id);
  sheet(cat ? 'Editar categoría' : 'Nueva categoría', html`<form class="form">
    <div class="grid-icon">${field({ name: 'icon', label: 'Icono', value: c.icon, attrs: 'maxlength="4"' })}${field({ name: 'name', label: 'Nombre', value: c.name || '', required: true })}</div>
    ${select({ name: 'parent', label: 'Dentro de', options: [['', '— Categoría principal —'], ...roots.map((r) => [r.id, `${r.icon} ${r.name}`])], value: c.parent || '' })}
    ${c.kind === 'expense' ? checkbox({ name: 'essential', label: 'Gasto esencial', checked: !!c.essential, hint: 'Cuenta para calcular tu fondo de emergencia.' }) : ''}
    <div class="row gap end mt">${cat ? html`<button type="button" class="btn danger ghost" data-del>Eliminar</button><span class="flex"></span>` : ''}<button class="btn primary">Guardar</button></div>
  </form>`, (el, close) => {
    el.querySelector('form').onsubmit = (e) => {
      e.preventDefault(); const v = readForm(e.target);
      const out = { ...(cat || {}), id: cat?.id || uid(), kind: c.kind, icon: v.icon || '🏷️', name: v.name.trim(), parent: v.parent || null, essential: !!v.essential };
      update((st) => { const i = st.categories.findIndex((x) => x.id === out.id); if (i >= 0) st.categories[i] = out; else st.categories.push(out); });
      close(); toast('Categoría guardada', 'ok');
    };
    el.querySelector('[data-del]')?.addEventListener('click', async () => {
      const kids = s.categories.filter((x) => x.parent === cat.id);
      const n = s.transactions.filter((t) => t.categoryId === cat.id || kids.some((k) => k.id === t.categoryId)).length;
      if (!(await confirmDlg(n ? `Hay ${n} movimientos con esta categoría; pasarán a la categoría principal o quedarán sin categoría. ¿Eliminar?` : '¿Eliminar la categoría?', { ok: 'Eliminar', danger: true }))) return;
      update((st) => {
        const ids = new Set([cat.id, ...kids.map((k) => k.id)]);
        st.transactions.forEach((t) => { if (ids.has(t.categoryId)) t.categoryId = cat.parent || null; });
        st.categories = st.categories.filter((x) => !ids.has(x.id));
        ids.forEach((id) => delete st.budgets[id]);
      });
      close();
    });
  });
}

export { catName, balance, sum };
