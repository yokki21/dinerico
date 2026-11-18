// Cálculos: divisas, periodos, saldos, presupuestos, inversiones (FIFO), deudas,
// patrimonio, objetivos, reparto sugerido, fiscalidad e informes.
import {
  sum, round2, toISO, parseISO, addDays, addMonths, daysInMonth, monthsBetween,
  daysBetween, today, byId, fmtDate, monthLong,
} from './util.js';
import { ASSET_KINDS, DEBT_TYPES } from './defaults.js';

// ======================= Divisas =======================
export const base = (s) => s.settings.currency;
export function rate(s, cur) {
  if (!cur || cur === base(s)) return 1;
  const m = s.fx.manual?.[cur];
  if (m) return m;
  return s.fx.rates?.[cur] || null; // unidades de `cur` por 1 de la moneda principal
}
/** Convierte un importe en `cur` a la moneda principal. */
export function toBase(s, amount, cur) {
  const r = rate(s, cur);
  return r ? amount / r : amount; // sin tipo: se asume 1:1 (se avisa en Ajustes)
}
export function fromBase(s, amount, cur) { const r = rate(s, cur); return r ? amount * r : amount; }
export const missingRates = (s) => {
  const curs = new Set([...s.accounts.map((a) => a.currency), ...s.assets.map((a) => a.currency)]);
  return [...curs].filter((c) => c && c !== base(s) && !rate(s, c));
};

// ======================= Periodos =======================
function paydayStart(s, y, m) { // m 0-11
  const st = s.settings;
  const d = new Date(y, m, Math.min(st.payday || 1, daysInMonth(y, m)));
  if (st.paydayWeekendShift) {
    if (d.getDay() === 6) d.setDate(d.getDate() - 1);
    else if (d.getDay() === 0) d.setDate(d.getDate() - 2);
  }
  return toISO(d);
}
function startFor(s, y, m) {
  return s.settings.periodMode === 'payday' ? paydayStart(s, y, m) : toISO(new Date(y, m, 1));
}
export function periodOf(s, iso = today()) {
  const d = parseISO(iso);
  let y = d.getFullYear(), m = d.getMonth();
  let start = startFor(s, y, m);
  if (iso < start) { m -= 1; if (m < 0) { m = 11; y -= 1; } start = startFor(s, y, m); }
  let ny = y, nm = m + 1; if (nm > 11) { nm = 0; ny += 1; }
  const end = addDays(startFor(s, ny, nm), -1);
  return makePeriod(s, start, end, y, m);
}
function makePeriod(s, start, end, y, m) {
  const payday = s.settings.periodMode === 'payday';
  // En modo nómina el periodo se nombra por el mes que financia (el siguiente al cobro si se cobra a final de mes)
  let ly = y, lm = m;
  if (payday && (s.settings.payday || 1) > 15) { lm = m + 1; if (lm > 11) { lm = 0; ly += 1; } }
  const label = `${monthLong(lm)} ${ly}`;
  return { key: start, start, end, label: label[0].toUpperCase() + label.slice(1), range: `${fmtDate(start)} – ${fmtDate(end)}` };
}
export const shiftPeriod = (s, p, n) => {
  let cur = p;
  for (let i = 0; i < Math.abs(n); i++) cur = periodOf(s, n > 0 ? addDays(cur.end, 1) : addDays(cur.start, -1));
  return cur;
};
export function lastPeriods(s, n, from = periodOf(s)) {
  const out = [from];
  for (let i = 1; i < n; i++) out.unshift(shiftPeriod(s, out[0], -1));
  return out;
}
export const periodProgress = (p, iso = today()) =>
  Math.min(1, Math.max(0, (daysBetween(p.start, iso) + 1) / (daysBetween(p.start, p.end) + 1)));

// ======================= Categorías =======================
export function rootCat(s, catId) {
  let c = byId(s.categories, catId);
  while (c && c.parent) c = byId(s.categories, c.parent);
  return c;
}
export const catName = (s, id) => {
  const c = byId(s.categories, id); if (!c) return 'Sin categoría';
  const p = c.parent ? byId(s.categories, c.parent) : null;
  return p ? `${p.name} · ${c.name}` : c.name;
};
export const isEssential = (s, id) => !!rootCat(s, id)?.essential;

