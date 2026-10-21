import { describe, expect, it } from 'vitest';
import { ARENAS, BALLS, FREE_BALL_EVERY } from '../src/config';
import {
  EconError,
  freshProfile,
  upgrade,
  cardsNeeded,
  goldNeeded,
  startUnlock,
  tickSlots,
  skip,
  skipCost,
  openSlot,
  claimFreeBall,
  claimRoad,
  dailyOffers,
  buyCardOffer,
  claimDailyGift,
  buyBall,
  buyGold,
  applyBattle,
  setDeckCard,
  setName,
  sanitize,
  arenaOf,
  refreshShop,
  shopDay,
  type ProfileState,
} from '../src/meta/economy';
import { Rng } from '../src/sim/rng';

const T0 = Date.UTC(2026, 9, 21, 12, 0, 0);
const rnd = () => {
  const r = new Rng(3);
  return () => r.next();
};
const code = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    if (e instanceof EconError) return e.code;
    throw e;
  }
  return 'ok';
};
const fresh = (): ProfileState => freshProfile(T0);

describe('economía', () => {
  it('mejorar una carta cobra cartas y oro, y no deja si falta algo', () => {
    const s = fresh();
    expect(code(() => upgrade(s, 'bulbasaur'))).toBe('econ.cards');
    s.cards.bulbasaur.count = cardsNeeded(s, 'bulbasaur');
    s.gold = goldNeeded(s, 'bulbasaur') - 1;
    expect(code(() => upgrade(s, 'bulbasaur'))).toBe('econ.gold');
    s.gold += 1;
    const r = upgrade(s, 'bulbasaur');
    expect(r.level).toBe(2);
    expect(s.gold).toBe(0);
    expect(s.cards.bulbasaur.count).toBe(0);
    expect(code(() => upgrade(s, 'mewtwo'))).toBe('econ.cards');
    expect(code(() => upgrade(s, 'no-existe'))).toBe('econ.notOwned');
  });

  it('las Pokéballs se desbloquean con la hora del servidor (de una en una) y se pueden saltar con gemas', () => {
    const s = fresh();
    s.slots[1] = { type: 'poke', arena: 0, state: 'locked' };
    s.slots[2] = { type: 'super', arena: 0, state: 'locked' };
    startUnlock(s, 1, T0);
    expect(code(() => startUnlock(s, 2, T0))).toBe('econ.alreadyUnlocking');
    expect(code(() => openSlot(s, 1, T0 + 1000, rnd()))).toBe('econ.notReady');
    tickSlots(s, T0 + BALLS.poke.unlock * 1000);
    expect(s.slots[1]!.state).toBe('ready');
    const reward = openSlot(s, 1, T0 + BALLS.poke.unlock * 1000, rnd());
    expect(reward.cards.length).toBeGreaterThan(0);
    expect(s.slots[1]).toBeNull();
    // saltar: cuesta gemas según el tiempo que falta
    const cost = skipCost(s.slots[2], T0);
    s.gems = cost - 1;
    expect(code(() => skip(s, 2, T0))).toBe('econ.gems');
    s.gems = cost;
    skip(s, 2, T0);
    expect(s.gems).toBe(0);
    expect(s.slots[2]!.state).toBe('ready');
  });

  it('la Ball gratis solo se puede reclamar cada 10 minutos', () => {
    const s = fresh();
    claimFreeBall(s, T0, rnd());
    expect(code(() => claimFreeBall(s, T0 + 60_000, rnd()))).toBe('econ.notReady');
    expect(code(() => claimFreeBall(s, T0 + FREE_BALL_EVERY * 1000, rnd()))).toBe('ok');
  });

  it('el camino de trofeos exige haber llegado y no se cobra dos veces', () => {
    const s = fresh();
    expect(code(() => claimRoad(s, 50, rnd()))).toBe('econ.road');
    s.maxTrophies = 60;
    const gold = s.gold;
    claimRoad(s, 50, rnd());
    expect(s.gold).toBeGreaterThan(gold);
    expect(code(() => claimRoad(s, 50, rnd()))).toBe('econ.claimed');
    expect(code(() => claimRoad(s, 51, rnd()))).toBe('econ.road');
  });

  it('tienda: ofertas iguales para todos ese día, compra única y regalo diario', () => {
    const s = fresh();
    refreshShop(s, T0);
    expect(s.shop.day).toBe(shopDay(T0));
    const offers = dailyOffers(s.shop.day, arenaOf(s));
    expect(offers).toEqual(dailyOffers(s.shop.day, arenaOf(s)));
    expect(offers).toHaveLength(6);
    const cheap = offers.find((o) => o.price <= s.gold)!;
    const r = buyCardOffer(s, cheap.id, T0);
    expect(r.key).toBe(cheap.key);
    expect(code(() => buyCardOffer(s, cheap.id, T0))).toBe('econ.claimed');
    expect(code(() => buyCardOffer(s, 'inventada', T0))).toBe('econ.offer');
    claimDailyGift(s, T0);
    expect(code(() => claimDailyGift(s, T0))).toBe('econ.claimed');
    // al día siguiente se renueva
    expect(code(() => claimDailyGift(s, T0 + 86_400_000))).toBe('ok');
    s.gems = 0;
    expect(code(() => buyBall(s, 'master', rnd()))).toBe('econ.gems');
    expect(code(() => buyGold(s, 0))).toBe('econ.gems');
    expect(code(() => buyGold(s, 9))).toBe('econ.offer');
  });

  it('recompensas de batalla: trofeos, oro, ball y nunca baja de la arena', () => {
    const s = fresh();
    const win = applyBattle(s, 'win', 3, rnd());
    expect(win.trophies).toBeGreaterThan(0);
    expect(win.gold).toBeGreaterThan(0);
    expect(win.ball).not.toBeNull();
    expect(s.stats.threeCrowns).toBe(1);
    s.trophies = ARENAS[1].trophies + 5;
    const loss = applyBattle(s, 'loss', 0, rnd());
    expect(s.trophies).toBe(ARENAS[1].trophies); // el suelo de la arena
    expect(loss.trophies).toBe(-5);
  });

  it('mazos y nombre se validan', () => {
    const s = fresh();
    expect(code(() => setDeckCard(s, 0, 'mewtwo'))).toBe('econ.notOwned');
    expect(code(() => setDeckCard(s, 9, 'pikachu'))).toBe('econ.deck');
    const deck = s.decks[0];
    const b = deck[1];
    setDeckCard(s, 1, deck[0]); // intercambio
    expect(deck[0]).toBe(b);
    expect(code(() => setName(s, ''))).toBe('econ.name');
    expect(code(() => setName(s, 'x'.repeat(30)))).toBe('econ.name');
    setName(s, '  Ash   Ketchum ');
    expect(s.name).toBe('Ash Ketchum');
  });

  it('sanitize quita cartas que ya no existen y rellena mazos', () => {
    const s = fresh();
    s.cards['vieja'] = { level: 1, count: 0 };
    s.decks[0] = ['vieja', 'pikachu'];
    sanitize(s);
    expect(s.cards['vieja']).toBeUndefined();
    expect(s.decks[0]).toHaveLength(8);
    expect(new Set(s.decks[0]).size).toBe(8);
  });
});
