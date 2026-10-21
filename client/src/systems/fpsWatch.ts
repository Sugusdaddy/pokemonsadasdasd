/**
 * Vigila los FPS en batalla (para la calidad Auto). Ventanas de 1 s; si 4 seguidas van por
 * debajo de 45 fps (sin contar los primeros segundos ni las pausas de la pestaña), avisa una
 * vez. Sin dependencias, para poder probarlo.
 */
export class FpsWatch {
  private acc = 0;
  private frames = 0;
  private slow = 0;
  private skip = 3; // los primeros segundos (carga, intro) no cuentan
  private done = false;

  constructor(
    private readonly onSlow: () => void,
    /** ¿Hay que vigilar? (solo en Auto y si aún no se bajó). */
    private readonly enabled: () => boolean,
    /** ¿La pestaña está a la vista? (si no, el navegador frena y no cuenta). */
    private readonly visible: () => boolean = () => document.visibilityState === 'visible',
    readonly minFps = 45,
    readonly windows = 4,
  ) {}

  /** Llamar cada fotograma con el tiempo real transcurrido (ms). */
  frame(deltaMs: number): void {
    if (this.done || !this.enabled()) return;
    if (deltaMs > 250 || !this.visible()) return; // pausa: no cuenta
    this.acc += deltaMs;
    this.frames++;
    if (this.acc < 1000) return;
    const fps = (this.frames * 1000) / this.acc;
    this.acc = 0;
    this.frames = 0;
    if (this.skip > 0) {
      this.skip--;
      return;
    }
    this.slow = fps < this.minFps ? this.slow + 1 : 0;
    if (this.slow >= this.windows) {
      this.done = true;
      this.onSlow();
    }
  }
}
