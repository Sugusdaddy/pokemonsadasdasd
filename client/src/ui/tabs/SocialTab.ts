import type Phaser from 'phaser';
import { ARENAS, arenaFor, type SeasonTier } from '@arena/shared';
import { Profile } from '../../meta/Profile';
import { api, type LeaderboardPage, type RankRow, type SeasonOverview } from '../../net/api';
import { fmtNum } from '../style';
import * as kit from '../kit';
import { t, arenaName, ballLabel } from '../../i18n';
import type { ScrollPanel } from '../ScrollPanel';
import { Tab, sectionHeader } from './Tab';
import { L } from '../../layout';

type Scope = 'global' | 'arena';
const ROW = 76;

/** Cuenta atrás hasta el fin de temporada ("3d 4h" o "5h 12min"). */
export function seasonCountdown(endsAt: number, now = Date.now()): string {
  const s = Math.max(0, Math.floor((endsAt - now) / 1000));
  const d = Math.floor(s / 86400),
    h = Math.floor((s % 86400) / 3600),
    m = Math.floor((s % 3600) / 60);
  return d > 0 ? t('season.days', { d, h }) : t('season.hours', { h, m });
}

/** Texto de un tramo de recompensa: "600 gold · 20 gems · Super Ball". */
export function tierLabel(tr: SeasonTier): string {
  const parts = [t('road.gold', { n: tr.gold })];
  if (tr.gems) parts.push(t('road.gems', { n: tr.gems }));
  if (tr.ball) parts.push(ballLabel(tr.ball));
  return parts.join('  ·  ');
}

/**
 * Pestaña Social: clasificación global o por arena y la temporada en curso
 * (cuenta atrás, tramos de recompensa y top de la anterior).
 */
export class SocialTab extends Tab {
  // se conservan entre aperturas para no parpadear al volver
  private static scope: Scope = 'global';
  private static arena = -1;
  private static boards = new Map<string, LeaderboardPage>();
  private static season: SeasonOverview | null = null;
  private static failed = false;

  private countdown: Phaser.GameObjects.Text | null = null;
  private alive = true;

  constructor(scene: ConstructorParameters<typeof Tab>[0]) {
    super(scene);
    if (SocialTab.arena < 0) SocialTab.arena = arenaFor(Profile.d.trophies);
    void this.load();
  }

  private get boardKey(): string {
    return SocialTab.scope === 'global' ? 'global' : `arena:${SocialTab.arena}`;
  }

  async load(): Promise<void> {
    try {
      const scope = SocialTab.scope,
        key = this.boardKey;
      const [board, season] = await Promise.all([
        api.leaderboard(scope, { arena: SocialTab.arena, limit: 100 }),
        api.season(),
      ]);
      SocialTab.boards.set(key, board);
      SocialTab.season = season;
      SocialTab.failed = false;
    } catch {
      SocialTab.failed = true;
    }
    if (this.alive && this.scene.sys.isActive()) this.rebuild();
  }

  override build(): void {
    const A = this.area;
    this.countdown = null;
    if (L.pc) {
      const gap = 32;
      const right = Math.min(560, Math.round(A.w * 0.4));
      const left = A.w - right - gap;
      const P = this.scroll(A.x, A.y, left, A.h);
      P.setContentHeight(this.buildBoard(P, 0, left) + 20);
      const S = this.scroll(A.x + left + gap, A.y, right, A.h);
      S.setContentHeight(this.buildSeason(S, 0, right) + 20);
    } else {
      const P = this.scroll();
      let y = this.buildSeason(P, 0, P.w, true);
      y = this.buildBoard(P, y + 10, P.w);
      P.setContentHeight(y + 20);
    }
  }

