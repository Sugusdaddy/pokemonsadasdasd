import { MAX_LEVEL } from '../config';
import { cardsUpToArena, getCard, startLevel } from '../data/cards';
import { defaultRand, randInt, shuffle, type RandFn } from './random';

const NAMES = [
  'Álex',
  'Marta',
  'Leo',
  'Nuria',
  'Hugo',
  'Sara',
  'Iker',
  'Lucía',
  'Dani',
  'Paula',
  'Pol',
  'Carla',
  'Bruno',
  'Vega',
  'Mario',
  'Irene',
  'Adri',
  'Noa',
  'Teo',
  'Alba',
  'Rubén',
  'Julia',
  'Gael',
  'Lola',
];
const TITLES = ['Entrenador', 'Entrenadora', 'Domador', 'Campeona', 'As', 'Rival', 'Montañero', 'Nadadora'];

export interface OpponentInput {
  arena: number;
  trophies: number;
  kingLevel: number;
  /** Nivel medio del mazo "normalizado" (como si todas fueran comunes). */
  avgDeckLevel: number;
}

export interface Opponent {
  name: string;
  trophies: number;
  kingLevel: number;
  deck: string[];
  levels: Record<string, number>;
}

/** Genera un rival (bot) con un mazo coherente para la arena del jugador. */
export function makeOpponent(p: OpponentInput, rand: RandFn = defaultRand): Opponent {
  const pool = cardsUpToArena(Math.min(5, p.arena + (rand() < 0.3 ? 1 : 0)));
  const C = getCard;
  const spells = shuffle(
    rand,
    pool.filter((k) => C(k).type === 'spell'),
  );
  const tanks = shuffle(
    rand,
    pool.filter((k) => C(k).type !== 'spell' && (C(k).targets === 'buildings' || C(k).hp >= 1400)),
  );
  const air = shuffle(
    rand,
    pool.filter((k) => C(k).type !== 'spell' && C(k).targets === 'any' && !tanks.includes(k)),
  );
  const rest = shuffle(
    rand,
    pool.filter((k) => C(k).type !== 'spell'),
  );
  const deck: string[] = [];
  const add = (k: string | undefined) => {
    if (k && !deck.includes(k) && deck.length < 8) deck.push(k);
  };
  add(spells[0]);
  add(tanks[0]);
  add(air[0]);
  add(air[1]);
  add(air[2]);
  for (const k of rest) add(k);
  for (const k of spells.slice(1)) add(k);

  const levels: Record<string, number> = {};
  for (const k of deck) {
    const s = startLevel(C(k));
    levels[k] = Math.max(s, Math.min(MAX_LEVEL, Math.round(s + p.avgDeckLevel - 1 + randInt(rand, -1, 1) * 0.5)));
  }
  return {
    name: `${TITLES[randInt(rand, 0, TITLES.length - 1)]} ${NAMES[randInt(rand, 0, NAMES.length - 1)]}`,
    trophies: Math.max(0, p.trophies + randInt(rand, -40, 40)),
    kingLevel: Math.max(1, p.kingLevel + randInt(rand, -1, 1)),
    deck,
    levels,
  };
}
