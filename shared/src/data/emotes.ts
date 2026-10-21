/** Emotes. Por la red solo viaja el índice. Los 4 primeros son los del menú del jugador. */
export const EMOTES = [
  '¡Bien jugado!',
  '¡Ups!',
  '¡Grrr!',
  '¡Gracias!',
  '¡Toma ya!',
  '¡Ja, ja!',
  '¡Bien!',
  'Bien jugado',
  '¡Buena suerte!',
  '¡A por ello!',
] as const;

export const PLAYER_EMOTES = [0, 1, 2, 3];

export const emoteId = (text: string): number => Math.max(0, EMOTES.indexOf(text as (typeof EMOTES)[number]));
