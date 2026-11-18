// Precios y tipos de cambio en línea. Todo es opcional: si falla, se usa el valor manual.
import { today } from './util.js';

async function getJSON(url, ms = 10000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

/** Tipos del BCE vía Frankfurter: unidades de cada divisa por 1 de la moneda principal. */
export async function fetchFx(baseCur) {
  const urls = [
    `https://api.frankfurter.dev/v1/latest?base=${baseCur}`,
    `https://api.frankfurter.app/latest?from=${baseCur}`,
  ];
  let lastErr;
  for (const u of urls) {
    try {
      const j = await getJSON(u);
      return { base: baseCur, rates: { ...j.rates, [baseCur]: 1 }, date: j.date || today() };
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('Sin respuesta');
}

/** CoinGecko (sin clave). ids: ['bitcoin','ethereum'] → { bitcoin: 61234.5, ... } en `cur`. */
export async function fetchCrypto(ids, cur) {
  if (!ids.length) return {};
  const c = cur.toLowerCase();
  const j = await getJSON(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids.join(','))}&vs_currencies=${c}`);
  const out = {};
  for (const id of ids) if (j[id]?.[c] != null) out[id] = j[id][c];
  return out;
}
export async function searchCrypto(q) {
  const j = await getJSON(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`);
  return (j.coins || []).slice(0, 8).map((c) => ({ id: c.id, name: c.name, symbol: c.symbol }));
}

/** Alpha Vantage (clave gratuita del usuario). Devuelve el último precio en la moneda del mercado. */
export async function fetchQuote(symbol, key) {
  const j = await getJSON(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(key)}`);
  const p = parseFloat(j?.['Global Quote']?.['05. price']);
  if (!Number.isFinite(p)) throw new Error(j?.Note || j?.Information || 'Símbolo no encontrado');
  return { price: p, date: j['Global Quote']['07. latest trading day'] || today() };
}
export async function searchSymbol(q, key) {
  const j = await getJSON(`https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(q)}&apikey=${encodeURIComponent(key)}`);
  return (j.bestMatches || []).slice(0, 8).map((m) => ({ symbol: m['1. symbol'], name: m['2. name'], region: m['4. region'], currency: m['8. currency'] }));
}

/** Actualiza todos los activos con fuente automática. Devuelve { ok, fail: [{name, error}] }. */
export async function refreshPrices(s) {
  const res = { ok: 0, fail: [] };
  const crypto = s.assets.filter((a) => !a.closed && a.source === 'coingecko' && a.sourceId);
  if (crypto.length) {
    const byCur = {};
    crypto.forEach((a) => { (byCur[a.currency] ||= []).push(a); });
    for (const [cur, list] of Object.entries(byCur)) {
      try {
        const px = await fetchCrypto([...new Set(list.map((a) => a.sourceId))], cur);
        for (const a of list) {
          if (px[a.sourceId] != null) { a.price = px[a.sourceId]; a.priceDate = today(); res.ok++; }
          else res.fail.push({ name: a.name, error: 'sin precio' });
        }
      } catch (e) { list.forEach((a) => res.fail.push({ name: a.name, error: e.message })); }
    }
  }
  const key = s.settings.apiKeys?.alphavantage;
  const stocks = s.assets.filter((a) => !a.closed && a.source === 'alphavantage' && a.sourceId);
  for (const a of stocks) {
    if (!key) { res.fail.push({ name: a.name, error: 'falta la clave de Alpha Vantage' }); continue; }
    try { const q = await fetchQuote(a.sourceId, key); a.price = q.price; a.priceDate = q.date; res.ok++; }
    catch (e) { res.fail.push({ name: a.name, error: e.message }); }
  }
  return res;
}
