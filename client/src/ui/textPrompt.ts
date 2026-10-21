import { t } from '../i18n';

/**
 * Pide un texto con un campo HTML encima del canvas (Phaser no tiene cajas de texto
 * y así el móvil abre su teclado). Devuelve null si se cancela.
 */
export function textPrompt(
  title: string,
  opts: { maxLength?: number; upper?: boolean; placeholder?: string } = {},
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
    const input = document.createElement('input');
    input.maxLength = opts.maxLength ?? 24;
    input.placeholder = opts.placeholder ?? '';
    input.autocomplete = 'off';
    input.style.cssText =
      'font:inherit;font-size:28px;text-align:center;letter-spacing:4px;padding:10px;border-radius:14px;border:3px solid #0b0d1f;background:#10143a;color:#ffd75a;box-shadow:inset 0 4px 8px rgba(0,0,0,.4);outline:none;text-transform:' +
      (opts.upper ? 'uppercase' : 'none');
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
    document.body.append(wrap);
    input.focus();
    const done = (v: string | null) => {
      wrap.remove();
      resolve(v);
    };
    cancel.onclick = () => done(null);
    input.onkeydown = (e) => {
      if (e.key === 'Escape') done(null);
    };
    box.onsubmit = (e) => {
      e.preventDefault();
      const v = input.value.trim();
      done(v ? (opts.upper ? v.toUpperCase() : v) : null);
    };
  });
}
