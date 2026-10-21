import type Phaser from 'phaser';
import {
  ARENA,
  STARTER_DECK,
  W,
  T,
  getCard,
  startLevel,
  type Match,
  type MatchSetup,
  type PlayerInfo,
  type SimEvent,
  type Team,
} from '@arena/shared';
import { L } from '../layout';
import { Profile } from '../meta/Profile';
import * as kit from '../ui/kit';
import { t } from '../i18n';
import { Sfx } from '../systems/Sfx';
import type { Hand } from '../ui/Hand';
import type { LocalSource } from './sources';
import { DEFEND_AT, FIRST_DEPLOY_AT, TutorialScript, type TutStep, type TutTip } from './tutorialScript';

// ─────────────────────────────────────────────────────────────
//  TUTORIAL GUIADO: una partida local contra el "Guía" con explicaciones encima.
//  El guion (qué toca explicar, cuándo se para, qué juega el rival) está en
//  tutorialScript.ts; aquí solo se dibuja: bocadillos, focos y la mano que señala.
//  Todo va en coordenadas del mundo de la batalla, así sirve igual en PC (con la cámara
//  desplazada o alejada) y en móvil.
// ─────────────────────────────────────────────────────────────

const DEPTH = 8500;
const TIP_SECONDS = 5;
/** Altura de los bocadillos durante la partida: arriba, sobre la torre del Rey rival (las de los lados quedan a la vista). */
const TOP_Y = ARENA.top + 90;

/** Partida del tutorial: tu mazo contra el Guía (cartas iniciales, rey nivel 1). */
export function tutorialMatch(seed: number): { setup: MatchSetup; players: Record<Team, PlayerInfo> } {
  const deck = [...Profile.deck];
  const foeDeck = [...STARTER_DECK];
  return {
    setup: {
      seed,
      arena: 0,
      players: {
        blue: { deck, levels: Profile.levelsOf(deck), kingLevel: Profile.d.kingLevel },
        red: {
          deck: foeDeck,
          levels: Object.fromEntries(foeDeck.map((k) => [k, startLevel(getCard(k))])),
          kingLevel: 1,
        },
      },
    },
    players: {
      blue: { name: Profile.displayName, trophies: Profile.d.trophies, kingLevel: Profile.d.kingLevel, bot: false },
      red: { name: t('tut.rival'), trophies: 0, kingLevel: 1, bot: true },
    },
  };
}

/** Lo que el tutorial necesita de la escena de batalla. */
export interface TutorialHost extends Phaser.Scene {
  readonly match: Match;
  readonly me: Team;
  readonly foe: Team;
}

export class TutorialCoach {
  readonly script: TutorialScript;
  /** Lo del paso actual (se borra al cambiar de paso). */
  private stepLayer: Phaser.GameObjects.Container;
  private tipLayer: Phaser.GameObjects.Container;
  private tipTimer: Phaser.Time.TimerEvent | null = null;
  private skipBtn: kit.Button;

  constructor(
    private readonly s: TutorialHost,
    private readonly source: LocalSource,
    private readonly hand: Hand,
    onSkip: () => void,
  ) {
    this.script = new TutorialScript(s.me, s.foe);
    this.stepLayer = s.add.container(0, 0).setDepth(DEPTH);
    this.tipLayer = s.add.container(0, 0).setDepth(DEPTH + 10);
    this.script.onStep = (st) => this.showStep(st);
    this.script.onTip = (tip) => this.showTip(tip);
    // saltar: en PC, en el hueco del panel del rival; en móvil, abajo a la derecha de la arena
    const [sx, sy] = L.pc ? [-L.arenaX / 2, ARENA.riverY - 160] : [W - 74, ARENA.bottom - 44];
    this.skipBtn = kit.button(s, sx, sy, 120, 52, t('tut.skip'), 'neutral', onSkip, { size: 22 });
    this.skipBtn.setDepth(DEPTH + 20);
  }

