import { ARENA, RULES, getCard, type Input, type SimEvent, type Team } from '@arena/shared';

// ─────────────────────────────────────────────────────────────
//  GUION DEL TUTORIAL (sin Phaser, se puede testear).
//  Decide en qué paso va la explicación, cuándo se para la partida y qué juega el rival
//  (un "Guía" que no es un bot de verdad: juega poco y donde conviene para enseñar).
//
//  goal  → objetivo de la partida (pausa, toca para seguir)
//  hand  → cartas y elixir (pausa, toca para seguir)
//  deploy→ juega tu primera carta (espera a que la juegues)
//  walk  → tus Pokémon van solos a por las torres (unos segundos)
//  defend→ el Guía manda un ataque por la izquierda: defiende (espera a que juegues)
//  push  → ¡bien! sigue atacando (unos segundos)
//  free  → partida libre con consejos sueltos (corona, hechizos, elixir lleno)
// ─────────────────────────────────────────────────────────────

export type TutStep = 'goal' | 'hand' | 'deploy' | 'walk' | 'defend' | 'push' | 'free';
export type TutTip = 'crown' | 'spell' | 'elixirFull';

/** Lo que el guion necesita saber de la partida en cada fotograma. */
export interface TutView {
  myElixir: number;
  myHand: readonly string[];
  foeElixir: number;
  foeHand: readonly string[];
}

/** Dónde ataca el Guía para que el jugador defienda: carril izquierdo, justo antes del río. */
export const FOE_ATTACK = { x: ARENA.bridges[0], y: ARENA.riverY - ARENA.riverHalf - 60 };
/** Dónde se sugiere defender (delante de la torre izquierda propia). */
export const DEFEND_AT = { x: ARENA.bridges[0], y: ARENA.riverY + 140 };
/** Dónde se sugiere jugar la primera carta. */
export const FIRST_DEPLOY_AT = { x: ARENA.bridges[1], y: ARENA.riverY + 120 };

const WALK_SECONDS = 4.5;
const PUSH_SECONDS = 5;
/** Cada cuánto juega el Guía en la parte libre (poco: el tutorial se tiene que poder ganar). */
const FOE_EVERY = 18;
const FULL_ELIXIR_SECONDS = 3;

export class TutorialScript {
  step: TutStep = 'goal';
  /** Se llama al cambiar de paso y al tocar un consejo. */
  onStep: (s: TutStep) => void = () => {};
  onTip: (tip: TutTip) => void = () => {};
  private shown = new Set<TutTip>();
  private stepT = 0;
  private foeT = 0;
  private fullT = 0;
  private lane = 1;

  constructor(
    readonly me: Team,
    readonly foe: Team,
  ) {}

  /** La partida se para mientras se explica algo que hay que leer. */
  get paused(): boolean {
    return this.step === 'goal' || this.step === 'hand';
  }

  /** "Toca para seguir". */
  tap(): void {
    if (this.step === 'goal') this.go('hand');
    else if (this.step === 'hand') this.go('deploy');
  }

  /** Eventos de la simulación de este fotograma. */
  events(evs: readonly SimEvent[]): void {
    for (const e of evs) {
      if (e.e === 'deploy' && e.team === this.me) {
        if (this.step === 'deploy') this.go('walk');
        else if (this.step === 'defend') this.go('push');
      } else if (e.e === 'crown' && e.team === this.me) this.tip('crown');
    }
  }

  /** Avanza el guion. Devuelve la carta que juega el Guía este fotograma (o null). */
  update(dt: number, v: TutView): Input | null {
    if (this.paused) return null;
    this.stepT += dt;
    switch (this.step) {
      case 'walk':
        if (this.stepT >= WALK_SECONDS) {
          const play = this.foePlay(v, FOE_ATTACK.x, FOE_ATTACK.y);
          if (play) this.go('defend');
          return play;
        }
        return null;
      case 'push':
        if (this.stepT >= PUSH_SECONDS) this.go('free');
        return null;
      case 'free': {
        if (v.myHand.some((k) => getCard(k).type === 'spell')) this.tip('spell');
        this.fullT = v.myElixir >= RULES.elixirMax ? this.fullT + dt : 0;
        if (this.fullT >= FULL_ELIXIR_SECONDS) this.tip('elixirFull');
        this.foeT += dt;
        if (this.foeT < FOE_EVERY) return null;
        // juega atrás, en su lado: le da tiempo al jugador a verlo venir
        const play = this.foePlay(v, ARENA.bridges[this.lane], ARENA.top + 200);
        if (play) {
          this.foeT = 0;
          this.lane = 1 - this.lane;
        }
        return play;
      }
      default:
        return null;
    }
  }

  /** La carta de tropa más barata que pueda pagar el Guía, en ese punto. */
  private foePlay(v: TutView, x: number, y: number): Input | null {
    const units = v.foeHand
      .map((k) => getCard(k))
      .filter((c) => c.type !== 'spell' && c.cost <= v.foeElixir)
      .sort((a, b) => a.cost - b.cost);
    if (!units.length) return null;
    return { t: 'play', team: this.foe, card: units[0].key, x, y };
  }

  private go(s: TutStep): void {
    this.step = s;
    this.stepT = 0;
    this.onStep(s);
  }

  private tip(tip: TutTip): void {
    if (this.shown.has(tip)) return;
    this.shown.add(tip);
    this.onTip(tip);
  }
}
