// Inicio de sesión y estado de la cuenta en la nube.
import { html, esc } from '../util.js';
import { sheet, toast } from '../ui.js';
import * as cloud from '../cloud.js';

export const requestSync = (detail = {}) => window.dispatchEvent(new CustomEvent('dinerico:sync', { detail }));

/** Hoja para entrar con Google o con email y contraseña. */
export function loginSheet({ title = 'Tu cuenta Dinerico' } = {}) {
  sheet(title, html`
    <p class="small muted">Con una cuenta tus datos se guardan también en la nube: no se pierden si borras el navegador o cambias de móvil, y puedes usar Dinerico en varios dispositivos.</p>
    <button class="btn block google" data-google><span class="g">G</span> Continuar con Google</button>
    <div class="or"><span>o con tu email</span></div>
    <form class="form" id="lf">
      <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required></label>
      <label class="field"><span>Contraseña</span><input name="pw" type="password" autocomplete="current-password" minlength="6" required></label>
      <p class="small bad" id="lerr" hidden></p>
      <div class="grid2"><button class="btn primary" data-in>Entrar</button><button type="button" class="btn" data-up>Crear cuenta</button></div>
      <button type="button" class="btn ghost small" data-reset>He olvidado la contraseña</button>
    </form>
    <p class="small muted mt">🔒 Si activas el PIN, los datos se suben cifrados con él: ni siquiera el servidor puede leerlos.</p>`, (el, close) => {
    const f = el.querySelector('#lf'); const err = el.querySelector('#lerr');
    const run = async (btn, fn, okMsg) => {
      err.hidden = true; const t = btn.textContent; btn.disabled = true; btn.textContent = '…';
      try { await fn(); close(); if (okMsg) toast(okMsg, 'ok'); }
      catch (e) { err.textContent = e.message; err.hidden = false; }
      finally { btn.disabled = false; btn.textContent = t; }
    };
    el.querySelector('[data-google]').onclick = (e) => run(e.currentTarget, () => cloud.signInGoogle(), 'Sesión iniciada');
    f.onsubmit = (e) => { e.preventDefault(); run(el.querySelector('[data-in]'), () => cloud.signInEmail(f.email.value.trim(), f.pw.value), 'Sesión iniciada'); };
    el.querySelector('[data-up]').onclick = (e) => { if (!f.reportValidity()) return; run(e.currentTarget, () => cloud.signUpEmail(f.email.value.trim(), f.pw.value), 'Cuenta creada'); };
    el.querySelector('[data-reset]').onclick = async (e) => {
      if (!f.email.value) { err.textContent = 'Escribe tu email arriba.'; err.hidden = false; return; }
      try { await cloud.resetPassword(f.email.value.trim()); toast('Te hemos enviado un email para cambiarla', 'ok'); } catch (x) { err.textContent = x.message; err.hidden = false; }
      void e;
    };
  });
}

/** Bloque para Ajustes. */
export function accountCard() {
  if (!cloud.configured()) return html`<section class="card"><h3>☁️ Cuenta y copia en la nube</h3><p class="small muted">No disponible en esta instalación: falta configurar Firebase (ver README).</p></section>`;
  const u = cloud.currentUser(); const st = cloud.getStatus();
  const stTxt = { syncing: '🔄 Sincronizando…', ok: `✅ Sincronizado${st.at ? ' · ' + new Date(st.at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : ''}`, error: `⚠️ ${st.error || 'Error al sincronizar'}`, offline: '📴 Sin conexión: se subirá al volver', idle: '' }[st.state] || '';
  if (!u) return html`<section class="card"><h3>☁️ Cuenta y copia en la nube</h3>
    <p class="small muted">Ahora tus datos solo están en este dispositivo. Crea una cuenta (con Google o email) para que se guarden siempre y sincronizar tus dispositivos.</p>
    <button class="btn primary block" data-login>Crear cuenta o iniciar sesión</button></section>`;
  return html`<section class="card"><h3>☁️ Cuenta y copia en la nube</h3>
    <p class="small">Sesión iniciada como <b>${u.email || u.name || 'usuario'}</b>${u.provider === 'google.com' ? ' (Google)' : ''}.</p>
    <p class="small muted">${stTxt}</p>
    <div class="row gap wrap"><button class="btn" data-syncnow>Sincronizar ahora</button><button class="btn ghost" data-logout>Cerrar sesión</button></div>
    <details class="mt"><summary class="small">Más opciones</summary><p class="small muted">Cerrar sesión no borra los datos de este dispositivo. Para borrar los de la nube:</p>
      <button class="btn small ghost danger" data-delcloud>Borrar mis datos de la nube</button></details></section>`;
}
export function bindAccountCard(el, confirmDlg) {
  el.querySelector('[data-login]')?.addEventListener('click', () => loginSheet());
  el.querySelector('[data-syncnow]')?.addEventListener('click', () => requestSync({ quiet: false }));
  el.querySelector('[data-logout]')?.addEventListener('click', async () => { await cloud.signOut(); toast('Sesión cerrada. Los datos siguen en este dispositivo.'); });
  el.querySelector('[data-delcloud]')?.addEventListener('click', async () => {
    if (!(await confirmDlg('Se borrarán tus datos de la nube. Los de este dispositivo se mantienen.', { ok: 'Borrar de la nube', danger: true }))) return;
    try { await cloud.deleteRemote(); toast('Datos de la nube borrados'); } catch (e) { toast(e.message, 'warn'); }
  });
}
export { esc };
