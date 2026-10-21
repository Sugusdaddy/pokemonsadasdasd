import Phaser from 'phaser';
import { isFriendlyCode, type QueueStatusMsg } from '@arena/shared';
import { L } from '../layout';
import { OnlineSession } from '../net/OnlineSession';
import { Music, Sfx } from '../systems/Sfx';
import { sy } from '../ui/style';
import * as kit from '../ui/kit';
import { t } from '../i18n';
import { BaseScene } from './BaseScene';

export type OnlineData =
  | { mode: 'ranked' }
  | { mode: 'create' }
  | { mode: 'join'; code: string }
  | { mode: 'spectate'; roomId: string }
  | { mode: 'resume' };

/** Mensaje de error para el jugador: los códigos del servidor se traducen. */
export function errorText(err: Error): string {
  const m = err.message || '';
  if (m.startsWith('err.')) return t(m);
  if (/fetch|connect|websocket|Failed|network|timeout|abort/i.test(m)) return t('online.serverDown');
  return t('online.unknownError');
}

/** Conexión con el servidor: buscar rival, sala amistosa, reconectar o entrar como espectador. */
export class OnlineScene extends BaseScene {
  private data_!: OnlineData;
  private abort = new AbortController();
  private session: OnlineSession | null = null;
  private status!: Phaser.GameObjects.Text;
  private detail!: Phaser.GameObjects.Text;
  private codeBox!: Phaser.GameObjects.Container;
  private codeT!: Phaser.GameObjects.Text;
  private spinner!: Phaser.GameObjects.Container;
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
    kit.menuBackground(this, L.w, L.h);
    kit.fadeIn(this);
    const cx = L.w / 2;
    const titles: Record<OnlineData['mode'], string> = {
      ranked: t('online.searching'),
      create: t('online.friendly'),
      join: t('online.friendly'),
      spectate: t('online.spectating'),
      resume: t('online.resuming'),
    };
    const chips: Record<OnlineData['mode'], [string, number]> = {
      ranked: [t('online.chipRanked'), kit.C.gold],
      create: [t('online.chipFriendly'), kit.C.info],
      join: [t('online.chipFriendly'), kit.C.info],
      spectate: [t('online.chipLive'), kit.C.bad],
      resume: [t('online.chipRanked'), kit.C.gold],
    };
    const pw = Math.min(L.w - 40, 680),
      ph = sy(820);
    const py = sy(230);
    kit.panel(this, cx - pw / 2, py, pw, ph, 'card');
    const rbw = Math.min(pw - 60, 520);
    kit.panel(this, cx - rbw / 2, py - 34, rbw, 70, 'blue');
    kit.text(this, cx, py, titles[this.data_.mode], 'h2', '#ffffff', { size: 36 });
    // chip del modo
    const [chipLabel, chipCol] = chips[this.data_.mode];
    const ct = kit.text(this, cx, py + 72, chipLabel, 'label', '#0b0d1f', { size: 18, dropShadow: false });
    ct.setStroke('#000000', 0);
    const cwid = ct.width + 32;
    const cg = this.add.graphics();
    cg.fillStyle(kit.C.ink).fillRoundedRect(cx - cwid / 2 - 2, py + 54, cwid + 4, 38, 19);
    cg.fillStyle(chipCol).fillRoundedRect(cx - cwid / 2, py + 56, cwid, 34, 17);
    ct.setDepth(1);

    // buscando: Pokéball girando con un halo
    this.spinner = this.add.container(cx, py + sy(250));
    const halo = this.add.image(0, 0, 'ui_glow').setTint(0x6fc0ff).setBlendMode(Phaser.BlendModes.ADD);
    halo.setDisplaySize(280, 280).setAlpha(0.45);
    const ring = this.add.graphics();
    ring.lineStyle(6, 0xffffff, 0.15).strokeCircle(0, 0, 92);
    ring.lineStyle(6, kit.C.gold, 0.9).beginPath().arc(0, 0, 92, -0.6, 0.9).strokePath();
    const ball = this.add.image(0, 0, 'ball_poke').setScale(1.2);
    this.spinner.add([halo, ring, ball]);
    this.tweens.add({ targets: ring, angle: 360, duration: 1100, repeat: -1 });
    this.tweens.add({ targets: ball, angle: -360, duration: 2400, repeat: -1 });
    this.tweens.add({ targets: halo, alpha: 0.2, yoyo: true, repeat: -1, duration: 900 });