// ======================= Movimientos y saldos =======================
/** Efecto de un movimiento en la cuenta dada (moneda de la cuenta). */
export function txEffect(t, accId) {
  switch (t.type) {
    case 'expense': return t.accountId === accId ? -t.amount : 0;
    case 'income': return t.accountId === accId ? t.amount : 0;
    case 'transfer':
      if (t.accountId === accId) return -t.amount;
      if (t.toAccountId === accId) return t.toAmount ?? t.amount;
      return 0;
    case 'adjust': case 'debtmove': return t.accountId === accId ? t.amount : 0; // con signo
    default: return 0;
  }
}
export function tradeCashEffect(tr, accId) {
  if (!tr.cashAccountId || tr.cashAccountId !== accId) return 0;
  const amt = Number(tr.cashAmount) || 0;
  switch (tr.type) {
    case 'buy': case 'fee': return -amt;
    case 'sell': case 'dividend': return amt;
    default: return 0;
  }
}
export function balance(s, accId, upTo = null) {
  const a = byId(s.accounts, accId); if (!a) return 0;
  let b = Number(a.initial) || 0;
  for (const t of s.transactions) if (!upTo || t.date <= upTo) b += txEffect(t, accId);
  for (const tr of s.trades) if (!upTo || tr.date <= upTo) b += tradeCashEffect(tr, accId);
  return round2(b);
}
export const balanceBase = (s, accId, upTo) => {
  const a = byId(s.accounts, accId); return toBase(s, balance(s, accId, upTo), a?.currency);
};
export const activeAccounts = (s) => s.accounts.filter((a) => !a.archived);
export const liquidTotal = (s) => sum(activeAccounts(s).filter((a) => a.type !== 'card'), (a) => balanceBase(s, a.id));

// Importe del movimiento en moneda principal
export function txBase(s, t) {
  const a = byId(s.accounts, t.accountId);
  return toBase(s, t.amount, a?.currency || base(s));
}
export const txIn = (t, p) => t.date >= p.start && t.date <= p.end;

// ======================= Resumen de periodo =======================
export function periodSummary(s, p) {
  const txs = s.transactions.filter((t) => txIn(t, p));
  const inc = txs.filter((t) => t.type === 'income');
  const exp = txs.filter((t) => t.type === 'expense');
  const income = sum(inc, (t) => txBase(s, t));
  const expense = sum(exp, (t) => txBase(s, t));
  const byCat = {};
  for (const t of exp) {
    const r = rootCat(s, t.categoryId); const k = r?.id || 'none';
    byCat[k] = (byCat[k] || 0) + txBase(s, t);
  }
  const bySub = {};
  for (const t of exp) { const k = t.categoryId || 'none'; bySub[k] = (bySub[k] || 0) + txBase(s, t); }
  const incByCat = {};
  for (const t of inc) { const k = rootCat(s, t.categoryId)?.id || 'none'; incByCat[k] = (incByCat[k] || 0) + txBase(s, t); }
  const essential = sum(exp.filter((t) => isEssential(s, t.categoryId)), (t) => txBase(s, t));
  const savings = income - expense;
  return {
    period: p, txs, income, expense, savings, essential,
    rate: income > 0 ? savings / income : 0, byCat, bySub, incByCat, count: exp.length,
  };
}

export function averages(s, n = 3, from = periodOf(s)) {
  const ps = lastPeriods(s, n + 1, from).slice(0, n); // n periodos anteriores
  const sums = ps.map((p) => periodSummary(s, p)).filter((x) => x.income || x.expense);
  const k = sums.length || 1;
  const byCat = {};
  sums.forEach((x) => Object.entries(x.byCat).forEach(([c, v]) => { byCat[c] = (byCat[c] || 0) + v / k; }));
  return {
    n: sums.length,
    income: sum(sums, (x) => x.income) / k,
    expense: sum(sums, (x) => x.expense) / k,
    essential: sum(sums, (x) => x.essential) / k,
    byCat,
  };
}

// ======================= Presupuestos =======================
export function budgetStatus(s, p = periodOf(s)) {
  const summ = periodSummary(s, p);
  const prog = periodProgress(p);
  return Object.entries(s.budgets).filter(([, v]) => v > 0).map(([catId, limit]) => {
    const cat = byId(s.categories, catId);
    const spent = summ.byCat[catId] || 0;
    const ratio = spent / limit;
    return {
      catId, cat, limit, spent, ratio, left: limit - spent, prog,
      pace: prog > 0 ? ratio / prog : 0, // >1: gastando más rápido de lo previsto
      level: spent > limit + 0.005 ? 'over' : ratio >= 0.8 ? 'warn' : 'ok',
    };
  }).filter((b) => b.cat).sort((a, b) => b.ratio - a.ratio);
}
export const budgetTotal = (s) => sum(Object.values(s.budgets), (v) => v);