  // ───────── Clasificación ─────────
  buildBoard(P: ScrollPanel, y0: number, W: number): number {
    const s = this.scene;
    const pad = L.pc ? 0 : 20;
    const w = W - pad * 2;
    let y = y0 + 30;
    const board = SocialTab.boards.get(this.boardKey);
    sectionHeader(
      s,
      pad,
      y,
      w,
      t('social.title'),
      board ? t('social.players', { n: fmtNum(board.total) }) : '',
    ).forEach((o) => P.add(o));
    y += 58;

    // selector Global / Arena
    const half = (w - 16) / 2;
    const tabBtn = (x: number, label: string, scope: Scope) => {
      const on = SocialTab.scope === scope;
      const b = kit.button(s, x + half / 2, y + 30, half, 56, label, on ? 'info' : 'dark', () => {}, { size: 22 });
      b.disableInteractive();
      P.add(b);
      P.addTap(x + half / 2, y + 30, half, 60, () => this.setScope(scope), b);
    };
    tabBtn(pad, t('social.global'), 'global');
    tabBtn(pad + half + 16, t('social.arena'), 'arena');
    y += 78;

    // flechas para cambiar de arena
    if (SocialTab.scope === 'arena') {
      P.add(kit.panel(s, pad, y, w, 64, 'inset'));
      P.add(
        kit.text(s, pad + w / 2, y + 32, `${SocialTab.arena + 1} · ${arenaName(SocialTab.arena)}`, 'h3', '#ffd75a', {
          size: 24,
        }),
      );
      const arrow = (x: number, label: string, d: number) => {
        const ok = SocialTab.arena + d >= 0 && SocialTab.arena + d < ARENAS.length;
        const b = kit.button(s, x, y + 32, 64, 48, label, 'neutral', () => {}, { size: 24 });
        b.disableInteractive();
        if (!ok) b.setAlpha(0.35);
        P.add(b);
        if (ok) P.addTap(x, y + 32, 70, 56, () => this.setArena(SocialTab.arena + d), b);
      };
      arrow(pad + 44, '<', -1);
      arrow(pad + w - 44, '>', 1);
      y += 82;
    }

    // mi puesto
    const me = board?.me;
    if (me) {
      P.add(kit.panel(s, pad, y, w, 70, me.rank ? 'gold' : 'dark'));
      if (me.rank) {
        P.add(kit.text(s, pad + 30, y + 35, `#${me.rank}`, 'h2', '#ffffff', { originX: 0, size: 30 }));
        P.add(kit.text(s, pad + 150, y + 35, t('social.you'), 'h3', '#ffffff', { originX: 0, size: 24 }));
        P.add(s.add.image(pad + w - 130, y + 35, 'ic_trophy').setDisplaySize(36, 36));
        P.add(kit.text(s, pad + w - 106, y + 35, fmtNum(me.trophies), 'h3', '#ffffff', { originX: 0, size: 24 }));
      } else {
        P.add(
          kit.text(s, pad + w / 2, y + 35, t('social.unranked'), 'body', '#aab3e8', {
            size: 19,
            wordWrap: { width: w - 40 },
          }),
        );
      }
      y += 88;
    }

    if (!board) {
      const msg = SocialTab.failed ? t('social.offline') : t('social.loading');
      P.add(kit.text(s, pad + w / 2, y + 60, msg, 'body', '#aab3e8', { size: 22 }));
      return y + 120;
    }
    if (!board.entries.length) {
      P.add(kit.text(s, pad + w / 2, y + 60, t('social.empty'), 'body', '#aab3e8', { size: 22 }));
      return y + 120;
    }
    for (const e of board.entries) {
      this.row(P, pad, y, w, e, e.accountId === Profile.accountId);
      y += ROW;
    }
    return y;
  }

  row(P: ScrollPanel, x: number, y: number, w: number, e: RankRow, mine: boolean): void {
    const s = this.scene;
    const top3 = e.rank <= 3;
    P.add(kit.panel(s, x, y, w, ROW - 8, mine ? 'blue' : top3 ? 'light' : 'card'));
    const cy = y + (ROW - 8) / 2;
    const medal = ['#ffd75a', '#dfe4ff', '#e8a46a'][e.rank - 1];
    P.add(kit.text(s, x + 56, cy, `#${e.rank}`, 'h3', medal ?? '#aab3e8', { size: e.rank < 100 ? 26 : 20 }));
    P.add(kit.text(s, x + 112, cy - (e.wallet ? 10 : 0), e.name, 'h3', '#ffffff', { originX: 0, size: 23 }));
    P.add(
      kit
        .text(s, x + 112, cy + 15, e.wallet ?? '', 'small', '#7480c0', { originX: 0, size: 14 })
        .setVisible(!!e.wallet),
    );
    const lvX = x + w - (L.pc ? 250 : 210);
    P.add(kit.text(s, lvX, cy, `Lv ${e.kingLevel}`, 'label', '#aab3e8', { size: 18 }));
    P.add(s.add.image(x + w - 140, cy, 'ic_trophy').setDisplaySize(34, 34));
    P.add(kit.text(s, x + w - 116, cy, fmtNum(e.trophies), 'h3', '#ffffff', { originX: 0, size: 23 }));
  }

