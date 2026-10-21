import type Phaser from 'phaser';
import type { PlayerInfo, Replay, Team } from '@arena/shared';
import { L } from '../layout';
import { api, type LiveMatch, type ReplayMeta } from '../net/api';
import { Sfx } from '../systems/Sfx';
import * as kit from '../ui/kit';
import { t } from '../i18n';
import { toast } from '../ui/Modal';
import { BaseScene } from './BaseScene';
import { LAST_REPLAY_KEY } from './BattleScene';
import { errorText } from './OnlineScene';

const ago = (iso: string): string => {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return t('tv.agoS', { n: s });
  if (s < 3600) return t('tv.agoM', { n: Math.round(s / 60) });
  if (s < 86400) return t('tv.agoH', { n: Math.round(s / 3600) });
  return t('tv.agoD', { n: Math.round(s / 86400) });
};

type Chip = [string, number];

/** "TV": partidas en directo para mirar como espectador y repeticiones guardadas. */
export class TvScene extends BaseScene {
  private list!: Phaser.GameObjects.Container;
  private loading!: Phaser.GameObjects.Container;

  constructor() {
    super('Tv');
  }

  create(): void {
    this.modalOpen = 0;
    kit.menuBackground(this, L.w, L.h);
    kit.fadeIn(this);
    const W = L.w;
    // cabecera
    const g = this.add.graphics();
    g.fillGradientStyle(0x1f2660, 0x1f2660, 0x111538, 0x111538, 1).fillRect(0, 0, W, 130);
    g.fillStyle(kit.C.ink).fillRect(0, 128, W, 4);
    g.fillStyle(kit.C.gold, 0.55).fillRect(0, 125, W, 2);
    kit.text(this, W / 2, 62, t('tv.title'), 'hero', '#ffd75a', { size: L.pc ? 60 : 50 });
    kit.button(this, 90, 64, 140, 72, L.pc ? t('tv.backKey') : t('common.back'), 'danger', () => this.leave(), {
      size: 22,
    });
    kit.button(this, W - 90, 64, 140, 72, t('tv.reload'), 'info', () => this.scene.restart(), { size: 22 });
    this.list = this.add.container(0, 0);
    // cargando
    this.loading = this.add.container(W / 2, 420);
    const ring = this.add.graphics();
    ring.lineStyle(6, 0xffffff, 0.15).strokeCircle(0, 0, 40);
    ring.lineStyle(6, kit.C.gold).beginPath().arc(0, 0, 40, 0, 1.4).strokePath();
    this.loading.add([ring, kit.text(this, 0, 80, t('tv.loading'), 'h3', '#aab3e8', { size: 26 })]);
    this.tweens.add({ targets: ring, angle: 360, duration: 900, repeat: -1 });
    this.input.keyboard?.on('keydown-ESC', () => !this.modalOpen && this.leave());
    void this.load_();
  }

  private leave(): void {
    kit.goTo(this, 'Lobby', { tab: 'battle' });
  }

