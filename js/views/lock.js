// Pantalla de PIN (desbloqueo y creación).
import { sheet } from '../ui.js';

function keypad(title, sub) {
  return `<div class="lock"><div class="lock-logo">🪙</div><h1>${title}</h1><p class="muted" id="lsub">${sub}</p>
    <div class="dots" id="dots"></div>
    <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-k="${n}">${n}</button>`).join('')}
      <span></span><button data-k="0">0</button><button data-k="del" aria-label="Borrar">⌫</button></div>
    <button class="btn ghost small" id="lok" hidden>Aceptar</button></div>`;
}
function wire(el, { min = 4, max = 6, auto = true, onDone }) {
  let v = '';
  const dots = el.querySelector('#dots');
  const okBtn = el.querySelector('#lok');
  const draw = () => {
    dots.innerHTML = Array.from({ length: Math.max(min, v.length) }, (_, i) => `<i class="${i < v.length ? 'on' : ''}"></i>`).join('');
    okBtn.hidden = v.length < min || (auto && v.length === max);
  };
  const press = async (k) => {
    if (k === 'del') v = v.slice(0, -1);
    else if (v.length < max) v += k;
    draw();
    if (auto && v.length === max) submit();
  };
  const submit = async () => {
    const r = await onDone(v);
    if (r === false) { el.querySelector('.dots').classList.add('shake'); setTimeout(() => el.querySelector('.dots')?.classList.remove('shake'), 400); v = ''; draw(); }
    else if (typeof r === 'string') { el.querySelector('#lsub').textContent = r; v = ''; draw(); }
  };
  el.querySelectorAll('[data-k]').forEach((b) => { b.onclick = () => press(b.dataset.k); });
  okBtn.onclick = submit;
  const onKey = (e) => {
    if (!document.body.contains(el)) { window.removeEventListener('keydown', onKey); return; }
    if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('del'); else if (e.key === 'Enter' && v.length >= min) submit();
  };
  window.addEventListener('keydown', onKey);
  draw();
}

/** Muestra la pantalla de bloqueo hasta que tryPin devuelva true. */
export function lockScreen(tryPin) {
  return new Promise((res) => {
    const el = document.createElement('div');
    el.className = 'lock-wrap';
    el.innerHTML = keypad('Dinerico', 'Introduce tu PIN');
    document.body.appendChild(el);
    let fails = 0;
    wire(el, {
      auto: false,
      onDone: async (pin) => {
        el.querySelector('#lsub').textContent = 'Comprobando…';
        const ok = await tryPin(pin);
        if (ok) { el.remove(); res(); return true; }
        fails++;
        el.querySelector('#lsub').textContent = fails >= 3 ? 'PIN incorrecto. Si lo has olvidado, solo puedes restaurar una copia sin cifrar o empezar de cero.' : 'PIN incorrecto';
        if (fails >= 3 && !el.querySelector('#reset')) {
          const b = document.createElement('button'); b.id = 'reset'; b.className = 'btn ghost small danger'; b.textContent = 'Borrar todo y empezar de cero';
          b.onclick = async () => { if (b.dataset.sure) { const { wipe } = await import('../store.js'); await wipe(); location.reload(); } else { b.dataset.sure = 1; b.textContent = 'Pulsa otra vez para confirmar: se perderán los datos'; } };
          el.querySelector('.lock').appendChild(b);
        }
        return false;
      },
    });
  });
}

/** Pide un PIN nuevo dos veces. Resuelve con el PIN o null. */
export function newPin() {
  return new Promise((res) => {
    let first = null; let done = false;
    sheet('Nuevo PIN', keypad('Crea un PIN', 'De 4 a 6 dígitos'), (el, close) => {
      wire(el, {
        auto: false,
        onDone: async (pin) => {
          if (!first) { first = pin; return 'Repítelo para confirmar'; }
          if (pin !== first) { first = null; return 'No coincide. Empieza de nuevo'; }
          done = true; res(pin); close(); return true;
        },
      });
    }, { onClose: () => { if (!done) res(null); } });
  });
}
