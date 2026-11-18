// Cuenta en la nube (Firebase: Google o email) y sincronización de los datos.
// Se guarda el mismo registro que en el dispositivo: si hay PIN, va cifrado y el servidor no puede leerlo.
import { firebaseConfig } from './cloud-config.js';
import * as store from './store.js';

const SDK = 'https://www.gstatic.com/firebasejs/12.15.0/';
const CHUNK = 700000; // caracteres por documento (Firestore admite ~1 MiB)

let backend = null;
let user = null;
let ready = null;
const subs = new Set();
const status = { state: 'idle', at: null, error: null }; // idle | syncing | ok | error | offline
const statusSubs = new Set();
const setStatus = (st, error = null) => { status.state = st; status.error = error; if (st === 'ok') status.at = new Date().toISOString(); statusSubs.forEach((f) => f(status)); };

export const configured = () => !!(window.__DINERICO_CLOUD_MOCK__ || firebaseConfig?.apiKey);
export const currentUser = () => user;
export const getStatus = () => status;
export const onStatus = (fn) => statusSubs.add(fn);
export const onUser = (fn) => { subs.add(fn); if (ready) fn(user); };

// ---------- Firebase ----------
async function firebaseBackend(cfg) {
  const [appM, authM, fs] = await Promise.all([
    import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js'),
  ]);
  const app = appM.initializeApp(cfg);
  const auth = authM.getAuth(app);
  auth.languageCode = 'es';
  const db = fs.getFirestore(app);
  try { await authM.getRedirectResult(auth); } catch { /* sin redirección pendiente */ }
  const simple = (u) => (u ? { uid: u.uid, email: u.email, name: u.displayName, provider: u.providerData?.[0]?.providerId } : null);
  return {
    onUser: (cb) => authM.onAuthStateChanged(auth, (u) => cb(simple(u))),
    async google() {
      const p = new authM.GoogleAuthProvider();
      p.setCustomParameters({ prompt: 'select_account' });
      try { await authM.signInWithPopup(auth, p); }
      catch (e) {
        if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment'].includes(e.code)) await authM.signInWithRedirect(auth, p);
        else throw e;
      }
    },
    emailIn: (e, pw) => authM.signInWithEmailAndPassword(auth, e, pw),
    emailUp: (e, pw) => authM.createUserWithEmailAndPassword(auth, e, pw),
    reset: (e) => authM.sendPasswordResetEmail(auth, e),
    signOut: () => authM.signOut(auth),
    async readMeta(uid) { const d = await fs.getDoc(fs.doc(db, 'users', uid)); return d.exists() ? d.data() : null; },
    async readChunks(uid, n) {
      const parts = await Promise.all(Array.from({ length: n }, (_, i) => fs.getDoc(fs.doc(db, 'users', uid, 'chunks', 'c' + i))));
      return parts.map((d) => d.data()?.d || '').join('');
    },
    async write(uid, meta, chunks, oldN = 0) {
      const b = fs.writeBatch(db);
      chunks.forEach((d, i) => b.set(fs.doc(db, 'users', uid, 'chunks', 'c' + i), { d }));
      for (let i = chunks.length; i < oldN; i++) b.delete(fs.doc(db, 'users', uid, 'chunks', 'c' + i));
      b.set(fs.doc(db, 'users', uid), meta);
      await b.commit();
    },
    async remove(uid, n) {
      const b = fs.writeBatch(db);
      for (let i = 0; i < n; i++) b.delete(fs.doc(db, 'users', uid, 'chunks', 'c' + i));
      b.delete(fs.doc(db, 'users', uid)); await b.commit();
    },
  };
}

export function init() {
  if (!configured()) return Promise.resolve(false);
  if (ready) return ready;
  ready = (async () => {
    try {
      backend = window.__DINERICO_CLOUD_MOCK__ || await firebaseBackend(firebaseConfig);
      await new Promise((res) => { let first = true; backend.onUser((u) => { user = u; subs.forEach((f) => f(u)); if (first) { first = false; res(); } }); });
      return true;
    } catch (e) {
      console.warn('Nube no disponible', e); setStatus('offline', 'Sin conexión con el servidor'); ready = null; return false;
    }
  })();
  return ready;
}

