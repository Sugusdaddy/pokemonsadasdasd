# Arena Royale

Fan game para navegador al estilo de Clash Royale, con sprites de Pokémon del pack PMD SpriteCollab.

> **Proyecto de fans no oficial y sin afiliación.** Pokémon © Nintendo / Creatures / GAME FREAK / The Pokémon Company.
> Clash Royale © Supercell. Este proyecto no está autorizado por ninguna de ellas y pueden pedir que se retire.
> Mira [Licencias y créditos](#licencias-y-créditos).

Versión 3 (en desarrollo, **Fase 1: online**). Juego para navegador de **PC** (horizontal, ratón y teclado) que
también se adapta a **móvil** (vertical, táctil). Phaser 3 + TypeScript estricto + Vite en un monorepo, con la
simulación de batalla en `/shared` y un servidor autoritativo con Colyseus.

## Arrancarlo

Necesitas **Node 18.18 o superior** (recomendado Node 22 LTS).

1. Copia tu carpeta **`SpritesPokemon`** dentro de `assets/` (debe quedar `assets/SpritesPokemon/animations_metadata.json`).
2. `npm install`
3. `npm run dev` → abre `http://localhost:5173`

`npm run dev` arranca a la vez el **servidor de juego** (`ws://localhost:2567`) y el **cliente** (Vite, puerto 5173).
La primera vez genera además los atlas de sprites en `client/public/gen/` (unos 5 s).

Para probar una partida online entre dos jugadores, abre el juego en dos pestañas y pulsa BATALLA en las dos.
Si el servidor no está en marcha, BATALLA ofrece **jugar sin conexión** contra el bot.

> Para probar rápido: en **Perfil → Modo prueba** tienes +5000 oro, +500 gemas y +300 trofeos.

| Comando                   | Qué hace                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------ |
| `npm run dev`             | Servidor de juego + cliente con recarga en caliente                                  |
| `npm run dev:server`      | Solo el servidor de juego (puerto 2567, `ARENA_PORT` para cambiarlo)                 |
| `npm run start:server`    | Servidor sin recarga (producción: usa `PORT`)                                        |
| `npm run build`           | Build de producción en `client/dist/` (estático, se puede subir a cualquier hosting) |
| `npm run assets`          | Regenera atlas y `pack.json` desde el pack de sprites                                |
| `npm run assets:fan-only` | Igual, pero solo con sprites de fans (ver [ART_PIPELINE.md](ART_PIPELINE.md))        |
| `npm test`                | Tests (Vitest) de la simulación, los datos y la meta                                 |
| `npm run lint`            | ESLint                                                                               |
| `npm run typecheck`       | TypeScript en los cuatro proyectos                                                   |
| `npm run format`          | Prettier                                                                             |
| `npm run check`           | typecheck + lint + tests                                                             |

## Pantalla y controles

El diseño se elige solo según la forma de la ventana, o se fuerza en **Perfil → Pantalla** (o con `?layout=pc` /
`?layout=mobile` en la URL). La arena siempre es vertical, como en el original:

- **PC (1920×1080)**: arena en el centro a toda la altura. A la izquierda, el rival, sus coronas, los emotes y el botón
  de rendirse. A la derecha, el reloj, tus coronas, la mano, la siguiente carta y el elixir. En el menú, barra lateral
  de pestañas.
- **Móvil (720×1280)**: el diseño vertical de siempre, con la mano abajo.

| PC                  | Qué hace                                                        |
| ------------------- | --------------------------------------------------------------- |
| `1`-`4` o clic      | Elegir carta (se ve dónde caerá al pasar el ratón por la arena) |
| Clic en la arena    | Desplegarla (también se puede arrastrar la carta)               |
| Clic derecho / Esc  | Cancelar la carta elegida                                       |
| `T`                 | Emotes (y luego `1`-`4`)                                        |
| Esc (sin carta)     | Rendirse                                                        |
| Espacio / `F`       | En repeticiones: pausa / velocidad x1-x2-x4                     |
| `1`-`5`, Intro, Esc | En el menú: pestañas, batalla y cerrar ventanas                 |

## Idiomas

El juego está en **inglés** (por defecto) y **español**. Se cambia en **Perfil → Idioma** (se guarda en el navegador)
o con `?lang=en` / `?lang=es` en la URL.

- Los textos viven en `client/src/i18n/en.ts` y `es.ts`; en el código se usan con `t('clave', { parámetros })`.
- Cartas, arenas, rarezas, Pokéballs y emotes: en español salen de `/shared`; en inglés, de `en.ts`
  (`card.<id>.desc`, `arena.<n>`…). Ayudantes: `cardName`, `cardDesc`, `arenaName`, `rarityLabel`, `ballLabel`, `emoteText`.
- El servidor no manda frases: manda códigos (`err.room.full`, `err.join.deckSize`…) que traduce cada cliente.
- Un test (`client/test/i18n.test.ts`) falla si a un idioma le falta una clave o si no coinciden los `{parámetros}`.
- Para añadir otro idioma: copia `en.ts`, tradúcelo y añádelo a `DICTS` y `LANGS` en `client/src/i18n/index.ts`.

## Sistema de diseño

Toda la interfaz sale de `client/src/ui/kit/`:

- `theme.ts`: colores, tipografías (Lilita One para títulos, Rubik para texto), variantes de botón y de panel, medidas.
- `textures.ts`: paneles, botones (normal, hover, pulsado, deshabilitado), barras, brillos, rayos y la gota de elixir,
  dibujados con canvas en alta calidad y usados como **nine-slice** (se estiran sin deformar las esquinas).
- `index.ts`: `text`, `panel`, `button`, `progressBar`, `pill`, `menuBackground` (fondo animado), `fadeIn` y `goTo`
  (transiciones entre escenas).

`ui/style.ts` mantiene las funciones de siempre (`txt`, `button`, `panel`) dibujadas con el kit. Los sprites de Pokémon
se escalan como pixel art nítido; la interfaz y los textos se suavizan.

## Online (Fase 1)

```
 cliente A ──"jugar carta X en (x,y)"──►  servidor (Colyseus)  ◄── cliente B
                                          · valida mano, elixir, zona y ritmo
                                          · lo programa 2 ticks después (~100 ms)
                                          · ejecuta Match (la misma simulación)
 cliente A ◄──── inputs de cada tick ────  · cada 20 ticks manda una huella del estado ──► cliente B
```

- **Servidor autoritativo**: los clientes solo mandan intenciones. Como la simulación es determinista, cada cliente la
  reproduce idéntica a partir de los inputs (`shared/src/net/lockstep.ts`). Si la huella no coincide, el cliente pide
  una resincronización y se reconstruye.
- **Retardo de input** de 2 ticks (100 ms), como Clash Royale: mientras llega la confirmación, la carta se marca en la
  arena y en la mano.
- **Ritmo**: como mucho 4 cartas por segundo (ráfagas de 3). Lo que no cumple se rechaza con un motivo.
- **Emparejamiento por trofeos**: ventana de ±100 que crece 50 por segundo de espera (máx. ±2000). A los **20 s** sin
  rival, partida contra un bot que corre en el servidor. Si en una partida igualada el rival no se conecta en 10 s,
  entra un bot.
- **Amistosas**: _Amigo → Crear sala_ da un código de 5 caracteres; el otro jugador usa _Amigo → Unirme con código_.
- **Reconexión**: si se corta, el cliente reintenta durante 30 s y se pone al día con todos los inputs. Si recargas la
  página en mitad de una partida, vuelves a ella. Sin volver en 30 s, se pierde la partida.
- **Repeticiones**: el servidor guarda cada partida (semilla + inputs) en `server/data/replays/`. Se ven en **TV**,
  con pausa y velocidad. La huella final se comprueba al reproducirlas.
- **Espectador**: en **TV** aparecen las partidas en directo; se entra con _Mirar_.
- **API HTTP** (mismo puerto): `/api/health`, `/api/live`, `/api/replays`, `/api/replays/:id`, `/api/friendly/:code`.
- **Hasta la Fase 2** (cuentas) el mazo, los niveles y los trofeos los manda el cliente y el servidor solo comprueba
  que sean válidos; las recompensas se siguen calculando en el navegador.
- Colyseus **0.16** porque la 0.18 exige Node 22. Al pasar a Node 22 se puede actualizar sin cambiar el diseño.

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
  src/net/             Protocolo cliente-servidor, validación y Lockstep
  test/                Tests de Vitest
client/   El juego en Phaser (solo dibuja e interpola)
  src/layout.ts        Diseño PC (1920×1080) o móvil (720×1280)
  src/scenes/          Boot, Lobby (menú), BallOpen, Battle, Online (cola/amistosas), Tv (directo y repeticiones)
  src/battle/          Vistas de tropas, torres y proyectiles, pools de efectos y fuentes de partida
                       (local contra bot, online, repetición)
  src/ui/              Mano, cartas, modales, pestañas del menú
  src/meta/Profile.ts  Progreso del jugador (localStorage hasta la Fase 2)
  src/net/             Conexión con el servidor (OnlineSession), API HTTP y rewards.ts
server/   Servidor de juego (Colyseus + Express)
  src/rooms/MatchRoom.ts  Partida autoritativa (validación, retardo, reconexión, espectadores)
  src/rooms/QueueRoom.ts  Cola de emparejamiento por trofeos
  src/replays.ts          Repeticiones en disco
  test/                   Tests de integración (servidor real + clientes)
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