  start(): void {
    this.showStep(this.script.step);
  }

  onEvents(evs: readonly SimEvent[]): void {
    this.script.events(evs);
  }

  update(dt: number): void {
    const m = this.s.match;
    const play = this.script.update(dt, {
      myElixir: m.elixir[this.s.me],
      myHand: m.cycles[this.s.me].hand,
      foeElixir: m.elixir[this.s.foe],
      foeHand: m.cycles[this.s.foe].hand,
    });
    if (play) this.source.send(play);
    this.source.paused = this.script.paused;
  }

  destroy(): void {
    this.tipTimer?.remove();
    this.stepLayer.destroy();
    this.tipLayer.destroy();
    this.skipBtn.destroy();
    this.source.paused = false;
  }

  // ───────────────────────── Dibujo ─────────────────────────

  private showStep(st: TutStep): void {
    const s = this.s,
      Ly = this.stepLayer;
    Ly.removeAll(true);
    this.source.paused = this.script.paused;
    const tapText = L.pc ? t('tut.tapPc') : t('tut.tap');
    switch (st) {
      case 'goal': {
        this.dim();
        for (const tw of s.match.towers.filter((x) => x.team === s.foe)) this.ring(tw.x, tw.y, tw.radius + 26);
        this.bubble(t('tut.goal'), ARENA.riverY + 120, tapText);
        this.tapCatcher();
        break;
      }
      case 'hand': {
        this.dim();
        const cards = [0, 1, 2, 3].map((i) => this.hand.cardPos(i));
        const { w: cw, h: ch } = this.hand.cardSize;
        const x0 = cards[0].x - cw / 2 - 10,
          x1 = cards[3].x + cw / 2 + 10;
        this.box(x0, cards[0].y - ch / 2 - 10, x1 - x0, ch + 20);
        const e = this.hand.elixirBox;
        this.box(e.x - 10, e.y - 12, e.w + 20, e.h + 24);
        this.bubble(t('tut.hand'), L.pc ? ARENA.riverY : ARENA.riverY + 260, tapText);
        this.tapCatcher();
        break;
      }
      case 'deploy': {
        this.bubble(L.pc ? t('tut.deployPc') : t('tut.deploy'), TOP_Y);
        this.pointer(FIRST_DEPLOY_AT.x, FIRST_DEPLOY_AT.y, true);
        break;
      }
      case 'walk':
        this.bubble(t('tut.walk'), TOP_Y);
        break;
      case 'defend':
        Sfx.play('noElixir');
        this.bubble(t('tut.defend'), TOP_Y);
        this.pointer(DEFEND_AT.x, DEFEND_AT.y, false);
        break;
      case 'push':
        Sfx.play('select');
        this.bubble(t('tut.push'), TOP_Y);
        break;
      case 'free':
        break;
    }
  }

  private showTip(tip: TutTip): void {
    const Ly = this.tipLayer;
    Ly.removeAll(true);
    this.tipTimer?.remove();
    Sfx.play('select');
    this.bubble(t(`tut.${tip}`), TOP_Y, undefined, Ly);
    this.tipTimer = this.s.time.delayedCall(TIP_SECONDS * 1000, () => Ly.removeAll(true));
  }

  /** Oscurece toda la vista (arena y paneles) mientras se lee. */
  private dim(): void {
    const big = this.s.add.rectangle(W / 2, 640, W + 2 * L.arenaX + 800, 2400, 0x05060f, 0.55);
    this.stepLayer.add(big);
  }

  /** Toca en cualquier sitio para seguir. */
  private tapCatcher(): void {
    const z = this.s.add.zone(W / 2, 640, W + 2 * L.arenaX + 800, 2400).setInteractive();
    z.once('pointerup', () => {
      Sfx.play('click');
      this.script.tap();
    });
    this.stepLayer.add(z);
  }