// ======================= Recurrentes =======================
export function nextDate(r, from) {
  switch (r.freq) {
    case 'weekly': return addDays(from, 7);
    case 'biweekly': return addDays(from, 14);
    case 'quarterly': return addMonths(from, 3, r.day);
    case 'yearly': return addMonths(from, 12, r.day);
    default: return addMonths(from, 1, r.day);
  }
}
/** Ocurrencias pendientes (fecha <= hasta) de cada recurrente activo. */
export function dueRecurring(s, upTo = today()) {
  const out = [];
  for (const r of s.recurring) {
    if (!r.active || !r.next) continue;
    let d = r.next; let guard = 0;
    while (d <= upTo && guard++ < 60) {
      if (r.end && d > r.end) break;
      out.push({ rec: r, date: d });
      d = nextDate(r, d);
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
export function upcomingRecurring(s, days = 7) {
  const lim = addDays(today(), days);
  return s.recurring.filter((r) => r.active && r.next > today() && r.next <= lim)
    .sort((a, b) => a.next.localeCompare(b.next));
}
export function recurringMonthly(r) {
  const f = { weekly: 52 / 12, biweekly: 26 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 }[r.freq] ?? 1;
  return (Number(r.amount) || 0) * f;
}

// ======================= Inversiones =======================
const tradeSort = (a, b) => a.date.localeCompare(b.date) || (a.seq || 0) - (b.seq || 0);
export function tradeFx(s, tr, asset) {
  if (!asset || asset.currency === base(s)) return 1;
  if (tr.fx) return Number(tr.fx); // moneda principal por unidad de la moneda del activo
  const r = rate(s, asset.currency); return r ? 1 / r : 1;
}

/** Recorre todas las operaciones y calcula posiciones (FIFO) y ganancias realizadas. */
export function portfolio(s) {
  const lots = {}; // assetId -> [{date, qty, cost}]
  const pos = {};
  const realized = []; const dividends = [];
  for (const a of s.assets) { lots[a.id] = []; pos[a.id] = { invested: 0, withdrawn: 0, lastValue: null, lastValueDate: null, realized: 0, dividends: 0, fees: 0 }; }
  const trades = [...s.trades].sort(tradeSort);
  for (const tr of trades) {
    const a = byId(s.assets, tr.assetId); if (!a) continue;
    const unit = ASSET_KINDS[a.kind]?.unit;
    const fx = tradeFx(s, tr, a);
    const P = pos[a.id];
    const qty = Number(tr.qty) || 0, price = Number(tr.price) || 0, fee = Number(tr.fee) || 0;
    if (tr.type === 'buy') {
      const cost = (unit ? qty * price + fee : qty + fee) * fx;
      lots[a.id].push({ date: tr.date, qty: unit ? qty : qty, cost, tradeId: tr.id });
      P.invested += cost; P.fees += fee * fx;
    } else if (tr.type === 'sell') {
      if (!unit) { // retirada de un bien sin participaciones: reduce coste proporcional
        const totalQty = sum(lots[a.id], (l) => l.qty);
        const share = totalQty > 0 ? Math.min(1, qty / totalQty) : 0;
        const costOut = consume(lots[a.id], qty).cost;
        P.withdrawn += qty * fx;
        if (a.kind !== 'other' && a.kind !== 'deposit') realized.push({ date: tr.date, assetId: a.id, qty, proceeds: (qty - fee) * fx, cost: costOut, gain: (qty - fee) * fx - costOut, share, tradeId: tr.id });
        continue;
      }
      const proceeds = (qty * price - fee) * fx;
      const used = consume(lots[a.id], qty);
      const gain = proceeds - used.cost;
      realized.push({ date: tr.date, assetId: a.id, qty, proceeds, cost: used.cost, gain, from: used.dates, tradeId: tr.id, short: used.short });
      P.realized += gain; P.withdrawn += proceeds; P.fees += fee * fx;
    } else if (tr.type === 'traspaso') {
      const b = byId(s.assets, tr.toAssetId); if (!b) continue;
      const used = consume(lots[a.id], qty, true);
      const k = qty > 0 ? (Number(tr.toQty) || 0) / qty : 0;
      for (const l of used.lots) lots[b.id].push({ date: l.date, qty: l.qty * k, cost: l.cost, via: tr.id });
      lots[b.id].sort((x, y) => x.date.localeCompare(y.date));
      pos[b.id].invested += used.cost; P.invested -= used.cost;
    } else if (tr.type === 'dividend') {
      const gross = (Number(tr.gross) || Number(tr.cashAmount) + (Number(tr.withholding) || 0)) * fx;
      dividends.push({ date: tr.date, assetId: a.id, gross, withholding: (Number(tr.withholding) || 0) * fx, tradeId: tr.id });
      P.dividends += gross;
    } else if (tr.type === 'fee') {
      P.fees += (Number(tr.cashAmount) || fee) * fx;
    } else if (tr.type === 'value') {
      P.lastValue = Number(tr.price) || 0; P.lastValueDate = tr.date;
    }
  }
  const holdings = s.assets.map((a) => {
    const L = lots[a.id] || []; const P = pos[a.id];
    const kind = ASSET_KINDS[a.kind] || {};
    const qty = sum(L, (l) => l.qty);
    const cost = sum(L, (l) => l.cost);
    let value; let valueDate = a.priceDate;
    if (kind.unit) value = toBase(s, qty * (Number(a.price) || 0), a.currency);
    else if (a.kind === 'deposit') { value = depositValue(s, a, cost); valueDate = today(); }
    else { value = P.lastValue != null ? toBase(s, P.lastValue, a.currency) : cost; valueDate = P.lastValueDate; }
    if (a.closed) value = 0;
    return {
      asset: a, qty, cost, value, valueDate, lots: L, gain: value - cost,
      gainPct: cost > 0 ? (value - cost) / cost : 0, avgPrice: qty > 0 ? cost / qty : 0, ...P,
    };
  });
  return { holdings, realized: flagWash(s, realized, trades), dividends };
}
function consume(lots, qty, keepLots = false) {
  let left = qty; let cost = 0; const dates = []; const used = [];
  while (left > 1e-12 && lots.length) {
    const l = lots[0];
    const take = Math.min(l.qty, left);
    const c = l.qty > 0 ? l.cost * (take / l.qty) : 0;
    cost += c; dates.push(l.date); if (keepLots) used.push({ date: l.date, qty: take, cost: c });
    l.cost -= c; l.qty -= take; left -= take;
    if (l.qty <= 1e-12) lots.shift();
  }
  return { cost, dates, lots: used, short: left > 1e-9 ? left : 0 };
}
function depositValue(s, a, principal) {
  if (!a.startDate || !a.rate) return principal;
  const end = a.maturity && a.maturity < today() ? a.maturity : today();
  const days = Math.max(0, daysBetween(a.startDate, end));
  return principal * (1 + (Number(a.rate) || 0) * days / 365);
}
/** Marca pérdidas que podrían no computar por recompra de valores homogéneos. */
function flagWash(s, realized, trades) {
  return realized.map((r) => {
    if (r.gain >= 0) return r;
    const a = byId(s.assets, r.assetId);
    const win = a?.washDays ?? ASSET_KINDS[a?.kind]?.window ?? 0;
    if (!win) return r;
    const lo = addDays(r.date, -win), hi = addDays(r.date, win);
    // Recompras: compras dentro de la ventana que no sean los propios lotes vendidos
    const sold = new Set(r.from || []);
    const hit = trades.some((t) => t.assetId === r.assetId && t.type === 'buy' && t.date >= lo && t.date <= hi && t.id !== r.tradeId && (t.date > r.date || !sold.has(t.date)));
    return hit ? { ...r, wash: true, washDays: win } : r;
  });
}
export const investedTotal = (s, pf = portfolio(s)) => sum(pf.holdings.filter((h) => !h.asset.closed && h.asset.kind !== 'other'), (h) => h.value);
export function staleAssets(s) {
  const lim = addDays(today(), -(s.settings.priceStaleDays || 7));
  return s.assets.filter((a) => !a.closed && ASSET_KINDS[a.kind]?.unit && (!a.priceDate || a.priceDate < lim));
}

// ======================= Deudas =======================
export function debtMoves(s, d) { return s.transactions.filter((t) => t.debtId === d.id).sort((a, b) => a.date.localeCompare(b.date)); }
export function debtOutstanding(s, d) {
  const moves = debtMoves(s, d);
  if (d.type === 'personal') {
    let out = Number(d.principal) || 0;
    for (const t of moves) {
      if (t.opening) continue;
      const v = Math.abs(txBase(s, t)); const inflow = (t.type === 'income') || (t.type === 'debtmove' && t.amount > 0);
      if (d.direction === 'owed') out += inflow ? -v : v; else out += inflow ? v : -v;
    }
    return Math.max(0, round2(out));
  }
  if (d.type === 'renting') {
    const left = Math.max(0, (Number(d.termMonths) || 0) - monthsBetween(d.startDate || today(), today()));
    return round2(left * (Number(d.payment) || 0));
  }
  // Préstamos con interés: capitaliza entre pagos y descuenta cada pago
  const r = (Number(d.rate) || 0) / 12;
  let bal = Number(d.principal) || 0; let from = d.startDate || today();
  if (d.manualBalance?.amount != null && d.manualBalance.date) { bal = Number(d.manualBalance.amount); from = d.manualBalance.date; }
  for (const t of moves) {
    if (t.date < from || t.opening) continue;
    const m = Math.max(0, monthsBetween(from, t.date));
    bal = bal * Math.pow(1 + r, m) - Math.abs(txBase(s, t));
    from = t.date; if (bal <= 0) { bal = 0; break; }
  }
  return Math.max(0, round2(bal));
}
export function amortization(principal, annualRate, months, payment = null) {
  const r = annualRate / 12;
  const pay = payment || (r ? principal * r / (1 - Math.pow(1 + r, -months)) : principal / months);
  const rows = []; let bal = principal; let totalInt = 0;
  for (let i = 1; i <= 1200 && bal > 0.005; i++) {
    const int = bal * r; const princ = Math.min(bal, pay - int);
    if (princ <= 0) break; // la cuota no cubre intereses
    bal -= princ; totalInt += int; rows.push({ i, pay: princ + int, int, princ, bal });
  }
  return { payment: pay, rows, totalInterest: totalInt, months: rows.length };
}
export function debtsSummary(s) {
  const out = s.debts.filter((d) => !d.closed).map((d) => ({ d, out: debtOutstanding(s, d), liability: d.type === 'personal' ? true : DEBT_TYPES[d.type]?.liability }));
  return {
    list: out,
    owe: sum(out.filter((x) => x.d.direction !== 'owed' && x.liability), (x) => x.out),
    owed: sum(out.filter((x) => x.d.direction === 'owed'), (x) => x.out),
    commitments: sum(out.filter((x) => x.d.type === 'renting'), (x) => x.out),
  };
}

// ======================= Patrimonio =======================
export function netWorth(s, pf = portfolio(s)) {
  let assets = 0, liabilities = 0;
  for (const a of activeAccounts(s)) { const b = balanceBase(s, a.id); if (b >= 0) assets += b; else liabilities -= b; }
  const inv = sum(pf.holdings.filter((h) => !h.asset.closed), (h) => h.value);
  const ds = debtsSummary(s);
  assets += inv + ds.owed; liabilities += ds.owe;
  return { assets, liabilities, netWorth: assets - liabilities, investments: inv, cash: liquidTotal(s), owed: ds.owed, owe: ds.owe };
}
/** Guarda/actualiza la foto del patrimonio del periodo actual. Devuelve true si cambió. */
export function refreshSnapshot(s) {
  const p = periodOf(s); const nw = netWorth(s);
  const snap = { period: p.key, label: p.label, date: today(), assets: round2(nw.assets), liabilities: round2(nw.liabilities), netWorth: round2(nw.netWorth), investments: round2(nw.investments), cash: round2(nw.cash) };
  const i = s.snapshots.findIndex((x) => x.period === p.key);
  if (i >= 0) {
    const o = s.snapshots[i];
    if (o.netWorth === snap.netWorth && o.assets === snap.assets) return false;
    s.snapshots[i] = snap;
  } else s.snapshots.push(snap);
  s.snapshots.sort((a, b) => a.period.localeCompare(b.period));
  return true;
}

// ======================= Objetivos =======================
export function goalSaved(s, g) {
  if (g.accountId) return balanceBase(s, g.accountId);
  return (Number(g.initial) || 0) + sum(g.contributions || [], (c) => c.amount);
}
export function emergencyTarget(s) {
  const st = s.settings.plan;
  const av = averages(s, 3);
  let monthly = av.essential;
  if (!monthly) {
    const ess = Object.entries(s.budgets).filter(([id]) => isEssential(s, id));
    monthly = sum(ess, ([, v]) => v);
  }
  if (!monthly) monthly = (s.settings.expectedIncome || 0) * 0.5;
  return round2(monthly * (st.emergencyMonths || 6));
}
export function goalInfo(s, g) {
  const saved = goalSaved(s, g);
  const target = g.kind === 'emergency' && g.autoTarget ? emergencyTarget(s) : Number(g.target) || 0;
  const left = Math.max(0, target - saved);
  const months = g.targetDate ? Math.max(1, Math.round(daysBetween(today(), g.targetDate) / 30.44)) : null;
  const monthlyNeed = months ? left / months : null;
  let expected = null; // progreso esperado lineal desde la creación
  if (g.targetDate && g.createdAt) {
    const tot = Math.max(1, daysBetween(g.createdAt.slice(0, 10), g.targetDate));
    expected = Math.min(1, Math.max(0, daysBetween(g.createdAt.slice(0, 10), today()) / tot));
  }
  const progress = target > 0 ? Math.min(1, saved / target) : 0;
  return { g, saved, target, left, months, monthlyNeed, progress, expected, behind: expected != null && progress + 0.05 < expected, done: target > 0 && saved >= target };
}

// ======================= Reparto sugerido =======================
/** Cuánto quiere ahorrar la persona este periodo: % del ingreso o cantidad fija. */
export function savingsTarget(s, income) {
  const plan = s.settings.plan;
  if (plan.savingsMode === 'amount') return Math.max(0, Number(plan.savingsAmount) || 0);
  return Math.max(0, income * (plan.savingsRate || 0));
}
export function suggestAllocation(s, p = periodOf(s)) {
  const st = s.settings; const plan = st.plan; const B = base(s);
  const summ = periodSummary(s, p); const av = averages(s, 3, p);
  const income = summ.income > 0 ? summ.income : (st.expectedIncome || av.income || 0);
  const incomeSource = summ.income > 0 ? 'real' : 'previsto';
  const target = round2(savingsTarget(s, income));
  const spendable = income - target; // lo que queda para gastar
  const bt = budgetTotal(s);
  const items = []; const missing = [];
  let rem = target;
  const goals = s.goals.filter((g) => !g.closed).map((g) => goalInfo(s, g));
  const emer = goals.find((x) => x.g.kind === 'emergency' && !x.done);
  if (emer && rem > 0) {
    const want = Number(emer.g.monthly) > 0 ? Number(emer.g.monthly) : rem * plan.emergencyShare;
    const amt = Math.min(emer.left, want, rem);
    if (amt > 0.5) { items.push({ key: 'goal:' + emer.g.id, label: `${emer.g.icon || '🛟'} ${emer.g.name}`, amount: round2(amt), why: `Te faltan ${moneyTxt(emer.left, B)} para cubrir ${plan.emergencyMonths} meses de gastos esenciales.` }); rem -= amt; }
  }
  const others = goals.filter((x) => x.g.kind !== 'emergency' && x.left > 0)
    .sort((a, b) => (a.g.priority || 3) - (b.g.priority || 3) || (a.g.targetDate || '9').localeCompare(b.g.targetDate || '9'));
  for (const x of others) {
    const fixed = Number(x.g.monthly) > 0;
    const need = fixed ? Number(x.g.monthly) : (x.monthlyNeed ?? x.left * 0.1);
    const amt = Math.max(0, Math.min(need, rem, x.left));
    if (amt > 0.5) {
      items.push({ key: 'goal:' + x.g.id, label: `${x.g.icon || '🎯'} ${x.g.name}`, amount: round2(amt),
        why: fixed ? `Aportación fija que elegiste: ${moneyTxt(need, B)}/mes.` : x.months ? `Para llegar en ${x.months} meses necesitas ${moneyTxt(x.monthlyNeed, B)} al mes.` : 'Sin fecha límite: aportación orientativa.' });
      rem -= amt;
    }
    if (need - amt > 1) missing.push({ name: x.g.name, short: need - amt });
  }
  if (rem > 0.5) {
    const inv = rem * plan.investShare;
    if (inv > 0.5) items.push({ key: 'invest', label: '📈 Inversión', amount: round2(inv), why: 'Lo que sobra tras colchón y objetivos, según tu porcentaje de inversión.' });
    const free = rem - inv;
    if (free > 0.5) items.push({ key: 'free', label: '💰 Ahorro sin asignar', amount: round2(free), why: 'Ahorro que queda libre: déjalo en la cuenta remunerada o súmalo a un objetivo.' });
  }
  return {
    income, incomeSource, target, spendable, budgets: bt, items, missing,
    budgetsOver: bt > 0 && bt - spendable > Math.max(10, income * 0.02) ? bt - spendable : 0,
  };
}

// ======================= Fiscalidad (España, orientativa) =======================
export function applyBrackets(baseAmt, brackets) {
  let tax = 0, prev = 0;
  for (const b of brackets) {
    const top = b.upTo ?? Infinity;
    if (baseAmt > prev) tax += (Math.min(baseAmt, top) - prev) * b.rate;
    prev = top; if (baseAmt <= top) break;
  }
  return tax;
}
export function taxYear(s, year, pf = portfolio(s)) {
  const inYear = (d) => d.slice(0, 4) === String(year);
  const taxableAsset = (id) => { const a = byId(s.assets, id); return a && !['pension', 'other', 'deposit'].includes(a.kind); };
  const gains = pf.realized.filter((r) => inYear(r.date) && taxableAsset(r.assetId));
  const divs = pf.dividends.filter((d) => inYear(d.date));
  const intCats = new Set(s.categories.filter((c) => c.kind === 'income' && /inter[eé]s|dividend/i.test(c.name)).map((c) => c.id));
  const intTx = s.transactions.filter((t) => t.type === 'income' && inYear(t.date) && intCats.has(t.categoryId));
  const rcmGross = sum(divs, (d) => d.gross) + sum(intTx, (t) => txBase(s, t) + (Number(t.withholding) || 0));
  const withholding = sum(divs, (d) => d.withholding) + sum(intTx, (t) => Number(t.withholding) || 0);
  const computable = gains.filter((g) => !g.wash);
  const gp = sum(computable, (g) => g.gain);
  const deferred = sum(gains.filter((g) => g.wash), (g) => g.gain);
  // Compensación cruzada hasta el 25 %
  let rcm = rcmGross, gpNet = gp;
  if (gpNet < 0 && rcm > 0) { const c = Math.min(-gpNet, rcm * 0.25); rcm -= c; gpNet += c; }
  if (rcm < 0 && gpNet > 0) { const c = Math.min(-rcm, gpNet * 0.25); gpNet -= c; rcm += c; }
  const taxBase = Math.max(0, rcm) + Math.max(0, gpNet);
  const tax = applyBrackets(taxBase, s.settings.tax.brackets);
  return {
    year, gains, divs, intTx, rcmGross, withholding, gp, deferred, taxBase, tax,
    toPay: tax - withholding, lossCarry: Math.min(0, gpNet), rcmCarry: Math.min(0, rcm),
  };
}

// ======================= Informe mensual =======================
export function monthlyReport(s, p) {
  const sm = periodSummary(s, p);
  const prev = shiftPeriod(s, p, -1);
  const pv = periodSummary(s, prev);
  const av = averages(s, 3, p);
  const targetAmt = savingsTarget(s, sm.income);
  const target = sm.income > 0 ? targetAmt / sm.income : 0;
  const budgets = budgetStatus(s, p);
  const findings = []; const tips = [];
  const B = base(s);

  if (sm.income === 0 && sm.expense === 0) return { sm, empty: true, findings, tips, budgets };
  if (sm.income > 0 && sm.savings >= targetAmt - 0.5) findings.push({ good: true, text: `Has ahorrado ${moneyTxt(sm.savings, B)} (${(sm.rate * 100).toFixed(0)} % de tus ingresos); tu objetivo era ${moneyTxt(targetAmt, B)}.` });
  else if (sm.income > 0) findings.push({ good: false, text: `Has ahorrado ${moneyTxt(Math.max(0, sm.savings), B)} (${(Math.max(0, sm.rate) * 100).toFixed(0)} %); para tu objetivo de ${moneyTxt(targetAmt, B)} faltaron ${moneyTxt(targetAmt - sm.savings, B)}.` });
  if (pv.expense > 0) {
    const d = sm.expense - pv.expense;
    findings.push({ good: d <= 0, text: `Gastaste ${moneyTxt(Math.abs(d), B)} ${d <= 0 ? 'menos' : 'más'} que en ${prev.label.toLowerCase()}.` });
  }
  const over = budgets.filter((b) => b.level === 'over');
  const okB = budgets.filter((b) => b.level === 'ok');
  if (over.length) findings.push({ good: false, text: `Te pasaste en ${over.map((b) => `${b.cat.name} (+${moneyTxt(-b.left, B)})`).join(', ')}.` });
  if (budgets.length && !over.length) findings.push({ good: true, text: 'Cumpliste todos los presupuestos.' });
  else if (okB.length) findings.push({ good: true, text: `Bien en ${okB.slice(0, 3).map((b) => b.cat.name).join(', ')}.` });

  // Categorías que crecen respecto a la media
  if (av.n >= 2) {
    for (const [cid, v] of Object.entries(sm.byCat)) {
      const m = av.byCat[cid] || 0;
      if (m > 20 && v > m * 1.3 && v - m > 25) {
        const c = byId(s.categories, cid);
        tips.push(`${c?.icon || ''} ${c?.name || 'Sin categoría'}: ${moneyTxt(v, B)}, un ${Math.round((v / m - 1) * 100)} % por encima de tu media (${moneyTxt(m, B)}). Revisa si fue puntual.`);
      }
    }
  }
  // Gastos hormiga
  const small = sm.txs.filter((t) => t.type === 'expense' && txBase(s, t) < 10);
  const smallSum = sum(small, (t) => txBase(s, t));
  if (small.length >= 8) tips.push(`Tuviste ${small.length} gastos pequeños (menos de 10) que suman ${moneyTxt(smallSum, B)}. Al año serían unos ${moneyTxt(smallSum * 12, B)}.`);
  // Suscripciones
  const subsRoot = s.categories.find((c) => !c.parent && /suscrip/i.test(c.name));
  if (subsRoot && sm.byCat[subsRoot.id]) tips.push(`Suscripciones: ${moneyTxt(sm.byCat[subsRoot.id], B)} este mes, ${moneyTxt(sm.byCat[subsRoot.id] * 12, B)} al año. ¿Las usas todas?`);
  // Presupuesto que sobra mucho → ajustar
  for (const b of budgets) if (b.ratio < 0.5 && b.limit > 30) tips.push(`En ${b.cat.name} usaste solo el ${Math.round(b.ratio * 100)} % del presupuesto. Puedes bajarlo y pasar la diferencia al ahorro.`);
  // Fondo de emergencia
  const emer = s.goals.find((g) => g.kind === 'emergency' && !g.closed);
  if (emer) {
    const gi = goalInfo(s, emer); const ess = av.essential || sm.essential;
    if (ess > 0) findings.push({ good: gi.saved >= gi.target, text: `Tu colchón cubre ${(gi.saved / ess).toFixed(1).replace('.', ',')} meses de gastos esenciales.` });
  }
  // Liquidez ociosa
  const liq = liquidTotal(s); const emerSaved = emer ? goalSaved(s, emer) : 0;
  const idle = liq - emerSaved - (av.expense || sm.expense) * 1.5;
  if (idle > 1000) tips.push(`Tienes unos ${moneyTxt(idle, B)} en cuentas por encima de mes y medio de gastos y del colchón. Podrías asignarlos a un objetivo o invertirlos.`);
  // Plan vs real
  const plan = s.plans[p.key];
  if (plan?.accepted) {
    const planned = sum(plan.items, (i) => i.amount);
    const done = sum(plan.items.filter((i) => i.done), (i) => i.amount);
    findings.push({ good: done >= planned * 0.95, text: `Reparto: completaste ${moneyTxt(done, B)} de ${moneyTxt(planned, B)} planificados.` });
  }
  const pf = portfolio(s);
  const stale = staleAssets(s);
  if (stale.length) tips.push(`Actualiza el precio de ${stale.map((a) => a.name).join(', ')} para que el patrimonio sea fiel.`);
  const top = [...sm.txs].filter((t) => t.type === 'expense').sort((a, b) => txBase(s, b) - txBase(s, a)).slice(0, 5);
  return { sm, pv, av, budgets, findings, tips, top, prev, pf, empty: false };
}
function moneyTxt(n, cur) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: cur, maximumFractionDigits: 0, useGrouping: 'always' }).format(n);
}

