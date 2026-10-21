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
      'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(5,6,15,.7);z-index:1000;font-family:"Lilita One","Arial Black",sans-serif';
    const box = document.createElement('form');
    box.style.cssText =
      'background:#23284d;border:3px solid #14122b;border-radius:18px;padding:22px;width:min(86vw,360px);display:flex;flex-direction:column;gap:14px;color:#fff;text-align:center';
    const h = document.createElement('div');
    h.textContent = title;
    h.style.cssText = 'font-size:22px';
    const input = document.createElement('input');
    input.maxLength = opts.maxLength ?? 24;
    input.placeholder = opts.placeholder ?? '';
    input.autocomplete = 'off';
    input.style.cssText =
      'font:inherit;font-size:28px;text-align:center;letter-spacing:4px;padding:10px;border-radius:12px;border:3px solid #14122b;background:#fff;color:#14122b;text-transform:' +
      (opts.upper ? 'uppercase' : 'none');
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:10px';
    const mk = (label: string, bg: string, type: 'submit' | 'button') => {
      const b = document.createElement('button');
      b.type = type;
      b.textContent = label;
      b.style.cssText = `flex:1;font:inherit;font-size:20px;padding:12px;border:3px solid #14122b;border-radius:12px;color:#fff;background:${bg};cursor:pointer`;
      return b;
    };
    const cancel = mk('Cancelar', '#e0454f', 'button');
    const ok = mk('OK', '#3fbf5a', 'submit');
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
    box.onsubmit = (e) => {
      e.preventDefault();
      const v = input.value.trim();
      done(v ? (opts.upper ? v.toUpperCase() : v) : null);
    };
  });
}
