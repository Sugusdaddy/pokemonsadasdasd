import { describe, expect, it } from 'vitest';
import { freshProfile } from '../src/meta/economy';
import {
  CLAN,
  canKick,
  canSetRole,
  checkCardRequest,
  cleanClanInput,
  donateCard,
  payClanCreation,
  type DonationState,
} from '../src/meta/clan';
import { censor, cleanChat, hasProfanity } from '../src/social/filter';
import { getCard, STARTER_DECK } from '../src/data/cards';
import { EconError } from '../src/meta/economy';

const NOW = Date.UTC(2026, 9, 21, 12);
const common = STARTER_DECK.find((k) => getCard(k).rarity === 'common')!;

describe('filtro de palabras', () => {
  it('detecta y tapa palabras en inglés y español, también disfrazadas', () => {
    for (const w of [
      'fuck',
      'FUUUCK',
      'sh1t',
      'puta',
      'p.u.t.a',
      'p u t a',
      'gilipollas',
      'cabrón',
      'hijodeputa',
      'cabrones',
      'bitches',
      'pendejos',
    ])
      expect(hasProfanity(w), w).toBe(true);
    expect(censor('hola puta madre')).toBe('hola **** madre');
    expect(cleanChat('  hi   <b>there</b> ')).toBe('hi bthere/b');
    expect(cleanChat('   ')).toBeNull();
  });

  it('no salta con palabras normales', () => {
    for (const w of [
      'class',
      'Scunthorpe',
      'cono de helado',
      'computadora',
      'assist',
      'hello friend',
      'buena partida',
      'buses',
      'classes',
      'shiitake',
    ])
      expect(hasProfanity(w), w).toBe(false);
  });
});

describe('clanes', () => {
  it('valida datos y cobra la creación', () => {
    expect(() => cleanClanInput({ name: 'ab' })).toThrow(EconError);
    const c = cleanClanInput({
      name: '  Los   Mejores ',
      description: 'x',
      badge: 99,
      type: 'closed',
      minTrophies: 1234,
    });
    expect(c).toEqual({
      name: 'Los Mejores',
      description: 'x',
      badge: CLAN.badges - 1,
      type: 'closed',
      minTrophies: 1200,
    });
    const s = freshProfile(NOW);
    s.gold = CLAN.createCost - 1;
    expect(() => payClanCreation(s)).toThrow(EconError);
    s.gold = CLAN.createCost;
    payClanCreation(s);
    expect(s.gold).toBe(0);
  });

  it('roles: nadie asciende a su propio rango ni toca a superiores', () => {
    expect(canSetRole('leader', 'member', 'coLeader')).toBe(true);
    expect(canSetRole('coLeader', 'member', 'elder')).toBe(true);
    expect(canSetRole('coLeader', 'member', 'coLeader')).toBe(false);
    expect(canSetRole('coLeader', 'coLeader', 'member')).toBe(false);
    expect(canSetRole('leader', 'coLeader', 'leader')).toBe(true); // ceder el liderazgo
    expect(canKick('elder', 'member')).toBe(true);
    expect(canKick('elder', 'elder')).toBe(false);
    expect(canKick('member', 'member')).toBe(false);
  });

  it('pedir cartas: solo comunes/raras propias y con espera entre peticiones', () => {
    const s = freshProfile(NOW);
    expect(checkCardRequest(s, common, null, NOW)).toBe(10);
    expect(() => checkCardRequest(s, common, NOW - 1000, NOW)).toThrow('err.clan.cooldown');
    expect(checkCardRequest(s, common, NOW - CLAN.requestCooldownMs, NOW)).toBe(10);
    expect(() => checkCardRequest(s, 'nope', null, NOW)).toThrow('err.clan.card');
  });

  it('donar: mueve la carta, premia al donante y respeta los límites', () => {
    const donor = freshProfile(NOW),
      rec = freshProfile(NOW);
    donor.cards[common].count = 10;
    const req: DonationState = { card: common, want: 10, got: 0, donors: {}, requesterId: 'R', createdAt: NOW };
    const gold = donor.gold;
    for (let i = 0; i < 4; i++) donateCard(req, 'D', donor, rec, NOW);
    expect(() => donateCard(req, 'D', donor, rec, NOW)).toThrow('err.clan.donorLimit');
    expect(donor.cards[common].count).toBe(6);
    expect(rec.cards[common].count).toBe(4);
    expect(donor.gold).toBe(gold + 20);
    expect(req).toMatchObject({ got: 4, donors: { D: 4 } });
    expect(() => donateCard(req, 'R', rec, rec, NOW)).toThrow('err.clan.ownRequest');
    expect(() => donateCard(req, 'E', donor, rec, NOW + CLAN.requestTtlMs + 1)).toThrow('err.clan.expired');
    const empty = freshProfile(NOW);
    expect(() => donateCard(req, 'E', empty, rec, NOW)).toThrow('err.clan.noCopies');
  });
});
