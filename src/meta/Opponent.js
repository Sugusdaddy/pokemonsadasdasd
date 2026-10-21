import { MAX_LEVEL } from '../config.js';
import { cardsUpToArena, getCard, startLevel } from '../data/cards.js';

const NAMES = ['Álex', 'Marta', 'Leo', 'Nuria', 'Hugo', 'Sara', 'Iker', 'Lucía', 'Dani', 'Paula', 'Pol', 'Carla',
  'Bruno', 'Vega', 'Mario', 'Irene', 'Adri', 'Noa', 'Teo', 'Alba', 'Rubén', 'Julia', 'Gael', 'Lola'];
const TITLES = ['Entrenador', 'Entrenadora', 'Domador', 'Campeona', 'As', 'Rival', 'Montañero', 'Nadadora'];
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const shuffle = (a) => a.sort(() => Math.random() - 0.5);

/** Genera un rival con un mazo coherente para la arena del jugador. */
export function makeOpponent(profile) {
  const arena = profile.arena;
  const pool = cardsUpToArena(Math.min(5, arena + (Math.random() < 0.3 ? 1 : 0)));
  const C = (k) => getCard(k);
  const spells = shuffle(pool.filter((k) => C(k).type === 'spell'));
  const tanks = shuffle(pool.filter((k) => C(k).type !== 'spell' && (C(k).targets === 'buildings' || C(k).hp >= 1400)));
  const air = shuffle(pool.filter((k) => C(k).type !== 'spell' && C(k).targets === 'any' && !tanks.includes(k)));
  const rest = shuffle(pool.filter((k) => C(k).type !== 'spell'));
  const deck = [];
  const add = (k) => { if (k && !deck.includes(k) && deck.length < 8) deck.push(k); };
  add(spells[0]);
  add(tanks[0]);
  add(air[0]); add(air[1]); add(air[2]);
  for (const k of rest) add(k);
  for (const k of spells.slice(1)) add(k);

  const norm = profile.avgDeckLevel();
  const levels = {};
  for (const k of deck) {
    const s = startLevel(C(k));
    levels[k] = Math.max(s, Math.min(MAX_LEVEL, Math.round(s + norm - 1 + rand(-1, 1) * 0.5)));
  }
  return {
    name: `${TITLES[rand(0, TITLES.length - 1)]} ${NAMES[rand(0, NAMES.length - 1)]}`,
    trophies: Math.max(0, profile.d.trophies + rand(-40, 40)),
    kingLevel: Math.max(1, profile.d.kingLevel + rand(-1, 1)),
    deck,
    levels,
  };
}
