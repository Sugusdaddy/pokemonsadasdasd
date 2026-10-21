import crypto from 'node:crypto';
import { FRIENDLY_CODE_ALPHABET } from '@arena/shared';
import type { ReplayStore } from './replays';

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
  replays: null as ReplayStore | null,
  settings: null as ServerSettings | null,
  /** Código amistoso → id de sala. */
  friendly: new Map<string, string>(),
};

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

export const newTicket = (): string => crypto.randomBytes(12).toString('hex');
