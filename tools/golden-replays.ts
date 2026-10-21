/**
 * Repeticiones de referencia (determinismo):
 *
 *   npm run golden              comprueba que el motor actual las reproduce igual
 *   npm run golden -- --update  las vuelve a generar con el motor actual
 *
 * Son partidas bot contra bot con todo lo que toca la simulación: mazos al azar de las
 * 50 cartas, niveles, arenas, reglas (elixir x2/x3, muerte súbita), 2v2 y cambios de balance.
 * El test shared/test/golden.test.ts las vuelve a jugar y compara la huella final: si
 * cambia, las repeticiones que ya están guardadas en la base de datos dejarían de verse
 * igual. Regenerarlas (--update) es aceptar ese cambio a sabiendas.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BALANCE_STATS,
  CARDS,
  MAX_LEVEL,
  Rng,
  getCard,
  rulesOf,
  runBotMatch,
  runReplay,
  startLevel,
  statApplies,
  statRange,
  type Balance,
  type CardOverride,
  type MatchSetup,
  type PlayerSetup,
  type Replay,
  type RuleSet,
} from '../shared/src';

export interface GoldenCase {
  name: string;
  replay: Replay;
  hash: number;
  ticks: number;
}

const FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../shared/test/fixtures/golden-replays.json');
const KEYS = Object.keys(CARDS);

function player(rng: Rng): PlayerSetup {
  const deck = rng.shuffle([...KEYS]).slice(0, 8);
  const levels: Record<string, number> = {};
  for (const k of deck) {
    const lo = startLevel(getCard(k));
    levels[k] = rng.int(lo, Math.min(MAX_LEVEL, lo + 4));
  }
  return { deck, levels, kingLevel: rng.int(1, MAX_LEVEL) };
}

/** Cambios de balance al azar (dentro de los límites del panel de admin) en cartas de los mazos. */
function balance(rng: Rng, setup: MatchSetup): Balance {
  const decks = [setup.players.blue, setup.players.red, setup.partners?.blue, setup.partners?.red];
  const cards = [...new Set(decks.flatMap((p) => p?.deck ?? []))];
  const o: Record<string, CardOverride> = {};
  for (const k of rng.shuffle(cards).slice(0, 5)) {
    const card = getCard(k);
    const stat = rng.pick(BALANCE_STATS.filter((s) => statApplies(card, s)));
    const [lo, hi] = statRange(card, stat);
    o[k] = { [stat]: stat === 'hitSpeed' ? Math.round(rng.range(lo, hi) * 10) / 10 : rng.int(lo, hi) };
  }
  return { v: rng.int(1, 50), o };
}

function generate(): GoldenCase[] {
  const rng = new Rng(0x60fd);
  const plan: Array<{ name: string; rules?: RuleSet; twoVsTwo?: boolean; balance?: boolean }> = [
    ...Array.from({ length: 8 }, (_, i) => ({ name: `1v1 #${i + 1}` })),
    { name: 'elixir x2', rules: 'double' },
    { name: 'elixir x3', rules: 'triple' },
    { name: 'muerte súbita #1', rules: 'sudden' },
    { name: 'muerte súbita #2', rules: 'sudden' },
    ...Array.from({ length: 4 }, (_, i) => ({ name: `2v2 #${i + 1}`, twoVsTwo: true })),
    { name: '2v2 elixir x2', rules: 'double', twoVsTwo: true },
    { name: '2v2 muerte súbita', rules: 'sudden', twoVsTwo: true },
    ...Array.from({ length: 4 }, (_, i) => ({ name: `balance #${i + 1}`, balance: true })),
    { name: '2v2 balance', twoVsTwo: true, balance: true },
    { name: 'balance elixir x3', rules: 'triple', balance: true },
  ];
  return plan.map((p) => {
    const setup: MatchSetup = {
      seed: rng.nextU32(),
      arena: rng.int(0, 9),
      players: { blue: player(rng), red: player(rng) },
    };
    if (p.twoVsTwo) setup.partners = { blue: player(rng), red: player(rng) };
    if (p.rules) setup.rules = rulesOf(p.rules).rules;
    if (p.balance) setup.balance = balance(rng, setup);
    const { match, replay } = runBotMatch(setup);
    return { name: p.name, replay, hash: match.hash(), ticks: match.tick };
  });
}

/** Casos que el motor actual ya no reproduce igual. */
export function check(cases: GoldenCase[]): string[] {
  return cases.flatMap((c) => {
    const { match } = runReplay(c.replay);
    return match.hash() === c.hash && match.tick === c.ticks
      ? []
      : [`${c.name}: huella ${match.hash()} en el tick ${match.tick} (esperado ${c.hash} en ${c.ticks})`];
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--update') || !fs.existsSync(FILE)) {
    const cases = generate();
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    // una partida por línea: los cambios se leen mejor en git
    fs.writeFileSync(FILE, `[\n${cases.map((c) => JSON.stringify(c)).join(',\n')}\n]\n`);
    const kb = Math.round(fs.statSync(FILE).size / 1024);
    console.log(`[golden] ${cases.length} repeticiones guardadas (${kb} KB)`);
  } else {
    const cases = JSON.parse(fs.readFileSync(FILE, 'utf8')) as GoldenCase[];
    const bad = check(cases);
    console.log(bad.length ? bad.join('\n') : `[golden] ${cases.length}/${cases.length} iguales`);
    process.exitCode = bad.length ? 1 : 0;
  }
}