  private async load_(): Promise<void> {
    let live: LiveMatch[] = [],
      replays: ReplayMeta[] = [];
    let offline = false;
    try {
      [live, replays] = await Promise.all([api.live(), api.replays(8)]);
    } catch {
      offline = true;
    }
    if (!this.sys.isActive()) return;
    this.loading.destroy();
    this.list.removeAll(true);
    // columnas: una en móvil; en PC, en directo a la izquierda y repeticiones a la derecha
    const colW = L.pc ? Math.min(820, L.w / 2 - 40) : 720; // 680 en una tableta (1440)
    const cols = L.pc ? [L.w / 2 - colW - 20, L.w / 2 + 20] : [0, 0];
    const top = L.pc ? 170 : 160;
    let x = cols[0];
    let y = top;
    const column = (i: number) => {
      if (!L.pc) return;
      x = cols[i];
      y = top;
    };
    const header = (label: string, count?: number) => {
      this.list.add(kit.text(this, x + 34, y, label, 'h2', '#ffffff', { originX: 0, size: 32 }));
      if (count !== undefined)
        this.list.add(kit.text(this, x + colW - 34, y + 4, String(count), 'h3', '#7480c0', { originX: 1, size: 24 }));
      const g = this.add.graphics();
      g.fillStyle(0xffffff, 0.12).fillRect(x + 34, y + 28, colW - 68, 2);
      g.fillStyle(kit.C.gold, 0.8).fillRect(x + 34, y + 28, 64, 3);
      this.list.add(g);
      y += 56;
    };
    const vs = (p: Record<Team, PlayerInfo>) =>
      t('tv.vs', { a: p.blue.name, b: p.red.bot ? t('battle.bot', { name: p.red.name }) : p.red.name });
    const chip = (cx: number, cy: number, [label, color]: Chip): number => {
      const tt = kit.text(this, 0, 0, label, 'label', '#0b0d1f', { size: 15, dropShadow: false });
      tt.setStroke('#000000', 0);
      const w = tt.width + 20;
      const g = this.add.graphics();
      g.fillStyle(kit.C.ink).fillRoundedRect(cx - 1, cy - 14, w + 2, 28, 14);
      g.fillStyle(color).fillRoundedRect(cx, cy - 13, w, 26, 13);
      tt.setPosition(cx + w / 2, cy);
      this.list.add([g, tt]);
      return w + 8;
    };
    const row = (
      title: string,
      sub: string,
      chips: Chip[],
      cta: string,
      variant: kit.ButtonVariant,
      onTap: () => void,
    ) => {
      this.list.add(kit.panel(this, x + 30, y, colW - 60, 96, 'card'));
      let cx = x + 54;
      for (const c of chips) cx += chip(cx, y + 26, c);
      const tt = kit.text(this, cx + 4, y + 26, title, 'label', '#ffffff', { originX: 0, size: 21 });
      const maxW = x + colW - 220 - (cx + 4);
      if (tt.width > maxW) tt.setScale(Math.max(0.6, maxW / tt.width));
      this.list.add(tt);
      this.list.add(kit.text(this, x + 54, y + 64, sub, 'body', '#aab3e8', { originX: 0, size: 17 }));
      this.list.add(kit.button(this, x + colW - 120, y + 46, 150, 62, cta, variant, onTap, { size: 22 }));
      y += 112;
    };
    const empty = (msg: string) => {
      this.list.add(kit.panel(this, x + 30, y, colW - 60, 80, 'inset'));
      this.list.add(kit.text(this, x + colW / 2, y + 38, msg, 'body', '#7480c0', { size: 20 }));
      y += 100;
    };

    // tu última partida (guardada en este navegador)
    const last = this.lastLocal();
    if (last) {
      header(t('tv.lastMatch'));
      row(vs(last.players), t('tv.savedHere'), [[t('tv.chipReplay'), kit.C.info]], t('tv.watch'), 'success', () =>
        kit.goTo(this, 'Battle', { kind: 'replay', replay: last, players: last.players, back: 'Tv' }),
      );
    }

    if (offline) {
      header(t('tv.server'));
      empty(t('tv.offline'));
      return;
    }

    header(t('tv.live'), live.length);
    if (!live.length) empty(t('tv.noLive'));
    for (const l of live.slice(0, L.pc ? 6 : 3)) {
      row(
        vs(l.players),
        t('tv.watching', { n: l.spectators }),
        [
          [t('tv.chipLive'), kit.C.bad],
          l.mode === 'bot' ? [t('tv.chipBot'), 0xaab3e8] : [t('tv.chipRanked'), kit.C.gold],
        ],
        t('tv.spectate'),
        'primary',
        () => kit.goTo(this, 'Online', { mode: 'spectate', roomId: l.roomId }),
      );
    }

    column(1);
    header(t('tv.replays'), replays.length);
    if (!replays.length) empty(t('tv.noReplays'));
    for (const r of replays.slice(0, L.pc ? 7 : 3)) {
      const res =
        r.winner === 'draw' || !r.winner
          ? t('result.draw')
          : t('tv.wonBy', { name: r.players[r.winner].name, b: r.crowns.blue, r: r.crowns.red });
      row(
        vs(r.players),
        `${res} · ${ago(r.endedAt)}`,
        [
          r.mode === 'bot'
            ? [t('tv.chipBot'), 0xaab3e8]
            : r.mode === 'friendly'
              ? [t('tv.chipFriendly'), kit.C.info]
              : [t('tv.chipRanked'), kit.C.gold],
        ],
        t('tv.watch'),
        'info',
        () => void this.watch(r),
      );
    }
  }

  private async watch(r: ReplayMeta): Promise<void> {
    try {
      const rep = await api.replay(r.id);
      Sfx.play('select');
      kit.goTo(this, 'Battle', { kind: 'replay', replay: rep, players: rep.meta.players, back: 'Tv' });
    } catch (err) {
      toast(this, errorText(err as Error), '#ff9a9a');
    }
  }

  private lastLocal(): (Replay & { players: Record<Team, PlayerInfo> }) | null {
    try {
      const r = JSON.parse(localStorage.getItem(LAST_REPLAY_KEY) || 'null') as
        (Replay & { players?: Record<Team, PlayerInfo> }) | null;
      return r?.players ? (r as Replay & { players: Record<Team, PlayerInfo> }) : null;
    } catch {
      return null;
    }
  }
}
