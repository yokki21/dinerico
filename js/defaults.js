// Estado por defecto, categorías predefinidas, perfiles y migraciones.
import { uid } from './util.js';

export const SCHEMA = 1;

// [nombre, icono, esencial, subcategorías]
const EXPENSES = [
  ['Vivienda', '🏠', true, ['Alquiler / hipoteca', 'Aportación a casa', 'Comunidad', 'Luz', 'Agua', 'Gas', 'Internet y móvil', 'Seguro hogar']],
  ['Alimentación', '🛒', true, ['Supermercado', 'Restaurantes', 'Cafés y snacks', 'Comida a domicilio']],
  ['Transporte', '🚗', true, ['Combustible / carga', 'Transporte público', 'Parking y peajes', 'Mantenimiento', 'Seguro coche', 'Renting / cuota coche', 'Taxi / VTC']],
  ['Salud y cuidado', '💊', true, ['Farmacia', 'Médico / dentista', 'Gimnasio', 'Cuidado personal']],
  ['Ocio', '🎉', false, ['Salidas', 'Viajes', 'Deporte', 'Eventos', 'Videojuegos', 'Hobbies']],
  ['Compras', '🛍️', false, ['Ropa', 'Tecnología', 'Hogar', 'Regalos']],
  ['Suscripciones', '📺', false, ['Streaming', 'Apps y software', 'Música']],
  ['Educación', '🎓', true, ['Matrícula', 'Cursos', 'Libros y material', 'Exámenes']],
  ['Finanzas', '🏦', true, ['Comisiones', 'Intereses de deuda', 'Impuestos', 'Seguros']],
  ['Mascotas', '🐾', false, ['Comida', 'Veterinario']],
  ['Otros gastos', '📦', false, []],
];
const INCOMES = [
  ['Nómina', '💼'], ['Extras y horas', '⏱️'], ['Freelance / proyectos', '🧑‍💻'],
  ['Intereses', '💶'], ['Dividendos', '📈'], ['Regalos', '🎁'], ['Reembolsos', '↩️'],
  ['Ventas', '🏷️'], ['Ayudas y becas', '🎓'], ['Otros ingresos', '➕'],
];

export function defaultCategories() {
  const out = [];
  for (const [name, icon, essential, subs] of EXPENSES) {
    const id = uid();
    out.push({ id, name, icon, kind: 'expense', parent: null, essential });
    subs.forEach((s) => out.push({ id: uid(), name: s, icon, kind: 'expense', parent: id, essential }));
  }
  for (const [name, icon] of INCOMES) out.push({ id: uid(), name, icon, kind: 'income', parent: null, essential: false });
  return out;
}

// Tramos de la base del ahorro (territorio común, 2026). Editables en Ajustes.
export const TAX_BRACKETS_ES = [
  { upTo: 6000, rate: 0.19 }, { upTo: 50000, rate: 0.21 }, { upTo: 200000, rate: 0.23 },
  { upTo: 300000, rate: 0.27 }, { upTo: null, rate: 0.30 },
];

export const PROFILES = {
  estudiante: { label: 'Estudiante', savingsRate: 0.15, emergencyMonths: 3, emergencyShare: 0.6, investShare: 0.3 },
  primerEmpleo: { label: 'Primer empleo', savingsRate: 0.25, emergencyMonths: 6, emergencyShare: 0.5, investShare: 0.5 },
  estable: { label: 'Empleo estable', savingsRate: 0.25, emergencyMonths: 6, emergencyShare: 0.4, investShare: 0.6 },
  variable: { label: 'Ingresos variables / autónomo', savingsRate: 0.2, emergencyMonths: 9, emergencyShare: 0.6, investShare: 0.4 },
  familia: { label: 'Familia', savingsRate: 0.15, emergencyMonths: 6, emergencyShare: 0.5, investShare: 0.5 },
};