  setScope(scope: Scope): void {
    if (SocialTab.scope === scope) return;
    SocialTab.scope = scope;
    this.rebuild();
    void this.load();
  }

  setArena(i: number): void {
    SocialTab.arena = Math.max(0, Math.min(ARENAS.length - 1, i));
    this.rebuild();
    void this.load();
  }

  // ───────── Temporada ─────────
  buildSeason(P: ScrollPanel, y0: number, W: number, compact = false): number {
    const s = this.scene;
    const pad = L.pc ? 0 : 20;
    const w = W - pad * 2;
    const info = SocialTab.season;
    let y = y0 + 20;

    // cabecera: nombre, cuenta atrás y tu máximo
    P.add(kit.panel(s, pad, y, w, 132, 'blue'));
    P.add(s.add.image(pad + 58, y + 66, 'ic_social').setDisplaySize(72, 72));
    const id = info?.current.id ?? Profile.d.season?.id ?? '';
    P.add(kit.text(s, pad + 110, y + 36, t('season.title', { id }), 'h2', '#ffffff', { originX: 0, size: 30 }));
    this.countdown = kit.text(s, pad + 110, y + 74, '', 'label', '#ffd75a', { originX: 0, size: 21 });
    P.add(this.countdown);
    const best = Profile.d.season?.best ?? Profile.d.trophies;
    P.add(
      kit.text(s, pad + 110, y + 104, t('season.best', { n: fmtNum(best) }), 'body', '#dfe4ff', {
        originX: 0,
        size: 18,
      }),
    );
    this.tick();
    y += 152;
    if (!info) return y;

    // tramos de recompensa (resaltado el que tienes ahora)
    sectionHeader(s, pad, y + 10, w, t('season.rewards')).forEach((o) => P.add(o));
    y += 54;
    const current = [...info.tiers].reverse().find((tr) => best >= tr.trophies);
    for (const tr of [...info.tiers].reverse()) {
      const on = tr === current;
      const reached = best >= tr.trophies;
      P.add(kit.panel(s, pad, y, w, 64, on ? 'gold' : reached ? 'light' : 'inset'));
      P.add(
        s.add
          .image(pad + 34, y + 32, 'ic_trophy')
          .setDisplaySize(30, 30)
          .setAlpha(reached ? 1 : 0.5),
      );
      P.add(
        kit.text(s, pad + 56, y + 32, fmtNum(tr.trophies), 'h3', reached ? '#ffffff' : '#7480c0', {
          originX: 0,
          size: 22,
        }),
      );
      P.add(
        kit.text(s, pad + w - 20, y + 32, tierLabel(tr), 'label', reached ? '#ffffff' : '#7480c0', {
          originX: 1,
          size: 17,
        }),
      );
      y += 72;
    }
    P.add(
      kit.text(s, pad + 4, y + 6, t('season.rewardsHint', { n: info.resetAbove }), 'body', '#7480c0', {
        originX: 0,
        originY: 0,
        size: 16,
        wordWrap: { width: w - 8 },
      }),
    );
    y += 70;

    // top de la temporada anterior
    sectionHeader(s, pad, y + 10, w, t('season.previous', { id: info.previous.id })).forEach((o) => P.add(o));
    y += 54;
    if (!info.previous.top.length) {
      P.add(kit.text(s, pad + w / 2, y + 24, t('season.noPrevious'), 'body', '#7480c0', { size: 18 }));
      return y + 60;
    }
    for (const r of info.previous.top.slice(0, compact ? 3 : 10)) {
      P.add(kit.panel(s, pad, y, w, 56, r.rank === 1 ? 'gold' : 'card'));
      P.add(kit.text(s, pad + 40, y + 28, `#${r.rank}`, 'h3', '#ffffff', { size: 21 }));
      P.add(kit.text(s, pad + 84, y + 28, r.name, 'h3', '#ffffff', { originX: 0, size: 21 }));
      P.add(kit.text(s, pad + w - 20, y + 28, fmtNum(r.best), 'h3', '#ffffff', { originX: 1, size: 21 }));
      y += 62;
    }
    return y;
  }

  override tick(): void {
    const end = SocialTab.season?.current.endsAt;
    if (this.countdown && end) this.countdown.setText(t('season.endsIn', { t: seasonCountdown(end) }));
  }

  override destroy(): void {
    this.alive = false;
    super.destroy();
  }
}