  /** Anillo que late alrededor de algo importante. */
  private ring(x: number, y: number, r: number): void {
    const g = this.s.add.graphics();
    g.lineStyle(6, kit.C.gold, 1).strokeCircle(0, 0, r);
    g.setPosition(x, y);
    this.stepLayer.add(g);
    this.s.tweens.add({ targets: g, scale: 1.12, alpha: 0.55, yoyo: true, repeat: -1, duration: 520 });
  }

  /** Marco que late alrededor de una zona rectangular. */
  private box(x: number, y: number, w: number, h: number): void {
    const g = this.s.add.graphics();
    g.lineStyle(6, kit.C.gold, 1).strokeRoundedRect(x, y, w, h, 18);
    this.stepLayer.add(g);
    this.s.tweens.add({ targets: g, alpha: 0.45, yoyo: true, repeat: -1, duration: 520 });
  }

  /**
   * Señala dónde jugar: un círculo en el suelo y, si `fromHand`, una carta fantasma que va
   * de la mano a ese punto una y otra vez (el gesto de arrastrar).
   */
  private pointer(x: number, y: number, fromHand: boolean): void {
    const s = this.s;
    const target = s.add.graphics();
    target.lineStyle(5, 0xffffff, 0.95).strokeCircle(0, 0, 0.9 * T);
    target.fillStyle(kit.C.gold, 0.25).fillCircle(0, 0, 0.9 * T);
    target.setPosition(x, y);
    this.stepLayer.add(target);
    s.tweens.add({ targets: target, scale: 1.18, yoyo: true, repeat: -1, duration: 480 });
    const arrow = s.add.graphics();
    arrow.fillStyle(kit.C.ink).fillTriangle(-22, -4, 22, -4, 0, 30);
    arrow.fillStyle(kit.C.gold).fillTriangle(-16, 0, 16, 0, 0, 23);
    arrow.setPosition(x, y - 70);
    this.stepLayer.add(arrow);
    s.tweens.add({ targets: arrow, y: y - 52, yoyo: true, repeat: -1, duration: 420, ease: 'Sine.easeInOut' });
    if (!fromHand) return;
    const from = this.hand.cardPos(0);
    const ghost = s.add.graphics();
    ghost.fillStyle(0xffffff, 0.35).fillRoundedRect(-40, -50, 80, 100, 12);
    ghost.lineStyle(4, 0xffffff, 0.9).strokeRoundedRect(-40, -50, 80, 100, 12);
    ghost.setPosition(from.x, from.y);
    this.stepLayer.add(ghost);
    s.tweens.add({
      targets: ghost,
      x,
      y,
      scale: 0.6,
      duration: 1100,
      ease: 'Cubic.easeInOut',
      repeat: -1,
      repeatDelay: 500,
      onRepeat: () => ghost.setPosition(from.x, from.y),
    });
  }

  /** Bocadillo del Guía con el texto (y "toca para seguir" si la partida está parada). */
  private bubble(msg: string, y: number, tap?: string, layer = this.stepLayer): void {
    const s = this.s;
    const c = s.add.container(W / 2, y);
    const body = kit.text(s, 30, 0, msg, 'body', '#ffffff', { size: 24, wordWrap: { width: 480 }, lineSpacing: 4 });
    const h = Math.max(110, body.height + (tap ? 70 : 44));
    c.add(kit.panel(s, -310, -h / 2, 620, h, 'light'));
    c.add(s.add.image(-262, 0, 'ic_profile').setDisplaySize(64, 64));
    body.setY(tap ? -16 : 0);
    c.add(body);
    if (tap) {
      const tt = kit.text(s, 30, h / 2 - 26, tap, 'label', '#ffd75a', { size: 18 });
      c.add(tt);
      s.tweens.add({ targets: tt, alpha: 0.4, yoyo: true, repeat: -1, duration: 600 });
    }
    c.setScale(0.6).setAlpha(0);
    s.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' });
    layer.add(c);
  }
}
