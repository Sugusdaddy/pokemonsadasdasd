import { ARENAS, BALLS, EMOTES, RARITIES, type BallType, type Card, type Rarity } from '@arena/shared';
import { EN } from './en';
import { ES } from './es';

// ─────────────────────────────────────────────────────────────
//  IDIOMAS: t('clave', { parámetros }) devuelve el texto en el idioma actual.
//  Inglés por defecto; el jugador lo cambia en Perfil (se guarda en el navegador).
//  Para añadir un idioma: copia en.ts, tradúcelo y añádelo a DICTS y LANGS.
// ─────────────────────────────────────────────────────────────

export type Lang = 'en' | 'es';
export const LANGS: Array<{ id: Lang; label: string }> = [
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Español' },
];
const DICTS: Record<Lang, Record<string, string>> = { en: EN, es: ES };
const KEY = 'arenaRoyale.lang';
export const DEFAULT_LANG: Lang = 'en';

function load(): Lang {
  const q = new URLSearchParams(location.search).get('lang');
  if (q === 'en' || q === 'es') return q;
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'en' || v === 'es') return v;
  } catch {
    /* sin almacenamiento */
  }
  return DEFAULT_LANG;
}

let lang: Lang = load();
document.documentElement.lang = lang;

export const getLang = (): Lang => lang;

export function setLang(l: Lang): void {
  lang = l;
  document.documentElement.lang = l;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* sin almacenamiento */
  }
}

const missing = new Set<string>();

/** Texto traducido. {nombre} se sustituye por params.nombre. */
export function t(key: string, params?: Record<string, string | number>): string {
  let s = DICTS[lang][key] ?? DICTS.en[key] ?? DICTS.es[key];
  if (s === undefined) {
    if (import.meta.env.DEV && !missing.has(key)) {
      missing.add(key);
      console.warn(`[i18n] falta la clave "${key}"`);
    }
    s = key;
  }
  if (params) s = s.replace(/\{(\w+)\}/g, (_, k: string) => (params[k] !== undefined ? String(params[k]) : `{${k}}`));
  return s;
}

/** Igual que t() pero devuelve undefined si la clave no existe (para datos opcionales). */
function maybe(key: string): string | undefined {
  return DICTS[lang][key] ?? (lang === 'en' ? undefined : DICTS.en[key]);
}

// ───────────────────────── Datos del juego ─────────────────────────

/** Nombre de una carta: los Pokémon usan su nombre; los hechizos tienen nombre propio por idioma. */
export function cardName(card: Pick<Card, 'key' | 'name'>): string {
  return maybe(`card.${card.key}.name`) ?? (lang === 'es' ? card.name : card.name);
}

export function cardDesc(card: Pick<Card, 'key' | 'desc'>): string {
  return (lang === 'es' ? card.desc : maybe(`card.${card.key}.desc`)) ?? card.desc;
}

export const arenaName = (i: number): string =>
  (lang === 'es' ? ARENAS[i]?.name : maybe(`arena.${i}`)) ?? ARENAS[i]?.name ?? '';
export const rarityLabel = (r: Rarity): string =>
  (lang === 'es' ? RARITIES[r].label : maybe(`rarity.${r}`)) ?? RARITIES[r].label;
export const ballLabel = (b: BallType): string =>
  (lang === 'es' ? BALLS[b].label : maybe(`ball.${b}`)) ?? BALLS[b].label;
export const emoteText = (id: number): string =>
  (lang === 'es' ? EMOTES[id] : maybe(`emote.${id}`)) ?? EMOTES[id] ?? '…';
