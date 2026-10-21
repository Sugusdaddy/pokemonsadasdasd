import { RULES } from '../config.js';

/** Ciclo de cartas estilo Clash Royale: 4 en mano, la jugada va al final de la cola. */
export class CardCycle {
  constructor(keys) {
    const deck = [...keys];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    this.hand = deck.slice(0, RULES.handSize);
    this.queue = deck.slice(RULES.handSize);
  }

  get next() { return this.queue[0]; }

  play(i) {
    const k = this.hand[i];
    this.hand[i] = this.queue.shift();
    this.queue.push(k);
    return k;
  }
}
