import { ARENAS } from '../config.js';

/**
 * Camino de trofeos: una recompensa cada 50 trofeos.
 * Tipos: { gold }, { gems }, { ball: 'super' | 'ultra' | 'master' }
 */
export const ROAD = (() => {
  const out = [];
  const max = ARENAS[ARENAS.length - 1].trophies + 600;
  for (let t = 50; t <= max; t += 50) {
    let reward;
    if (ARENAS.some((a) => a.trophies === t) || t % 500 === 0) reward = { ball: t >= 1500 ? 'master' : 'ultra' };
    else if (t % 200 === 0) reward = { ball: 'super' };
    else if (t % 100 === 0) reward = { gems: 20 + Math.floor(t / 100) * 2 };
    else reward = { gold: 60 + Math.floor(t / 10) * 2 };
    out.push({ trophies: t, reward });
  }
  return out;
})();

export function rewardLabel(r) {
  if (r.gold) return `${r.gold} de oro`;
  if (r.gems) return `${r.gems} gemas`;
  if (r.ball) return { super: 'Super Ball', ultra: 'Ultra Ball', master: 'Master Ball' }[r.ball] || r.ball;
  return '';
}
