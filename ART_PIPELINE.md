# Pipeline de arte

El juego no carga los PNG del pack directamente: `npm run assets` (`tools/build-assets.ts`) los convierte en
atlas y datos. Así se puede cambiar todo el arte sin tocar el código.

```
assets/SpritesPokemon/            ← pack de origen (no va en git)
  animations_metadata.json
  pokemon/<ID>_<Nombre>/normal/{Walk,Attack,Idle,Shoot,Charge,Hurt,Faint}.png
  attacks/moves/<ataque>.png, attacks/vfx_shapes/impact_*.png, attacks/types/type_*.png
        │
        ▼  npm run assets
shared/src/data/pack.json         ← datos de juego (tipos, stats, duraciones). Va en git: la simulación
                                    y el servidor no necesitan el arte.
client/public/gen/                ← atlas (no van en git)
  manifest.json                   ← lista de atlas + frames, anclas y tiempos de cada animación
  portraits.json/-N.png           ← Idle mirando abajo de todos los Pokémon (menú y cartas)
  pk/<id>.json/-N.png             ← todas las animaciones de cada Pokémon (se cargan solo en batalla)
  fx.json/-N.png                  ← proyectiles, impacto e iconos de tipo
```

Solo se empaquetan los Pokémon que usa el juego (cartas, guardianes de las torres y "estrellas" de las arenas).
Los frames se recortan (sin espacio transparente) y los idénticos se guardan una sola vez.

## Modo "solo sprites de fans"

`ART.spriteSource` en `shared/src/config.ts`, o directamente:

```
npm run assets:fan-only
```

El origen de cada sprite sale de la tabla "Todo el pack" de `CREDITS.md` (Oficial / Mixto / Fans). En este modo, los
oficiales (Chunsoft) y los mixtos se sustituyen por una **criatura genérica** del color de su tipo, con el mismo
tamaño de frame, ancla y número de frames, así que el juego funciona igual.

> Hoy ninguno de los 41 Pokémon que usan las cartas es 100 % de fans, así que en este modo todos salen genéricos.
> Para un lanzamiento público hace falta arte propio (siguiente apartado).

## Arte propio (criaturas originales)

1. Crea `assets/custom/` con **la misma estructura** que `SpritesPokemon`:
   - `animations_metadata.json` con las mismas claves (`pokemon`, `attacks`, `type_palettes`, `vfx_shapes`,
     `system_specification.cast_animation_rules`, `project_info`).
   - Para cada criatura, `pokemon/<ID>_<Nombre>/normal/<Anim>.png`: hoja con los frames en columnas y
     8 direcciones en filas (Abajo, Abajo-Dcha, Dcha, Arriba-Dcha, Arriba, Arriba-Izq, Izq, Abajo-Izq).
   - En los metadatos de cada animación: `frame_width`, `frame_height`, `frame_count`, `frame_durations_ticks`
     (1/60 s), `total_duration_sec`, `ground_anchor` (píxel de los pies) y `files.normal`.
   - Puedes reutilizar los IDs actuales (las cartas apuntan a `pokemon: <ID>`) o cambiar los IDs en
     `shared/src/data/cardDefs.ts`.
2. Pon `ART.root = 'assets/custom/'` en `shared/src/config.ts` (o ejecuta `npm run assets -- --root assets/custom`).
3. `npm run assets`. Con un pack distinto de `SpritesPokemon`, todos los sprites se marcan como `custom` en `pack.json`.
4. Actualiza `CREDITS.md` con los autores de tu arte y quita los créditos de sprites que ya no uses.

Las estadísticas que se calculan del pack (vida y daño por defecto, velocidad, si vuela…) salen de los metadatos,
así que si tus criaturas tienen otros `stats`, revisa el balance con `npm test` y una partida.

## Mientras se usen sprites de Pokémon

- Siempre visibles: el aviso de fan game no afiliado y los créditos (`CREDITS.md`, README).
- No se puede monetizar ni repartir premios con los sprites oficiales ni con los CC BY-NC.
