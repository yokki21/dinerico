// Componentes de interfaz: hoja inferior, diálogos, avisos, campos de formulario.
import { html, raw, esc, num } from './util.js';

const $ = (sel, el = document) => el.querySelector(sel);

// ---------- Toast ----------
export function toast(msg, kind = '') {
  const t = document.createElement('div');
  t.className = `toast ${kind}`; t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2600);
}

// ---------- Hoja inferior (modal) ----------
let sheetStack = [];
/**
 * Abre una hoja con contenido HTML. `onMount(el, close)` para enlazar eventos.
 * Devuelve una función para cerrarla.
 */
export function sheet(title, body, onMount, { wide = false, onClose } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet-bg"></div>
    <div class="sheet ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-head"><div class="grab"></div><h2>${esc(title)}</h2>
        <button class="icon-btn" data-close aria-label="Cerrar">✕</button></div>
      <div class="sheet-body">${String(body)}</div></div>`;
  document.body.appendChild(wrap);
  document.body.classList.add('noscroll');
  requestAnimationFrame(() => wrap.classList.add('open'));
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    onClose?.();
    wrap.classList.remove('open');
    sheetStack = sheetStack.filter((x) => x !== close);
    if (!sheetStack.length) document.body.classList.remove('noscroll');
    setTimeout(() => wrap.remove(), 220);
  };
  sheetStack.push(close);
  wrap.querySelector('.sheet-bg').onclick = close;
  wrap.querySelector('[data-close]').onclick = close;
  const first = wrap.querySelector('input:not([type=hidden]):not([type=checkbox]),select,textarea');
  if (first && !first.dataset.noautofocus && window.matchMedia('(pointer:fine)').matches) setTimeout(() => first.focus(), 250);
  onMount?.(wrap.querySelector('.sheet-body'), close);
  return close;
}
export const closeAllSheets = () => [...sheetStack].forEach((c) => c());
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheetStack.length) sheetStack.at(-1)(); });

export function confirmDlg(text, { ok = 'Aceptar', danger = false } = {}) {
  return new Promise((res) => {
    let done = false;
    sheet('Confirmar', `<p>${esc(text)}</p>
      <div class="row gap end mt"><button class="btn ghost" data-no>Cancelar</button>
      <button class="btn ${danger ? 'danger' : 'primary'}" data-yes>${esc(ok)}</button></div>`, (el, cl) => {
      el.querySelector('[data-no]').onclick = () => { done = true; res(false); cl(); };
      el.querySelector('[data-yes]').onclick = () => { done = true; res(true); cl(); };
    }, { onClose: () => { if (!done) res(false); } });
  });
}

export function promptDlg(title, { label = '', value = '', type = 'text', placeholder = '' } = {}) {
  return new Promise((res) => {
    sheet(title, `<form class="form">${field({ name: 'v', label, value, type, placeholder })}
      <div class="row gap end"><button type="button" class="btn ghost" data-no>Cancelar</button><button class="btn primary">Aceptar</button></div></form>`,
    (el, cl) => {
      el.querySelector('[data-no]').onclick = () => { res(null); cl(); };
      el.querySelector('form').onsubmit = (e) => { e.preventDefault(); res(el.querySelector('[name=v]').value); cl(); };
    });
  });
}

// ---------- Campos ----------
export function field({ name, label, type = 'text', value = '', placeholder = '', required = false, step, min, max, hint = '', attrs = '', inputmode }) {
  const im = inputmode || (type === 'money' ? 'decimal' : '');
  const t = type === 'money' ? 'text' : type;
  const v = type === 'money' && value !== '' && value != null ? String(value).replace('.', ',') : value;
  return html`<label class="field"><span>${label}</span>
    <input name="${name}" type="${t}" value="${v ?? ''}" placeholder="${placeholder}" ${raw(required ? 'required' : '')}
      ${raw(step ? `step="${step}"` : '')} ${raw(min != null ? `min="${min}"` : '')} ${raw(max != null ? `max="${max}"` : '')}
      ${raw(im ? `inputmode="${im}"` : '')} ${raw(type === 'money' ? 'data-money autocomplete="off"' : '')} ${raw(attrs)}>
    ${hint ? html`<small>${hint}</small>` : ''}</label>`;
}
export function select({ name, label, options, value = '', hint = '', attrs = '' }) {
  // options: [{value, label, group?}] o [[value,label]]
  const opts = options.map((o) => (Array.isArray(o) ? { value: o[0], label: o[1] } : o));
  const groups = {}; const order = [];
  for (const o of opts) { const g = o.group || ''; if (!groups[g]) { groups[g] = []; order.push(g); } groups[g].push(o); }
  const inner = order.map((g) => {
    const os = groups[g].map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(value) ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
    return g ? `<optgroup label="${esc(g)}">${os}</optgroup>` : os;
  }).join('');
  return html`<label class="field"><span>${label}</span><select name="${name}" ${raw(attrs)}>${raw(inner)}</select>
    ${hint ? html`<small>${hint}</small>` : ''}</label>`;
}
export function checkbox({ name, label, checked = false, hint = '' }) {
  return html`<label class="check"><input type="checkbox" name="${name}" ${raw(checked ? 'checked' : '')}><span>${label}${hint ? html`<small>${hint}</small>` : ''}</span></label>`;
}
export function segmented(name, options, value) {
  return html`<div class="seg" role="radiogroup">${options.map(([v, l]) => html`<label><input type="radio" name="${name}" value="${v}" ${raw(String(v) === String(value) ? 'checked' : '')}><span>${l}</span></label>`)}</div>`;
}
/** Lee un formulario a objeto. Los campos data-money se convierten a número. */
export function readForm(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') o[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
    else if (el.dataset.money !== undefined || el.type === 'number') o[el.name] = el.value === '' ? null : num(el.value);
    else o[el.name] = el.value;
  }
  return o;
}
export { $ };
