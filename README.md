# Arena Royale

Fan game para navegador al estilo de Clash Royale, con sprites de Pokémon del pack PMD SpriteCollab.

> **Proyecto de fans no oficial y sin afiliación.** Pokémon © Nintendo / Creatures / GAME FREAK / The Pokémon Company.
> Clash Royale © Supercell. Este proyecto no está autorizado por ninguna de ellas y pueden pedir que se retire.
> Mira [Licencias y créditos](#licencias-y-créditos).

Versión 3 (en desarrollo, **Fase 0: base técnica**). Phaser 3 + TypeScript estricto + Vite en un monorepo con la
simulación de batalla separada del dibujo, preparada para el servidor autoritativo de la Fase 1.

## Arrancarlo

Necesitas **Node 18.18 o superior** (recomendado Node 22 LTS).

1. Copia tu carpeta **`SpritesPokemon`** dentro de `assets/` (debe quedar `assets/SpritesPokemon/animations_metadata.json`).
2. `npm install`
3. `npm run dev` → abre `http://localhost:5173`

La primera vez, `npm run dev` ejecuta `npm run assets`, que genera los atlas de sprites en `client/public/gen/` (unos 5 s).

> Para probar rápido: en **Perfil → Modo prueba** tienes +5000 oro, +500 gemas y +300 trofeos.

| Comando                   | Qué hace                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------ |
| `npm run dev`             | Servidor de desarrollo con recarga en caliente                                       |
| `npm run build`           | Build de producción en `client/dist/` (estático, se puede subir a cualquier hosting) |
| `npm run assets`          | Regenera atlas y `pack.json` desde el pack de sprites                                |
| `npm run assets:fan-only` | Igual, pero solo con sprites de fans (ver [ART_PIPELINE.md](ART_PIPELINE.md))        |
| `npm test`                | Tests (Vitest) de la simulación, los datos y la meta                                 |
| `npm run lint`            | ESLint                                                                               |
| `npm run typecheck`       | TypeScript en los cuatro proyectos                                                   |
| `npm run format`          | Prettier                                                                             |
| `npm run check`           | typecheck + lint + tests                                                             |

## Estructura

```
shared/   TypeScript puro, sin Phaser. Lo usan el cliente, el servidor y los tests.
  src/config.ts        Todo el balance: arenas, rarezas, mejoras, Pokéballs, economía, IA, torres, arte
  src/data/cardDefs.ts Las 41 cartas y el mazo inicial
  src/data/cards.ts    Resolución de cartas (valores por defecto a partir del pack) y niveles
  src/data/pack.json   Datos del pack que necesita el juego (generado por `npm run assets`, va en git)
  src/sim/             La simulación de batalla (determinista, 20 Hz)
    match.ts           Match: estado, reglas, tropas, torres, proyectiles, hechizos, coronas, tiempo extra
    bot.ts             IA del rival: lee el estado y genera inputs, como un jugador
    rng.ts / math.ts   RNG con semilla y matemáticas deterministas
    replay.ts          Repeticiones (semilla + inputs) y partidas bot contra bot
  src/meta/            Pokéballs, camino de trofeos y generación de rivales
  test/                Tests de Vitest
client/   El juego en Phaser (solo dibuja e interpola)
  src/scenes/          Boot, Lobby (menú), BallOpen (apertura de Pokéball), Battle
  src/battle/          Vistas de tropas, torres y proyectiles + pools de efectos
  src/ui/              Mano, cartas, modales, pestañas del menú
  src/meta/Profile.ts  Progreso del jugador (localStorage hasta la Fase 2)
  src/net/rewards.ts   Punto de enganche al terminar cada partida
server/   Vacío hasta la Fase 1 (servidor autoritativo)
tools/    build-assets.ts (atlas + pack.json), ensure-assets.ts
```

## Cómo funciona una batalla

```
 jugador (Hand) ──► input "jugar carta X en (x, y)" ─┐
 bot (sim/bot.ts) ─► input ──────────────────────────┤
                                                     ▼
                         Match.step(inputs)   cada 50 ms (20 Hz, tick fijo)
                                                     │
                       estado (posiciones, vida…) + eventos (golpe, muerte, corona…)
                                                     ▼
 BattleScene: interpola posiciones entre ticks y convierte eventos en animaciones, efectos y sonido
```

- **Determinista**: con la misma semilla y los mismos inputs en los mismos ticks, la partida es idéntica en cualquier
  motor de JS. La simulación no usa `Math.random`, `Math.hypot`, `Math.pow`, `sin`/`cos` ni el reloj (ESLint lo
  impide en `shared/src/sim`).
- **Validación**: `Match.canPlay(team, carta, x, y)` comprueba mano, elixir y zona. Un input inválido se ignora.
  En la Fase 1, el servidor usará exactamente esta función.
- **Repeticiones**: al acabar, la partida se guarda en `localStorage` (`arenaRoyale.lastReplay`) como
  `{ setup (con la semilla), inputs }`. `runReplay()` la reproduce sin dibujar nada (una partida entera tarda unos 15 ms).
- **Simétrica**: los dos lados juegan con las mismas reglas. Un test hace jugar al mismo bot arriba y abajo y comprueba
  que la partida sale reflejada tick a tick.

### Cambios de reglas respecto a la v2 (necesarios para jugar online)

- **Las torres atacan sin tipo.** Los guardianes son distintos en cada lado (Pikachu y Squirtle abajo, Mewtwo y
  Gastly arriba). Con efectividad de tipos, un lado tenía ventaja. Ahora los guardianes solo son decoración.
- **Los proyectiles viajan sobre el suelo.** En la v2 salían y llegaban a alturas "visuales", así que los disparos
  hacia arriba llegaban antes que los disparos hacia abajo. Ahora la altura solo existe al dibujar.
- **Las formaciones de 3 tropas se orientan hacia el rival** en los dos lados.
- El retardo de los hechizos pasa de 560 ms a 550 ms (11 ticks).

## Añadir una carta

En `shared/src/data/cardDefs.ts`:

```ts
lapras: { pokemon: 131, cost: 5, rarity: 'epic', arena: 3 },   // el resto se calcula del pack
```

O con todos los detalles (campos explicados en `shared/src/data/cards.ts`):

```ts
lapras: {
  pokemon: 131, cost: 5, rarity: 'epic', arena: 3,
  hp: 1500, dmg: 120, hitSpeed: 1.6, range: 5 * T, splash: 1 * T,
  speed: 'slow', move: 'ice-beam', targets: 'any', desc: 'Rayo hielo en área.',
},
```

Si la carta usa un Pokémon nuevo, ejecuta `npm run assets` (y `npm test` para comprobar los datos).

## Arte y modo "solo fans"

Ver [ART_PIPELINE.md](ART_PIPELINE.md): cómo se generan los atlas, la opción `ART.spriteSource = 'fan-only'`
(sustituye los sprites oficiales y mixtos por una criatura genérica) y cómo poner arte propio con la misma estructura.

## Premios: léelo antes

`client/src/net/rewards.ts` recibe cada resultado, pero **viene del navegador y se puede falsificar**. Antes de repartir
nada, el resultado lo tiene que decidir un servidor re-ejecutando la repetición con `/shared/sim` (Fase 1). La clave de
la wallet nunca puede estar en el cliente. Revisa también la normativa de premios de tu país y las licencias del arte.

## Licencias y créditos

- **Código**: tuyo.
- **Phaser**: MIT (paquete `phaser` de npm).
- **Sprites**: PMD SpriteCollab. En `CREDITS.md` tienes el autor y el origen de los 966 Pokémon:
  - **362 son sprites oficiales** de _Pokémon Mundo Misterioso_ (Chunsoft) y **130 son mixtos**. A esos no les aplica
    ninguna licencia abierta.
  - **474 son de fans**, con licencia **CC BY-NC 4.0**: no comercial y con atribución obligatoria.
  - Ninguno de los 41 Pokémon que usan ahora las cartas es 100 % de fans.
- **Pokémon** © Nintendo / Creatures / GAME FREAK / The Pokémon Company. Proyecto de fans no autorizado. Tampoco uses
  el nombre, el logo ni el arte de Clash Royale (Supercell).

Si quieres hacerlo público, monetizarlo o repartir premios, sustituye los Pokémon por criaturas propias con la misma
estructura de carpetas y el mismo `animations_metadata.json` (ver [ART_PIPELINE.md](ART_PIPELINE.md)).
