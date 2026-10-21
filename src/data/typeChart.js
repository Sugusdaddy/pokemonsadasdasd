import { RULES } from '../config.js';

// Tabla de tipos (atacante → defensor). Solo se listan las relaciones no neutras.
const SE = {
  normal: [], fire: ['grass', 'ice', 'bug', 'steel'], water: ['fire', 'ground', 'rock'],
  electric: ['water', 'flying'], grass: ['water', 'ground', 'rock'], ice: ['grass', 'ground', 'flying', 'dragon'],
  fighting: ['normal', 'ice', 'rock', 'dark', 'steel'], poison: ['grass', 'fairy'],
  ground: ['fire', 'electric', 'poison', 'rock', 'steel'], flying: ['grass', 'fighting', 'bug'],
  psychic: ['fighting', 'poison'], bug: ['grass', 'psychic', 'dark'], rock: ['fire', 'ice', 'flying', 'bug'],
  ghost: ['psychic', 'ghost'], dragon: ['dragon'], dark: ['psychic', 'ghost'],
  steel: ['ice', 'rock', 'fairy'], fairy: ['fighting', 'dragon', 'dark'],
};
const NVE = {
  normal: ['rock', 'steel'], fire: ['fire', 'water', 'rock', 'dragon'], water: ['water', 'grass', 'dragon'],
  electric: ['electric', 'grass', 'dragon'], grass: ['fire', 'grass', 'poison', 'flying', 'bug', 'dragon', 'steel'],
  ice: ['fire', 'water', 'ice', 'steel'], fighting: ['poison', 'flying', 'psychic', 'bug', 'fairy'],
  poison: ['poison', 'ground', 'rock', 'ghost'], ground: ['grass', 'bug'], flying: ['electric', 'rock', 'steel'],
  psychic: ['psychic', 'steel'], bug: ['fire', 'fighting', 'poison', 'flying', 'ghost', 'steel', 'fairy'],
  rock: ['fighting', 'ground', 'steel'], ghost: ['dark'], dragon: ['steel'], dark: ['fighting', 'dark', 'fairy'],
  steel: ['fire', 'water', 'electric', 'steel'], fairy: ['fire', 'poison', 'steel'],
};
const IMMUNE = {
  normal: ['ghost'], electric: ['ground'], fighting: ['ghost'], poison: ['steel'], ground: ['flying'],
  psychic: ['dark'], ghost: ['normal'], dragon: ['fairy'],
};

/** Multiplicador de daño. Las torres no tienen tipo (siempre ×1). */
export function typeMultiplier(moveType, defenderTypes = []) {
  let m = 1;
  for (const d of defenderTypes) {
    if (IMMUNE[moveType]?.includes(d)) m *= RULES.typeMult.immune;
    else if (SE[moveType]?.includes(d)) m *= RULES.typeMult.super;
    else if (NVE[moveType]?.includes(d)) m *= RULES.typeMult.weak;
  }
  return m;
}
