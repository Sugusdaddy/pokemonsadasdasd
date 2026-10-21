/**
 * Sonda de balance (no es un test): enfrenta mazos de bots que solo se diferencian en
 * una carta y cuenta victorias. Sirve para ver si una carta nueva está muy pasada o
 * no sirve para nada antes de ajustar sus números en cardDefs.ts.
 *
 *   npx tsx tools/balance-probe.ts [partidas por carta = 120]
 */
import { runBotMatch, type MatchSetup } from '../shared/src/sim';

const N = Number(process.argv[2] ?? 120);
const BASE = ['pikachu', 'bulbasaur', 'charmander', 'squirtle', 'machop', 'golem', 'rockslide'];
const SWAP = 'eevee'; // la carta "neutra" contra la que se compara
const CANDIDATES = process.argv[3]
  ? process.argv[3].split(',')
  : ['forretress', 'magneton', 'vespiquen', 'chansey', 'combee', 'poison', 'freeze', 'heal', 'rage'];

function duel(card: string): { wins: number; losses: number; draws: number } {
  const r = { wins: 0, losses: 0, draws: 0 };
  for (let i = 0; i < N; i++) {
    // se alternan los lados para que no influya quién juega abajo
    const mine = i % 2 === 0 ? 'blue' : 'red';
    const theirs = mine === 'blue' ? 'red' : 'blue';
    const setup: MatchSetup = {
      seed: 1000 + i,
      arena: 4,
      players: {
        [mine]: { deck: [...BASE, card], levels: {}, kingLevel: 5 },
        [theirs]: { deck: [...BASE, SWAP], levels: {}, kingLevel: 5 },
      } as MatchSetup['players'],
    };
    const { match } = runBotMatch(setup);
    if (match.winner === mine) r.wins++;
    else if (match.winner === 'draw' || !match.winner) r.draws++;
    else r.losses++;
  }
  return r;
}

for (const c of CANDIDATES) {
  const r = duel(c);
  const pct = Math.round((100 * (r.wins + r.draws / 2)) / N);
  console.log(`${c.padEnd(11)} ${String(pct).padStart(3)} %  (${r.wins}G ${r.losses}P ${r.draws}E)`);
}
