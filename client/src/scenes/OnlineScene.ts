import Phaser from 'phaser';
import {
  liveCard,
  isFriendlyCode,
  type ClientJoin,
  type DraftMsg,
  type LobbyMsg,
  type QueueStatusMsg,
} from '@arena/shared';
import { makeCardView } from '../ui/CardView';
import { L } from '../layout';
import { OnlineSession } from '../net/OnlineSession';
import { Music, Sfx } from '../systems/Sfx';
import { sy } from '../ui/style';
import * as kit from '../ui/kit';
import { t } from '../i18n';
import { BaseScene } from './BaseScene';
import { Social } from '../net/social';

export type OnlineData =
  | { mode: 'ranked' }
  | { mode: 'draft' }
  | { mode: 'challenge' }
  | { mode: 'tournament'; tournamentId: string; name: string }
  | { mode: '2v2' }
  | { mode: 'create2v2' }
  | { mode: 'create'; inviteTo?: { accountId: string; name: string } }
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
  /** Pantalla de elegir cartas (draft). */
  private draftUi: Phaser.GameObjects.Container | null = null;
  private draftTimer: Phaser.Time.TimerEvent | null = null;
  /** Sala 2v2 con amigos: quién hay y el botón de empezar. */
  private lobbyUi: Phaser.GameObjects.Container | null = null;
  private py = 0;

  constructor() {
    super('Online');
  }

  init(data: OnlineData): void {
    this.data_ = data;
    this.abort = new AbortController();
    this.session = null;
    this.left = false;
    this.modalOpen = 0;
    this.draftUi = null;
    this.draftTimer = null;
    this.lobbyUi = null;
  }

  create(): void {
    kit.menuBackground(this, L.w, L.h);
    kit.fadeIn(this);
    const cx = L.w / 2;
    const titles: Record<OnlineData['mode'], string> = {
      ranked: t('online.searching'),
      draft: t('online.draft'),
      challenge: t('online.challenge'),
      tournament: this.data_.mode === 'tournament' ? this.data_.name : '',
      '2v2': t('online.team'),
      create2v2: t('online.teamRoom'),
      create: t('online.friendly'),
      join: t('online.friendly'),
      spectate: t('online.spectating'),
      resume: t('online.resuming'),
    };
    const chips: Record<OnlineData['mode'], [string, number]> = {
      ranked: [t('online.chipRanked'), kit.C.gold],
      draft: [t('online.chipDraft'), 0xc58cff],
      challenge: [t('online.chipChallenge'), 0xff9a3c],
      tournament: [t('online.chipTournament'), 0x44d17a],
      '2v2': [t('online.chipTeam'), 0x5cc8ff],
      create2v2: [t('online.chipTeam'), 0x5cc8ff],
      create: [t('online.chipFriendly'), kit.C.info],
      join: [t('online.chipFriendly'), kit.C.info],
      spectate: [t('online.chipLive'), kit.C.bad],
      resume: [t('online.chipRanked'), kit.C.gold],
    };
    const pw = Math.min(L.w - 40, 680),
      ph = sy(820);
    const py = sy(230);
    this.py = py;
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
      if (
        d.mode === 'ranked' ||
        d.mode === 'draft' ||
        d.mode === 'challenge' ||
        d.mode === 'tournament' ||
        d.mode === '2v2'
      ) {
        this.status.setText(d.mode === 'tournament' ? t('online.waitTournament') : t('online.inQueue'));
        const queue: Pick<ClientJoin, 'queue' | 'tournamentId'> =
          d.mode === 'ranked'
            ? {}
            : d.mode === 'tournament'
              ? { queue: 'tournament', tournamentId: d.tournamentId }
              : { queue: d.mode };
        s = await OnlineSession.findMatch((q) => this.onQueue(q), this.abort.signal, queue);
      } else if (d.mode === 'create') {
        s = await OnlineSession.createFriendly();
      } else if (d.mode === 'create2v2') {
        s = await OnlineSession.createTeam();
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
      s.onDraft = (m) => this.showDraft(m);
      if (s.draft) this.showDraft(s.draft);
      s.onLobby = (m) => this.showLobby(m);
      if (s.lobby) this.showLobby(s.lobby);
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
    const mode = this.data_.mode;
    const secs = Math.floor(q.waitedMs / 1000);
    if (mode === 'tournament') {
      this.status.setText(t('online.waitTournamentSecs', { n: secs }));
      this.detail.setText(t('online.tournamentDetail'));
      return;
    }
    this.status.setText(t('online.inQueueSecs', { n: secs }));
    this.detail.setText(mode === 'ranked' ? t('online.queueDetail', { n: q.window }) : t('online.queueDetailMode'));
  }

  /** Sala 2v2 con amigos: los cuatro sitios (los libres serán bots) y, si eres el anfitrión, empezar. */
  private showLobby(m: LobbyMsg): void {
    if (this.left) return;
    this.spinner.setVisible(false);
    this.lobbyUi?.destroy();
    const c = (this.lobbyUi = this.add.container(0, 0));
    const cx = L.w / 2,
      py = this.py;
    const sides: Array<[string, typeof m.seats]> = [
      [t('online.yourTeam'), m.seats.filter((s) => s.key.startsWith('blue'))],
      [t('online.rivals'), m.seats.filter((s) => s.key.startsWith('red'))],
    ];
    sides.forEach(([title, seats], col) => {
      const x = cx + (col ? 150 : -150);
      c.add(kit.text(this, x, py + sy(130), title, 'label', col ? '#ff9aa2' : '#9fd0ff', { size: 20 }));
      seats.forEach((s, i) => {
        const y = py + sy(180) + i * 64;
        c.add(kit.panel(this, x - 135, y - 26, 270, 52, s.name ? (col ? 'red' : 'blue') : 'inset'));
        c.add(
          kit.text(this, x, y, s.name ?? t('online.botSeat'), 'label', s.name ? '#ffffff' : '#7480c0', { size: 19 }),
        );
      });
    });
    const n = m.seats.filter((s) => s.name).length;
    this.status.setText(t('online.teamWaiting', { n }));
    this.detail.setText(m.host ? t('online.teamHost') : t('online.teamGuest'));
    if (m.host)
      c.add(
        kit.button(
          this,
          cx,
          // debajo de los equipos (más abajo están el código y "Cancelar")
          py + sy(362),
          320,
          74,
          t('online.teamStart'),
          'success',
          () => {
            this.session?.startNow();
          },
          { size: 30 },
        ),
      );
  }

  /** Draft: dos cartas para elegir (la otra se la lleva el rival), cuenta atrás y el mazo que se va formando. */
  private showDraft(m: DraftMsg): void {
    if (this.left) return;
    this.spinner.setVisible(false);
    this.codeBox.setVisible(false);
    this.draftUi?.destroy();
    this.draftTimer?.remove();
    const c = (this.draftUi = this.add.container(0, 0));
    const cx = L.w / 2,
      py = this.py;
    const done = m.round >= m.rounds;
    this.status.setText(done ? t('draft.ready') : t('draft.round', { n: m.round + 1, total: m.rounds }));
    const until = Date.now() + m.msLeft;
    const tick = () =>
      this.detail.setText(
        done
          ? t('draft.readyBody')
          : m.pair
            ? t('draft.pickOne', { n: Math.max(0, Math.ceil((until - Date.now()) / 1000)) })
            : t('draft.waiting'),
      );
    tick();
    if (!done) this.draftTimer = this.time.addEvent({ delay: 250, loop: true, callback: tick });
    // las dos cartas
    if (m.pair) {
      const views = m.pair.map((k, i) => {
        const v = makeCardView(this, liveCard(k), cx + (i ? 150 : -150), py + sy(260), 200, 240);
        v.setSize(200, 240).setInteractive({ useHandCursor: true });
        v.on('pointerover', () => this.tweens.add({ targets: v, scale: 1.05, duration: 100 }));
        v.on('pointerout', () => this.tweens.add({ targets: v, scale: 1, duration: 100 }));
        v.on('pointerup', () => {
          if (!this.session || v.getData('picked')) return;
          Sfx.play('select');
          this.session.pick(i);
          views.forEach((o, j) => {
            o.setData('picked', true).disableInteractive();
            // la elegida se queda; la otra se va hacia el rival
            if (j === i) this.tweens.add({ targets: o, scale: 1.1, duration: 160 });
            else this.tweens.add({ targets: o, y: o.y - 160, alpha: 0, duration: 320, ease: 'Cubic.easeIn' });
          });
        });
        c.add(v);
        return v;
      });
      c.add(kit.text(this, cx, py + sy(260), t('draft.or'), 'h2', '#ffd75a', { size: 34 }));
    }
    // el mazo que se va formando: elegidas (borde dorado) y recibidas
    const deck = [...m.picks.map((k) => [k, true] as const), ...m.got.map((k) => [k, false] as const)];
    for (let i = 0; i < 8; i++) {
      const x = cx - 3.5 * 74 + i * 74,
        y = py + sy(640);
      const item = deck[i];
      if (!item) {
        c.add(kit.panel(this, x - 30, y - 37, 60, 74, 'inset'));
        continue;
      }
      c.add(makeCardView(this, liveCard(item[0]), x, y, 62, 76));
      if (item[1])
        c.add(
          this.add
            .graphics()
            .lineStyle(3, kit.C.gold)
            .strokeRoundedRect(x - 33, y - 40, 66, 80, 10),
        );
    }
    c.add(kit.text(this, cx, py + sy(580), t('draft.yourDeck'), 'label', '#aab3e8', { size: 18 }));
  }

  private showCode(code: string): void {
    const d = this.data_;
    // invitación a un amigo: le llega el código en su menú
    if (d.mode === 'create' && d.inviteTo) {
      const to = d.inviteTo;
      void Social.invite(to.accountId, code).then(
        () => this.sys.isActive() && this.detail.setText(t('friends.invited', { name: to.name })),
        () => this.sys.isActive() && this.detail.setText(t('friends.inviteFailed')),
      );
    }
    this.codeT.setText(code);
    this.codeBox.setVisible(true).setScale(0.6);
    this.tweens.add({ targets: this.codeBox, scale: 1, duration: 260, ease: 'Back.easeOut' });
    this.status.setText(t('online.waitingFriend'));
    if (!(d.mode === 'create' && d.inviteTo)) this.detail.setText(t('online.shareCode'));
  }

  private go(): void {
    if (!this.session || this.left) return;
    const s = this.session;
    s.onStart = undefined;
    s.onCode = undefined;
    s.onDraft = undefined;
    s.onLobby = undefined;
    this.draftTimer?.remove();
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