    this.status = kit.text(this, cx, py + sy(440), t('online.connecting'), 'h3', '#ffffff', { size: 30 });
    this.detail = kit.text(this, cx, py + sy(500), '', 'body', '#aab3e8', {
      size: 21,
      wordWrap: { width: pw - 80 },
    });
    this.codeBox = this.add.container(cx, py + sy(620)).setVisible(false);
    this.codeBox.add(kit.panel(this, -190, -50, 380, 96, 'gold'));
    this.codeT = kit.text(this, 0, -4, '', 'hero', '#ffffff', { size: 64 }).setLetterSpacing(12);
    this.codeBox.add(this.codeT);

    kit.button(
      this,
      cx,
      py + ph - 70,
      320,
      92,
      L.pc ? t('online.cancelKey') : t('common.cancel'),
      'danger',
      () => this.cancel(),
      { size: 30 },
    );
    this.input.keyboard?.on('keydown-ESC', () => this.cancel());
    Music.play('lobby');
    void this.connect();
  }

  private async connect(): Promise<void> {
    const d = this.data_;
    try {
      let s: OnlineSession | null;
      if (d.mode === 'ranked') {
        this.status.setText(t('online.inQueue'));
        s = await OnlineSession.findMatch((q) => this.onQueue(q), this.abort.signal);
      } else if (d.mode === 'create') {
        s = await OnlineSession.createFriendly();
      } else if (d.mode === 'join') {
        if (!isFriendlyCode(d.code)) throw new Error('err.friendly.badCode');
        s = await OnlineSession.joinFriendly(d.code);
      } else if (d.mode === 'spectate') {
        s = await OnlineSession.spectate(d.roomId);
      } else {
        s = await OnlineSession.resume();
        if (!s) throw new Error('err.match.over');
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
        this.status.setText(d.mode === 'create' ? t('online.waitingFriend') : t('online.found'));
        s.onStart = () => this.go();
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError' || this.left) return;
      this.fail(err as Error);
    }
  }

  private onQueue(q: QueueStatusMsg): void {
    this.status.setText(t('online.inQueueSecs', { n: Math.floor(q.waitedMs / 1000) }));
    this.detail.setText(t('online.queueDetail', { n: q.window }));
  }

  private showCode(code: string): void {
    this.codeT.setText(code);
    this.codeBox.setVisible(true).setScale(0.6);
    this.tweens.add({ targets: this.codeBox, scale: 1, duration: 260, ease: 'Back.easeOut' });
    this.status.setText(t('online.waitingFriend'));
    this.detail.setText(t('online.shareCode'));
  }

  private go(): void {
    if (!this.session || this.left) return;
    const s = this.session;
    s.onStart = undefined;
    s.onCode = undefined;
    Sfx.play('fight');
    kit.goTo(this, 'Battle', { kind: 'online', session: s });
  }

  private fail(err: Error): void {
    this.tweens.killTweensOf(this.spinner.list);
    this.spinner.setAlpha(0.35);
    this.status.setText(t('online.failed')).setColor('#ff9aa2');
    this.detail.setText(errorText(err));
    if (this.data_.mode === 'ranked') {
      kit.button(
        this,
        L.w / 2,
        this.codeBox.y,
        460,
        92,
        t('online.playOffline'),
        'success',
        () => kit.goTo(this, 'Battle', { kind: 'local' }),
        { size: 30 },
      );
    }
  }

  private cancel(): void {
    if (this.left) return;
    this.left = true;
    this.abort.abort();
    this.session?.leave();
    kit.goTo(this, 'Lobby', { tab: 'battle' });
  }
}
