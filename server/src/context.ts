import crypto from 'node:crypto';
import { FRIENDLY_CODE_ALPHABET, NO_BALANCE, type Balance } from '@arena/shared';
import type { Store } from './store/types';

/** Ajustes del servidor (los tests los acortan). */
export interface ServerSettings {
  queueBotAfterMs: number;
  matchFillBotAfterMs: number;
  matchStartDelayMs: number;
  reconnectSeconds: number;
  /** Segundos que la sala sigue abierta tras el final (espectadores, pantalla de resultados). */
  linger: number;
}

/** Estado compartido por las salas de este proceso. */
export const ctx = {
  store: null as Store | null,
  settings: null as ServerSettings | null,
  /** Código amistoso → id de sala. */
  friendly: new Map<string, string>(),
  /** Wallets con acceso a la pestaña de admin (ADMIN_WALLETS). */
  adminWallets: new Set<string>(),
  /** Balance de cartas en vigor (se carga al arrancar y lo cambia el admin). Lo llevan las partidas nuevas. */
  balance: NO_BALANCE as Balance,
};

export function store(): Store {
  if (!ctx.store) throw new Error('Servidor sin almacén de datos');
  return ctx.store;
}

export function settings(): ServerSettings {
  if (!ctx.settings) throw new Error('Servidor sin configurar');
  return ctx.settings;
}

export function newFriendlyCode(): string {
  for (;;) {
    let code = '';
    for (let i = 0; i < 5; i++) code += FRIENDLY_CODE_ALPHABET[crypto.randomInt(FRIENDLY_CODE_ALPHABET.length)];
    if (!ctx.friendly.has(code)) return code;
  }
}