export function defaultState() {
  return {
    meta: { schema: SCHEMA, createdAt: new Date().toISOString(), savedAt: null },
    settings: {
      name: '',
      currency: 'EUR',
      locale: 'es-ES',
      theme: 'auto',
      periodMode: 'calendar', // 'calendar' | 'payday'
      payday: 1,
      pinEnabled: false,
      autoLockMin: 5,
      hideAmounts: false,
      onboarded: false,
      lastBackup: null,
      backupEveryDays: 14,
      apiKeys: { alphavantage: '' },
      expectedIncome: 0,
      incomeVariable: false,
      profile: 'primerEmpleo',
      plan: { savingsRate: 0.25, emergencyMonths: 6, emergencyShare: 0.5, investShare: 0.5, investAccountId: null, emergencyGoalId: null },
      tax: { brackets: TAX_BRACKETS_ES, country: 'ES' },
      priceStaleDays: 7,
    },
    accounts: [],
    categories: defaultCategories(),
    transactions: [],
    recurring: [],
    budgets: {}, // categoryId -> importe por periodo (moneda principal)
    goals: [],
    debts: [],
    assets: [],
    trades: [],
    snapshots: [], // { period, date, assets, liabilities, netWorth }
    plans: {}, // periodKey -> { items:[{key,label,amount}], accepted }
    fx: { base: 'EUR', rates: { EUR: 1 }, date: null, manual: {} },
    dismissed: {},
  };
}

/** Completa claves que falten en estados antiguos o importados. */
export function migrate(s) {
  const d = defaultState();
  const out = { ...d, ...s };
  out.meta = { ...d.meta, ...(s.meta || {}), schema: SCHEMA };
  out.settings = { ...d.settings, ...(s.settings || {}) };
  out.settings.plan = { ...d.settings.plan, ...(s.settings?.plan || {}) };
  out.settings.tax = { ...d.settings.tax, ...(s.settings?.tax || {}) };
  out.settings.apiKeys = { ...d.settings.apiKeys, ...(s.settings?.apiKeys || {}) };
  out.fx = { ...d.fx, ...(s.fx || {}) };
  for (const k of ['accounts', 'transactions', 'recurring', 'goals', 'debts', 'assets', 'trades', 'snapshots']) {
    if (!Array.isArray(out[k])) out[k] = [];
  }
  if (!Array.isArray(out.categories) || !out.categories.length) out.categories = defaultCategories();
  for (const k of ['budgets', 'plans', 'dismissed']) if (!out[k] || typeof out[k] !== 'object') out[k] = {};
  return out;
}

export const ACCOUNT_TYPES = {
  bank: { label: 'Cuenta corriente', icon: '🏦' },
  savings: { label: 'Cuenta de ahorro / remunerada', icon: '💰' },
  cash: { label: 'Efectivo', icon: '💵' },
  broker: { label: 'Bróker / cuenta de valores', icon: '📊' },
  crypto: { label: 'Exchange / wallet cripto', icon: '🪙' },
  card: { label: 'Tarjeta de crédito', icon: '💳' },
  other: { label: 'Otra', icon: '📁' },
};

export const ASSET_KINDS = {
  fund: { label: 'Fondo / indexado', icon: '🧺', unit: true, window: 365 },
  etf: { label: 'ETF', icon: '📈', unit: true, window: 61 },
  stock: { label: 'Acción', icon: '🏢', unit: true, window: 61 },
  crypto: { label: 'Cripto', icon: '🪙', unit: true, window: 0 },
  pension: { label: 'Plan de pensiones', icon: '👴', unit: true, window: 0 },
  deposit: { label: 'Depósito a plazo', icon: '🔒', unit: false, window: 0 },
  other: { label: 'Otro bien (coche, inmueble…)', icon: '🏡', unit: false, window: 0 },
};

export const DEBT_TYPES = {
  loan: { label: 'Préstamo', icon: '🏦', liability: true },
  mortgage: { label: 'Hipoteca', icon: '🏠', liability: true },
  card: { label: 'Tarjeta / aplazado', icon: '💳', liability: true },
  renting: { label: 'Renting / leasing', icon: '🚗', liability: false },
  personal: { label: 'Con una persona', icon: '🤝', liability: true },
};

export const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'HUF', 'DKK', 'SEK', 'NOK', 'PLN', 'CZK', 'JPY', 'CAD', 'AUD', 'MXN', 'BRL', 'ARS', 'COP', 'CLP'];
