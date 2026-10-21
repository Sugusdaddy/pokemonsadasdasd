import { W, COLORS, isFriendlyCode, type QueueStatusMsg } from '@arena/shared';
import { OnlineSession } from '../net/OnlineSession';
import { Music, Sfx } from '../systems/Sfx';
import { txt, button } from '../ui/style';
import { BaseScene } from './BaseScene';

export type OnlineData =
  | { mode: 'ranked' }
  | { mode: 'create' }
  | { mode: 'join'; code: string }
  | { mode: 'spectate'; roomId: string }
  | { mode: 'resume' };

/** Conexión con el servidor: buscar rival, sala amistosa, reconectar o entrar como espectador. */
export class OnlineScene extends BaseScene {
  private data_!: OnlineData;
  private abort = new AbortController();
  private session: OnlineSession | null = null;
  private title!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;
  private detail!: Phaser.GameObjects.Text;
  private codeT!: Phaser.GameObjects.Text;
  private ball!: Phaser.GameObjects.Image;
  private left = false;

  constructor() {
    super('Online');
  }

  init(data: OnlineData): void {
    this.data_ = data;
    this.abort = new AbortController();
    this.session = null;
    this.left = false;
    this.modalOpen = 0;
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1b1f3a');
    const titles: Record<OnlineData['mode'], string> = {
      ranked: 'Buscando rival',
      create: 'Sala amistosa',
      join: 'Sala amistosa',
      spectate: 'Entrando como espectador',
      resume: 'Volviendo a tu partida',
    };
    this.title = txt(this, W / 2, 260, titles[this.data_.mode], 50, '#ffd84a');
    this.ball = this.add.image(W / 2, 520, 'ball_poke').setScale(1.4);
    this.tweens.add({ targets: this.ball, angle: 360, duration: 1400, repeat: -1 });
    this.status = txt(this, W / 2, 700, 'Conectando…', 30);
    this.detail = txt(this, W / 2, 760, '', 22, '#c9c3ff');
    this.codeT = txt(this, W / 2, 880, '', 80, '#7dff8a');
    button(this, W / 2, 1100, 320, 96, 'Cancelar', COLORS.red, () => this.cancel(), 34);
    Music.play('lobby');
    void this.connect();
  }

  private async connect(): Promise<void> {
    const d = this.data_;
    try {
      let s: OnlineSession | null;
      if (d.mode === 'ranked') {
        this.status.setText('En la cola…');
        s = await OnlineSession.findMatch((q) => this.onQueue(q), this.abort.signal);
      } else if (d.mode === 'create') {
        s = await OnlineSession.createFriendly();
      } else if (d.mode === 'join') {
        if (!isFriendlyCode(d.code)) throw new Error('El código tiene 5 letras o números');
        s = await OnlineSession.joinFriendly(d.code);
      } else if (d.mode === 'spectate') {
        s = await OnlineSession.spectate(d.roomId);
      } else {
        s = await OnlineSession.resume();
        if (!s) throw new Error('La partida ya ha terminado');
      }
      if (this.left) {
        s.leave();
        return;
      }
      this.session = s;
      if (s.code) this.showCode(s.code);
      s.onCode = (c) => this.showCode(c);
      if (s.start) this.go();
      else {
        this.status.setText(d.mode === 'create' ? 'Esperando a tu amigo…' : '¡Rival encontrado!');
        s.onStart = () => this.go();
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError' || this.left) return;
      this.fail(err as Error);
    }
  }

  private onQueue(q: QueueStatusMsg): void {
    this.status.setText(`En la cola… ${Math.floor(q.waitedMs / 1000)} s`);
    this.detail.setText(`Rivales con ±${q.window} trofeos. Si no hay nadie, jugarás contra un bot.`);
  }

  private showCode(code: string): void {
    this.codeT.setText(code);
    this.status.setText('Esperando a tu amigo…');
    this.detail.setText('Comparte este código. Tu amigo lo escribe en Amistosa → Unirme.');
  }

  private go(): void {
    if (!this.session || this.left) return;
    const s = this.session;
    s.onStart = undefined;
    s.onCode = undefined;
    Sfx.play('fight');
    this.scene.start('Battle', { kind: 'online', session: s });
  }

  private fail(err: Error): void {
    this.tweens.killTweensOf(this.ball);
    this.ball.setAlpha(0.4);
    this.status.setText('No se pudo conectar').setColor('#ff9a9a');
    const msg = /fetch|connect|websocket|Failed/i.test(err.message) ? 'El servidor no responde.' : err.message;
    this.detail.setText(msg);
    if (this.data_.mode === 'ranked') {
      button(
        this,
        W / 2,
        960,
        460,
        96,
        'Jugar sin conexión',
        COLORS.green,
        () => this.scene.start('Battle', { kind: 'local' }),
        32,
      );
    }
  }

  private cancel(): void {
    this.left = true;
    this.abort.abort();
    this.session?.leave();
    this.scene.start('Lobby', { tab: 'battle' });
  }
}
