// ─────────────────────────────────────────────────────────────
//  FILTRO DE PALABRAS (inglés y español) para chat, nombres y clanes.
//  Normaliza acentos, "leet" (4→a, 3→e, 0→o…), letras repetidas y separadores
//  para que "p.u.t.a", "fuuuuck" o "sh1t" también se detecten.
//  Para ampliar la lista, añade la palabra en minúsculas y sin acentos.
// ─────────────────────────────────────────────────────────────

const WORDS = [
  // inglés
  'fuck',
  'fucker',
  'fucking',
  'motherfucker',
  'shit',
  'bullshit',
  'bitch',
  'bastard',
  'asshole',
  'dick',
  'cock',
  'pussy',
  'cunt',
  'whore',
  'slut',
  'fag',
  'faggot',
  'retard',
  'nigger',
  'nigga',
  'kys',
  'rape',
  'rapist',
  'wanker',
  'twat',
  'dickhead',
  // español
  'puta',
  'puto',
  'putas',
  'putos',
  'hijoputa',
  'hijodeputa',
  'mierda',
  'cabron',
  'cabrona',
  'gilipollas',
  'pendejo',
  'pendeja',
  'joder',
  'coño',
  'polla',
  'zorra',
  'maricon',
  'marica',
  'culero',
  'chinga',
  'chingada',
  'verga',
  'mamon',
  'subnormal',
  'malparido',
  'gonorrea',
  'carajo',
  'follar',
  'puticlub',
  'retrasado',
];

const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
  '!': 'i',
};

/** Minúsculas, sin acentos (salvo la ñ), leet traducido y letras repetidas reducidas a una. */
export function normalizeWord(w: string): string {
  return w
    .toLowerCase()
    .replace(/ñ/g, '\u0001')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // eslint-disable-next-line no-control-regex -- marcador temporal para conservar la ñ
    .replace(/\u0001/g, 'ñ')
    .replace(/[013457@$!]/g, (c) => LEET[c] ?? c)
    .replace(/[^a-zñ]/g, '')
    .replace(/(.)\1+/g, '$1');
}

const BAD = new Set(WORDS.map(normalizeWord));
// raíces que se buscan dentro de palabras más largas (p. ej. "fuckyou", "putamadre")
const ROOTS = ['fuck', 'nigger', 'nigga', 'faggot', 'hijoputa', 'hijodeputa', 'gilipollas', 'motherfucker'].map(
  normalizeWord,
);

/** La palabra tal cual o sin plural ("cabrones" → "cabron", "bitches" → "bitch", "shits" → "shit"). */
const isBad = (n: string): boolean =>
  n.length > 1 &&
  (BAD.has(n) ||
    (n.endsWith('es') && BAD.has(n.slice(0, -2))) ||
    (n.endsWith('s') && BAD.has(n.slice(0, -1))) ||
    ROOTS.some((r) => n.includes(r)));

/**
 * ¿Hay alguna palabra malsonante? También con separadores: "f.u.c.k" (un solo token)
 * o "p u t a" (letras sueltas seguidas, que se juntan antes de comprobar).
 */
export function hasProfanity(text: string): boolean {
  let run = '';
  for (const tok of text.split(/\s+/)) {
    const n = normalizeWord(tok);
    if (isBad(n)) return true;
    if (n.length === 1) run += n;
    else {
      if (isBad(run)) return true;
      run = '';
    }
  }
  return isBad(run);
}

/** Sustituye por asteriscos las palabras malsonantes (conserva la longitud). */
export function censor(text: string): string {
  const out = text.replace(/\S+/g, (tok) => (isBad(normalizeWord(tok)) ? '*'.repeat(tok.length) : tok));
  // si aún queda algo escrito con separadores, se tapa el mensaje entero
  return hasProfanity(out) ? '*'.repeat(Math.min(out.length, 12)) : out;
}

export const CHAT = {
  maxLength: 140,
  /** Ráfaga: como mucho `burst` mensajes cada `windowMs`. */
  burst: 5,
  windowMs: 15_000,
  /** Pausa mínima entre mensajes. */
  minGapMs: 800,
  /** Denuncias de jugadores distintos para ocultar un mensaje y silenciar a su autor. */
  reportsToMute: 3,
  muteMs: 24 * 60 * 60 * 1000,
} as const;

/** Limpia un mensaje de chat: espacios, longitud, sin < > y censurado. Null si queda vacío. */
export function cleanChat(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw
    // eslint-disable-next-line no-control-regex -- quitar caracteres de control del chat
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CHAT.maxLength);
  return t ? censor(t) : null;
}
