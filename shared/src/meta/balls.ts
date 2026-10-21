import { BALLS, RARITY_ORDER, type BallType, type Rarity } from '../config';
import { cardsUpToArena, getCard } from '../data/cards';
import { defaultRand, randInt, shuffle, type RandFn } from './random';

export interface BallCardStack {
  key: string;
  count: number;
  rarity: Rarity;
  isNew?: boolean;
}

export interface BallReward {
  type: BallType;
  gold: number;
  gems: number;
  /** De común a legendaria. */
  cards: BallCardStack[];
}

/** Reparte n cartas en k montones de cartas distintas de la lista. */
function stacks(rand: RandFn, pool: string[], n: number, k: number): BallCardStack[] {
  if (n <= 0 || !pool.length) return [];
  const keys = shuffle(rand, [...pool]).slice(0, Math.max(1, Math.min(k, pool.length, n)));
  const counts = keys.map(() => 1);
  for (let i = keys.length; i < n; i++) counts[Math.floor(rand() * keys.length)] += 1;
  return keys.map((key, i) => ({ key, count: counts[i], rarity: getCard(key).rarity }));
}

/** Calcula el contenido de una Pokéball. Cambia aquí las probabilidades. */
export function rollBall(type: BallType, arena: number, rand: RandFn = defaultRand): BallReward {
  const cfg = BALLS[type];
  const mult = 1 + arena * 0.2;
  const total = Math.round(cfg.cards * mult);
  const legendary = cfg.legendaryChance >= 1 ? 1 : rand() < cfg.legendaryChance ? 1 : 0;
  const epic = Math.floor(cfg.epic) + (rand() < cfg.epic % 1 ? 1 : 0);
  const rare = Math.round(cfg.rare * mult);
  const want: Record<Rarity, number> = { legendary, epic, rare, common: 0 };
  want.common = Math.max(0, total - legendary - epic - rare);

  const pools = {} as Record<Rarity, string[]>;
  for (const r of RARITY_ORDER) pools[r] = cardsUpToArena(arena).filter((k) => getCard(k).rarity === r);
  // si no hay cartas de una rareza en esta arena, baja a la siguiente
  for (let i = RARITY_ORDER.length - 1; i > 0; i--) {
    const r = RARITY_ORDER[i];
    if (!pools[r].length && want[r]) {
      const mult2 = [1, 10, 50, 0][i];
      want[RARITY_ORDER[i - 1]] += want[r] * Math.max(1, Math.round(mult2 / 5));
      want[r] = 0;
    }
  }

  const cards = [
    ...stacks(rand, pools.common, want.common, 3 + Math.floor(arena / 2)),
    ...stacks(rand, pools.rare, want.rare, 2),
    ...stacks(rand, pools.epic, want.epic, 2),
    ...stacks(rand, pools.legendary, want.legendary, 1),
  ];
  return {
    type,
    gold: Math.round(randInt(rand, cfg.gold[0], cfg.gold[1]) * mult),
    gems: randInt(rand, cfg.gems[0], cfg.gems[1]),
    cards,
  };
}
