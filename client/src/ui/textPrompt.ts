import { t } from '../i18n';

/**
 * Pide un texto con un campo HTML encima del canvas (Phaser no tiene cajas de texto
 * y así el móvil abre su teclado). Devuelve null si se cancela.
 */
export function textPrompt(
  title: string,
  opts: {
    maxLength?: number;
    upper?: boolean;
    placeholder?: string;
    value?: string;
    /** code: letras grandes centradas (códigos); text: una línea normal; long: varias líneas. */
    kind?: 'code' | 'text' | 'long';
    /** Aceptar el texto vacío (p. ej. para borrar una respuesta). */
    allowEmpty?: boolean;
  } = {},
): Promise<string | null> {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.style.cssText =
      'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(11,13,31,.72);backdrop-filter:blur(3px);z-index:1000;font-family:"Lilita One","Arial Black",sans-serif';
    const box = document.createElement('form');
    box.style.cssText =
      'background:linear-gradient(#2f3a86,#222a66);border:4px solid #0b0d1f;border-radius:22px;box-shadow:inset 0 0 0 2px rgba(88,103,196,.55),0 8px 0 rgba(11,13,31,.45);padding:24px;width:min(86vw,380px);display:flex;flex-direction:column;gap:16px;color:#fff;text-align:center';
    const h = document.createElement('div');
    h.textContent = title;
    h.style.cssText = 'font-size:26px;text-shadow:0 3px 0 #0b0d1f';
    const kind = opts.kind ?? 'code';
    const input = document.createElement(kind === 'long' ? 'textarea' : 'input');
    if (input instanceof HTMLTextAreaElement) input.rows = 5;
    input.maxLength = opts.maxLength ?? 24;
    input.placeholder = opts.placeholder ?? '';
    input.value = opts.value ?? '';
    input.autocomplete = 'off';
    const field =
      'padding:10px;border-radius:14px;border:3px solid #0b0d1f;background:#10143a;box-shadow:inset 0 4px 8px rgba(0,0,0,.4);outline:none;';
    input.style.cssText =
      kind === 'code'
        ? `${field}font:inherit;font-size:28px;text-align:center;letter-spacing:4px;color:#ffd75a;text-transform:${opts.upper ? 'uppercase' : 'none'}`
        : `${field}font:500 19px Rubik,system-ui,sans-serif;text-align:left;color:#fff;resize:none;line-height:1.35`;
    if (kind !== 'code') box.style.width = 'min(92vw,560px)';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:10px';
    const mk = (label: string, bg: string, type: 'submit' | 'button') => {
      const b = document.createElement('button');
      b.type = type;
      b.textContent = label;
      b.style.cssText = `flex:1;font:inherit;font-size:22px;padding:12px;border:3px solid #0b0d1f;border-radius:14px;color:#fff;background:${bg};box-shadow:inset 0 3px 0 rgba(255,255,255,.35),0 5px 0 rgba(11,13,31,.6);text-shadow:0 2px 0 #0b0d1f;cursor:pointer`;
      return b;
    };
    const cancel = mk(t('common.cancel'), 'linear-gradient(#ff7a80,#d23544)', 'button');
    const ok = mk(t('common.ok'), 'linear-gradient(#6fe38f,#23a456)', 'submit');
    row.append(cancel, ok);
    box.append(h, input, row);
    wrap.append(box);
    // Phaser escucha los clics en toda la ventana: sin esto, tocar la caja (o sus botones)
    // también pulsaría lo que haya debajo en el juego
    for (const ev of ['mousedown', 'mouseup', 'touchstart', 'touchend', 'pointerdown', 'pointerup', 'wheel'])
      wrap.addEventListener(ev, (e) => e.stopPropagation());
    document.body.append(wrap);
    input.focus();
    const done = (v: string | null) => {
      wrap.remove();
      resolve(v);
    };
    cancel.onclick = () => done(null);
    input.onkeydown = (e) => {
      if (e.key === 'Escape') done(null);
      // en varias líneas, Ctrl+Intro envía
      else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && kind === 'long') box.requestSubmit();
    };
    box.onsubmit = (e) => {
      e.preventDefault();
      const v = input.value.trim();
      done(v || opts.allowEmpty ? (opts.upper ? v.toUpperCase() : v) : null);
    };
  });
}
