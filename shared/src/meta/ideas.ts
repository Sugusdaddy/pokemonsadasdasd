// ─────────────────────────────────────────────────────────────
//  BUZÓN DE IDEAS: reglas puras (validar, límites y estados).
// ─────────────────────────────────────────────────────────────
import { hasProfanity, censor } from '../social/filter';
import { EconError } from './economy';

export const IDEAS = {
  titleMin: 6,
  titleMax: 60,
  bodyMax: 500,
  replyMax: 300,
  /** Ideas que puede proponer cada jugador al día. */
  perDay: 3,
  pageSize: 30,
} as const;

export const IDEA_CATEGORIES = ['cards', 'balance', 'modes', 'ui', 'other'] as const;
export type IdeaCategory = (typeof IDEA_CATEGORIES)[number];

/** open: en votación; planned: la haremos; done: hecha; rejected: descartada. */
export const IDEA_STATUSES = ['open', 'planned', 'done', 'rejected'] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];

export type IdeaSort = 'top' | 'new';

/** Lo que ve el cliente de una idea. */
export interface IdeaView {
  id: string;
  name: string;
  title: string;
  body: string;
  category: IdeaCategory;
  status: IdeaStatus;
  reply: string;
  votes: number;
  /** Has votado tú. */
  voted: boolean;
  /** Es tuya. */
  mine: boolean;
  /** Oculta por un admin (solo la ven los admins). */
  hidden: boolean;
  at: number;
}

const fail = (code: string): never => {
  throw new EconError(code);
};

const clean = (v: unknown, max: number): string =>
  typeof v === 'string'
    ? v
        .replace(/[<>]/g, '')
        .replace(/[^\S\n]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .slice(0, max)
    : '';

/** Valida una idea nueva: título sin palabrotas (se rechaza), texto censurado y categoría conocida. */
export function cleanIdea(raw: unknown): { title: string; body: string; category: IdeaCategory } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const title = clean(r.title, IDEAS.titleMax).replace(/\n/g, ' ');
  if (title.length < IDEAS.titleMin) fail('err.idea.title');
  if (hasProfanity(title)) fail('err.idea.language');
  const body = censor(clean(r.body, IDEAS.bodyMax));
  const category = IDEA_CATEGORIES.includes(r.category as IdeaCategory) ? (r.category as IdeaCategory) : 'other';
  return { title, body, category };
}

/** Respuesta de un admin (texto limpio, puede ir vacía). */
export const cleanReply = (raw: unknown): string => clean(raw, IDEAS.replyMax);
