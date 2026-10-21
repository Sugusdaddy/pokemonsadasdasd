import { BALLS } from '../config.js';
import { cardsUpToArena, getCard } from '../data/cards.js';

const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const ORDER = ['common', 'rare', 'epic', 'legendary'];

/** Reparte n cartas en k montones de cartas distintas de la lista. */
function stacks(pool, n, k) {
  if (n <= 0 || !pool.length) return [];
  const keys = [...pool].sort(() => Math.random() - 0.5).slice(0, Math.max(1, Math.min(k, pool.length, n)));
  const counts = keys.map(() => 1);
  for (let i = keys.length; i < n; i++) counts[Math.floor(Math.random() * keys.length)] += 1;
  return keys.map((key, i) => ({ key, count: counts[i], rarity: getCard(key).rarity }));
}

/**
 * Calcula el contenido de una Pokéball. Cambia aquí las probabilidades.
 * Devuelve { type, gold, gems, cards: [{ key, count, rarity }] } (de común a legendaria).
 */
export function rollBall(type, arena) {
  const cfg = BALLS[type];
  const mult = 1 + arena * 0.2;
  const total = Math.round(cfg.cards * mult);
  const legendary = cfg.legendaryChance >= 1 ? 1 : Math.random() < cfg.legendaryChance ? 1 : 0;
  const epic = Math.floor(cfg.epic) + (Math.random() < cfg.epic % 1 ? 1 : 0);
  const rare = Math.round(cfg.rare * mult);
  const want = { legendary, epic, rare, common: 0 };
  want.common = Math.max(0, total - legendary - epic - rare);

  const pools = {};
  for (const r of ORDER) pools[r] = cardsUpToArena(arena).filter((k) => getCard(k).rarity === r);
  // si no hay cartas de una rareza en esta arena, baja a la siguiente
  for (let i = ORDER.length - 1; i > 0; i--) {
    const r = ORDER[i];
    if (!pools[r].length && want[r]) {
      const mult2 = [1, 10, 50, 0][i];
      want[ORDER[i - 1]] += want[r] * Math.max(1, Math.round(mult2 / 5));
      want[r] = 0;
    }
  }

  const cards = [
    ...stacks(pools.common, want.common, 3 + Math.floor(arena / 2)),
    ...stacks(pools.rare, want.rare, 2),
    ...stacks(pools.epic, want.epic, 2),
    ...stacks(pools.legendary, want.legendary, 1),
  ];
  return {
    type,
    gold: Math.round(randInt(cfg.gold[0], cfg.gold[1]) * mult),
    gems: randInt(cfg.gems[0], cfg.gems[1]),
    cards,
  };
}

export { pick };
