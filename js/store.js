// Persistencia local (IndexedDB con respaldo en localStorage), cifrado con PIN y copias.
import { defaultState, migrate } from './defaults.js';
import { debounce, today } from './util.js';

const DB_NAME = 'dinerico';
const STORE = 'kv';
const KEY = 'state';
const LS_KEY = 'dinerico-state';

// ---------- IndexedDB mínimo ----------
function idb() {
  return new Promise((res, rej) => {
    if (!('indexedDB' in window)) return rej(new Error('sin IndexedDB'));
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet(k) {
  const db = await idb();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE).objectStore(STORE).get(k);
    t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error);
  });
}
async function idbSet(k, v) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(v, k);
    tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
  });
}
async function rawGet() {
  try { const v = await idbGet(KEY); if (v) return v; } catch { /* usa localStorage */ }
  try { const s = localStorage.getItem(LS_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}
async function rawSet(rec) {
  let ok = false;
  try { await idbSet(KEY, rec); ok = true; } catch { /* ignora */ }
  try { localStorage.setItem(LS_KEY, JSON.stringify(rec)); ok = true; } catch { /* cuota llena */ }
  if (!ok) throw new Error('No se pudo guardar en este navegador');
}

// ---------- Cifrado (PBKDF2 + AES-GCM) ----------
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
function b64big(buf) { // evita desbordar la pila con datos grandes
  const u = new Uint8Array(buf); let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function deriveKey(pin, saltB64) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: unb64(saltB64), iterations: 250000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function encrypt(obj, key, salt) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return { app: 'dinerico', v: 1, enc: true, salt, iv: b64(iv), data: b64big(ct) };
}
async function decrypt(rec, key) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(rec.iv) }, key, unb64(rec.data));
  return JSON.parse(dec.decode(pt));
}
const newSalt = () => b64(crypto.getRandomValues(new Uint8Array(16)));

// ---------- Estado de la sesión ----------
let state = null;
let cryptoKey = null;
let salt = null;
const listeners = new Set();

export const getState = () => state;
export const isEncrypted = () => !!cryptoKey;
export const onChange = (fn) => listeners.add(fn);

/** Devuelve 'new' | 'locked' | 'ready' */
export async function boot() {
  const rec = await rawGet();
  if (!rec) { state = defaultState(); return 'new'; }
  if (rec.enc) { salt = rec.salt; return 'locked'; }
  state = migrate(rec.state ?? rec);
  return 'ready';
}

export async function unlock(pin) {
  const rec = await rawGet();
  const key = await deriveKey(pin, rec.salt);
  try {
    state = migrate(await decrypt(rec, key));
  } catch {
    return false;
  }
  cryptoKey = key; salt = rec.salt;
  return true;
}

export function lock() { state = null; cryptoKey = null; }

let persistHook = null;
/** Se llama tras cada guardado local con el registro guardado (lo usa la sincronización). */
export const onPersist = (fn) => { persistHook = fn; };

let dirty = false;
async function persistNow({ touch = true } = {}) {
  if (!state) return;
  dirty = false;
  if (touch) state.meta.savedAt = new Date().toISOString();
  const rec = cryptoKey ? await encrypt(state, cryptoKey, salt) : { app: 'dinerico', v: 1, enc: false, state };
  rec.savedAt = state.meta.savedAt;
  await rawSet(rec);
  if (touch) persistHook?.(rec);
}
/** Registro tal y como está guardado (cifrado si hay PIN). */
export const getRecord = () => rawGet();
/** Sustituye los datos locales por un registro (p. ej. el de la nube) y vuelve a arrancar. */
export async function adoptRecord(rec) {
  await rawSet(rec);
  if (rec.enc && cryptoKey && rec.salt === salt) {
    try { state = migrate(await decrypt(rec, cryptoKey)); listeners.forEach((l) => l(state)); return 'ready'; } catch { /* otro PIN */ }
  }
  state = null; cryptoKey = null; salt = null;
  const r = await boot();
  if (r === 'ready') listeners.forEach((l) => l(state));
  return r;
}
/** Marca de qué fue lo último sincronizado, fuera del estado para no alterar savedAt. */
export const syncMark = {
  get() { try { return JSON.parse(localStorage.getItem('dinerico-sync') || '{}'); } catch { return {}; } },
  set(v) { try { localStorage.setItem('dinerico-sync', JSON.stringify(v)); } catch { /* */ } },
};
const persistSoon = debounce(() => persistNow().catch((e) => console.error(e)), 250);

/** Aplica un cambio al estado, guarda y notifica. */
export function update(fn, { silent = false } = {}) {
  fn(state);
  dirty = true;
  persistSoon();
  if (!silent) listeners.forEach((l) => l(state));
}
/** Guarda ya si hay cambios pendientes (al salir de la app o bloquear). */
export const save = () => (dirty ? persistNow() : Promise.resolve());

export function replaceState(s) {
  state = migrate(s); dirty = true;
  persistSoon();
  listeners.forEach((l) => l(state));
}

export async function setPin(pin) {
  if (!pin) { cryptoKey = null; salt = null; state.settings.pinEnabled = false; await persistNow(); return; }
  salt = newSalt();
  cryptoKey = await deriveKey(pin, salt);
  state.settings.pinEnabled = true;
  await persistNow();
}

export async function wipe() {
  try { const db = await idb(); db.transaction(STORE, 'readwrite').objectStore(STORE).delete(KEY); } catch { /* */ }
  try { localStorage.removeItem(LS_KEY); localStorage.removeItem('dinerico-sync'); localStorage.removeItem('dinerico-wizard'); } catch { /* */ }
  state = defaultState(); cryptoKey = null; salt = null;
}

export async function requestPersistence() {
  try { if (navigator.storage?.persist) return await navigator.storage.persist(); } catch { /* */ }
  return false;
}

// ---------- Copias de seguridad ----------
export async function exportBackup({ encrypted = true } = {}) {
  const copy = { ...state };
  const rec = encrypted && cryptoKey ? await encrypt(copy, cryptoKey, salt)
    : { app: 'dinerico', v: 1, enc: false, state: copy };
  rec.exportedAt = new Date().toISOString();
  const blob = new Blob([JSON.stringify(rec)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `dinerico-copia-${today()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  update((s) => { s.settings.lastBackup = today(); });
}

/** Lee un archivo de copia. Si está cifrado hace falta el PIN con el que se exportó. */
export async function readBackup(text, pin) {
  const rec = JSON.parse(text);
  if (rec.app !== 'dinerico') throw new Error('El archivo no es una copia de Dinerico');
  if (!rec.enc) return migrate(rec.state);
  if (!pin) { const e = new Error('PIN requerido'); e.needPin = true; throw e; }
  const key = await deriveKey(pin, rec.salt);
  try { return migrate(await decrypt(rec, key)); }
  catch { throw new Error('PIN incorrecto para esta copia'); }
}