// ======================= Avisos =======================
export function alerts(s) {
  const out = [];
  const p = periodOf(s);
  for (const b of budgetStatus(s, p)) {
    if (b.level === 'over') out.push({ id: `bud-over-${p.key}-${b.catId}`, level: 'bad', icon: b.cat.icon, text: `Has superado el presupuesto de ${b.cat.name} en ${moneyTxt(-b.left, base(s))}.`, go: '#/plan' });
    else if (b.level === 'warn') out.push({ id: `bud-warn-${p.key}-${b.catId}`, level: 'warn', icon: b.cat.icon, text: `Llevas el ${Math.round(b.ratio * 100)} % del presupuesto de ${b.cat.name} y el mes va por el ${Math.round(b.prog * 100)} %.`, go: '#/plan' });
  }
  const due = dueRecurring(s);
  if (due.length) out.push({ id: null, level: 'warn', icon: '🔁', text: `${due.length} movimiento${due.length > 1 ? 's' : ''} recurrente${due.length > 1 ? 's' : ''} por confirmar.`, go: '#/recurrentes' });
  for (const r of upcomingRecurring(s, 3)) out.push({ id: `up-${r.id}-${r.next}`, level: 'info', icon: '📅', text: `${r.name}: ${moneyTxt(r.amount, base(s))} el ${fmtDate(r.next)}.`, go: '#/recurrentes' });
  const stale = staleAssets(s);
  if (stale.length) out.push({ id: `stale-${today()}`, level: 'info', icon: '📈', text: `Precios sin actualizar: ${stale.slice(0, 3).map((a) => a.name).join(', ')}${stale.length > 3 ? '…' : ''}.`, go: '#/inversiones' });
  const lb = s.settings.lastBackup;
  if (s.transactions.length > 5 && (!lb || daysBetween(lb, today()) > (s.settings.backupEveryDays || 14))) out.push({ id: `bk-${today()}`, level: 'warn', icon: '💾', text: lb ? `Tu última copia de seguridad es del ${fmtDate(lb)}.` : 'Aún no has hecho ninguna copia de seguridad.', go: '#/ajustes' });
  const prev = shiftPeriod(s, p, -1);
  if (s.transactions.some((t) => txIn(t, prev))) out.push({ id: `rep-${prev.key}`, level: 'good', icon: '📊', text: `Ya tienes el informe de ${prev.label.toLowerCase()}.`, go: `#/informe/${prev.key}` });
  for (const g of s.goals.filter((x) => !x.closed)) { const gi = goalInfo(s, g); if (gi.behind && !gi.done) out.push({ id: `goal-${g.id}-${p.key}`, level: 'warn', icon: g.icon || '🎯', text: `${g.name} va por detrás: ${Math.round(gi.progress * 100)} % frente al ${Math.round(gi.expected * 100)} % esperado.`, go: '#/objetivos' }); }
  for (const a of activeAccounts(s)) if (a.type !== 'card' && balance(s, a.id) < 0) out.push({ id: `neg-${a.id}-${today()}`, level: 'bad', icon: '⚠️', text: `${a.name} está en negativo.`, go: '#/cuentas' });
  const plan = s.plans[p.key];
  if (!plan?.accepted && periodSummary(s, p).income > 0) out.push({ id: `plan-${p.key}`, level: 'info', icon: '🧮', text: 'Ya has cobrado: revisa el reparto sugerido de este mes.', go: '#/plan' });
  // Posible doble conteo: saldo del bróker ≈ valor de lo invertido en él
  const pfA = portfolio(s);
  for (const a of activeAccounts(s).filter((x) => x.type === 'broker' || x.type === 'crypto')) {
    const inv = sum(pfA.holdings.filter((h) => h.asset.accountId === a.id && !h.asset.closed), (h) => h.value);
    const bal = balanceBase(s, a.id);
    if (inv > 50 && bal > 50 && Math.abs(bal - inv) / inv < 0.15) out.push({ id: `dup-${a.id}`, level: 'warn', icon: '🔁', text: `${a.name} tiene ${moneyTxt(bal, base(s))} de saldo y ${moneyTxt(inv, base(s))} invertidos. Si el saldo es lo mismo que lo invertido, se cuenta dos veces: cuadra el saldo de la cuenta al efectivo real.`, go: `#/cuenta/${a.id}` });
  }
  const miss = missingRates(s);
  if (miss.length) out.push({ id: null, level: 'warn', icon: '💱', text: `Falta el tipo de cambio de ${miss.join(', ')}.`, go: '#/ajustes' });
  return out.filter((a) => !a.id || !s.dismissed[a.id]);
}
