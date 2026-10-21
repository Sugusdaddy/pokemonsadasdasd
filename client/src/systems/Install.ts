// ─────────────────────────────────────────────────────────────
//  INSTALAR COMO APP (PWA).
//  Chrome, Edge y Android avisan con `beforeinstallprompt` cuando se puede instalar: se
//  guarda el aviso y Perfil enseña el botón "Instalar app". En iPhone/iPad no existe: allí
//  se explica cómo hacerlo desde Compartir → Añadir a pantalla de inicio.
// ─────────────────────────────────────────────────────────────

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPrompt | null = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // sin la barra automática del navegador: el botón está en Perfil
  deferred = e as InstallPrompt;
});
window.addEventListener('appinstalled', () => {
  deferred = null;
});

/** ¿Ya se está jugando desde la app instalada? */
export const installed = (): boolean =>
  matchMedia('(display-mode: standalone)').matches ||
  matchMedia('(display-mode: fullscreen)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export const canInstall = (): boolean => !!deferred && !installed();

/** iPhone/iPad (los iPad nuevos dicen ser un Mac con pantalla táctil) y sin instalar. */
export const iosInstallHint = (): boolean =>
  !installed() &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

/** Abre el diálogo del navegador. true si el jugador acepta. */
export async function promptInstall(): Promise<boolean> {
  const p = deferred;
  if (!p) return false;
  deferred = null; // el aviso solo se puede usar una vez
  await p.prompt();
  return (await p.userChoice).outcome === 'accepted';
}

/** Registra el service worker (solo en la versión compilada: en desarrollo estorbaría a Vite). */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* sin service worker se juega igual, solo que no funciona sin red */
    });
  });
}