const need = async () => { if (!(await init())) throw new Error('No se pudo conectar. Revisa tu conexión.'); };
const errMsg = (e) => ({
  'auth/invalid-credential': 'Email o contraseña incorrectos.', 'auth/wrong-password': 'Contraseña incorrecta.', 'auth/user-not-found': 'No hay ninguna cuenta con ese email.',
  'auth/email-already-in-use': 'Ya existe una cuenta con ese email: inicia sesión.', 'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
  'auth/invalid-email': 'El email no es válido.', 'auth/popup-closed-by-user': 'Has cerrado la ventana de Google.', 'auth/network-request-failed': 'Sin conexión.',
  'auth/unauthorized-domain': 'Este dominio no está autorizado en Firebase (Authentication › Settings › Authorized domains).',
  'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos.',
}[e?.code] || e?.message || 'Error desconocido');
const wrap = (fn) => async (...a) => { await need(); try { return await fn(...a); } catch (e) { throw new Error(errMsg(e)); } };
export const signInGoogle = wrap(() => backend.google());
export const signInEmail = wrap((e, p) => backend.emailIn(e, p));
export const signUpEmail = wrap((e, p) => backend.emailUp(e, p));
export const resetPassword = wrap((e) => backend.reset(e));
export const signOut = wrap(() => backend.signOut());

// ---------- Datos ----------
async function upload(rec) {
  const text = JSON.stringify(rec);
  const chunks = []; for (let i = 0; i < text.length; i += CHUNK) chunks.push(text.slice(i, i + CHUNK));
  const old = await backend.readMeta(user.uid);
  const meta = { v: 1, n: chunks.length, savedAt: rec.savedAt || new Date().toISOString(), enc: !!rec.enc, size: text.length, updatedAt: new Date().toISOString() };
  await backend.write(user.uid, meta, chunks, old?.n || 0);
  store.syncMark.set({ uid: user.uid, savedAt: meta.savedAt });
}
async function download(meta) {
  const text = await backend.readChunks(user.uid, meta.n);
  const rec = JSON.parse(text);
  if (rec.app !== 'dinerico') throw new Error('Datos de la nube no válidos');
  return rec;
}

let timer = null;
/** Sube los cambios unos segundos después de guardar. */
export function queueUpload(rec) {
  if (!user || !backend) return;
  clearTimeout(timer);
  timer = setTimeout(async () => {
    if (!navigator.onLine) { setStatus('offline'); return; }
    setStatus('syncing');
    try { await upload(rec); setStatus('ok'); } catch (e) { setStatus('error', errMsg(e)); }
  }, 2500);
}

/**
 * Compara el dispositivo con la nube. Devuelve:
 * 'none' (no hay sesión), 'uploaded', 'adopted' (se cargaron los datos de la nube), 'same', o
 * { conflict: true, local, remote } si ambos han cambiado desde la última sincronización.
 */
export async function reconcile({ prefer = null } = {}) {
  if (!user || !backend) return 'none';
  if (!navigator.onLine) { setStatus('offline'); return 'offline'; }
  setStatus('syncing');
  try {
    const meta = await backend.readMeta(user.uid);
    const local = await store.getRecord();
    const mark = store.syncMark.get();
    const localEmpty = !local || (!local.enc && !local.state?.settings?.onboarded && !local.state?.transactions?.length);
    let result;
    if (!meta) {
      if (localEmpty) result = 'empty'; else { await upload(local); result = 'uploaded'; }
    } else if (localEmpty || prefer === 'remote') {
      await store.adoptRecord(await download(meta)); store.syncMark.set({ uid: user.uid, savedAt: meta.savedAt }); result = 'adopted';
    } else if (prefer === 'local') {
      await upload(local); result = 'uploaded';
    } else if (meta.savedAt === local.savedAt) {
      store.syncMark.set({ uid: user.uid, savedAt: meta.savedAt }); result = 'same';
    } else {
      const sameUser = mark.uid === user.uid;
      const remoteChanged = !sameUser || meta.savedAt !== mark.savedAt;
      const localChanged = !sameUser || local.savedAt !== mark.savedAt;
      if (remoteChanged && !localChanged) { await store.adoptRecord(await download(meta)); store.syncMark.set({ uid: user.uid, savedAt: meta.savedAt }); result = 'adopted'; }
      else if (localChanged && !remoteChanged) { await upload(local); result = 'uploaded'; }
      else { setStatus('idle'); return { conflict: true, local: local.savedAt, remote: meta.savedAt }; }
    }
    setStatus('ok');
    return result;
  } catch (e) { setStatus('error', errMsg(e)); throw new Error(errMsg(e)); }
}

/** Borra los datos de la nube de esta cuenta (no los del dispositivo). */
export async function deleteRemote() {
  await need(); const meta = await backend.readMeta(user.uid);
  if (meta) await backend.remove(user.uid, meta.n || 0);
  store.syncMark.set({});
}
