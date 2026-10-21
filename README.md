# Arena Royale

Fan game para navegador al estilo de Clash Royale, con sprites de Pokémon del pack PMD SpriteCollab.

> **Proyecto de fans no oficial y sin afiliación.** Pokémon © Nintendo / Creatures / GAME FREAK / The Pokémon Company.
> Clash Royale © Supercell. Este proyecto no está autorizado por ninguna de ellas y pueden pedir que se retire.
> Mira [Licencias y créditos](#licencias-y-créditos).

Versión 3 (en desarrollo, **Fase 2A: cuentas y economía en el servidor**). Juego para navegador de **PC** (horizontal, ratón y teclado) que
también se adapta a **móvil** (vertical, táctil). Phaser 3 + TypeScript estricto + Vite en un monorepo, con la
simulación de batalla en `/shared` y un servidor autoritativo con Colyseus.

## Arrancarlo

Necesitas **Node 18.18 o superior** (recomendado Node 22 LTS).

1. Copia tu carpeta **`SpritesPokemon`** dentro de `assets/` (debe quedar `assets/SpritesPokemon/animations_metadata.json`).
2. `npm install`
3. `npm run dev` → abre `http://localhost:5173`

`npm run dev` arranca a la vez un **PostgreSQL local** (puerto 54329, sin Docker; datos en `server/.pgdata`), el
**servidor de juego** (`ws://localhost:2567`) y el **cliente** (Vite, puerto 5173). Antes, copia
`server/.env.example` a `server/.env`.
La primera vez genera además los atlas de sprites en `client/public/gen/` (unos 5 s).

Para probar una partida online entre dos jugadores, abre el juego en dos pestañas y pulsa BATALLA en las dos.
Sin servidor, la pantalla de carga ofrece reintentar o jugar una **práctica** contra el bot (sin recompensas).

> Para probar rápido: en **Perfil → Modo prueba** tienes +5000 oro, +500 gemas y +300 trofeos.

| Comando                   | Qué hace                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------ |
| `npm run dev`             | Servidor de juego + cliente con recarga en caliente                                  |
| `npm run dev:server`      | Solo el servidor de juego (puerto 2567, `ARENA_PORT` para cambiarlo)                 |
| `npm run dev:db`          | Solo el PostgreSQL local                                                             |
| `npm run db:migrate`      | Crea una migración nueva tras cambiar `server/prisma/schema.prisma`                  |
| `npm run db:deploy`       | Aplica las migraciones pendientes (producción)                                       |
| `npm run db:studio`       | Explorador de la base de datos (Prisma Studio)                                       |
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
| `1`-`7`, Intro, Esc | En el menú: pestañas, batalla y cerrar ventanas                 |

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

## Efectos de batalla (Fase 3A)

Todo es solo visual: la simulación no cambia (los tests de repeticiones lo comprueban).

- **Partículas** (`client/src/battle/Particles.ts`): polvo al desplegar, chispas en cada impacto, explosión de
  hechizo (destello, chispas, ascuas, humo y quemadura en el suelo), torre caída (gran destello, columna de humo,
  ascuas, cascotes y quemadura que se queda) y una nube al morir una unidad. Pocos emisores fijos con tope de
  partículas vivas, para que el rendimiento no dependa de lo movida que esté la partida.
- **Ambiente por arena**: hojas, polvo, almas, nieve, ascuas o destellos flotando sobre el campo.
- **Río con shader** (WebGL, `client/src/battle/riverShader.ts`): agua con reflejos y espuma en las orillas, y
  **lava** en Monte Ascuas con costra que se mueve y brillo en las orillas. Pixelado a bloques de 4 px. Sin WebGL
  se dibuja el río de siempre.
- **Luz y sombras**: sombras suaves bajo unidades y torres, viñeta en los bordes de la arena y destellos de luz en
  hechizos y torres.
- **Hit-stop** (`client/src/battle/juice.ts`): pausa de 45-110 ms en golpes fuertes (un cuarto de la vida o más),
  hechizos y torres. La simulación espera y luego recupera el tiempo, así que las partidas online no se retrasan.
- **Vibración de pantalla** ajustable en Perfil → _Vibración de pantalla_ (No / Suave / Normal). También se aplica a
  la apertura de Pokéballs.

## Cuentas y economía (Fase 2A)

**El progreso vive en el servidor** (PostgreSQL + Prisma). El navegador solo guarda una copia para pintar.

- **Invitado**: al abrir el juego por primera vez se crea una cuenta de invitado y su sesión (un token firmado) se
  guarda en el navegador. Se juega al momento, sin registrarse.
- **Wallet de Solana** (Perfil → Cuenta → _Connect wallet_): se detectan las wallets instaladas con Wallet Standard
  (Phantom, Solflare, Backpack…). El servidor da un mensaje con un código de un solo uso que caduca en 5 minutos, la
  wallet lo firma (ed25519) y el servidor comprueba la firma. **Nunca se firma una transacción ni se mueven fondos.**
  - Si la wallet es nueva, se queda con tu cuenta de invitado (y su progreso).
  - Si la wallet ya tenía cuenta, entras en ella desde cualquier dispositivo.
  - _Sign out_ cierra la sesión (la cuenta sigue en el servidor) y empieza un invitado nuevo.
- **Economía autoritativa**: abrir Pokéballs (temporizadores con la hora del servidor), saltarlas con gemas, mejorar
  cartas, mazos, tienda diaria (igual para todos, cambia a las 00:00 UTC), regalo diario y camino de trofeos se
  validan y calculan en el servidor con las reglas de `shared/src/meta/economy.ts`.
- **Recompensas de partida**: las calcula el servidor con el resultado de SU simulación y las manda al jugador
  (mensaje `rewards`). Las amistosas no dan ni quitan nada.
- **Sin dobles cobros**: cada cambio de una cuenta bloquea su fila (`SELECT … FOR UPDATE`), así que peticiones
  simultáneas no pueden gastar dos veces el mismo oro.
- **Límites por IP** en la creación de invitados y en el login.
- **Modo prueba** de Perfil (+oro, +trofeos): solo si el servidor tiene `ALLOW_DEV_CHEATS=1`.
- **Partidas y repeticiones** en la tabla `Match` (antes, ficheros en disco).

API (además de la de la Fase 1):

| Ruta                                                            | Qué hace                                       |
| --------------------------------------------------------------- | ---------------------------------------------- |
| `POST /api/auth/guest`                                          | Crea un invitado y devuelve su sesión          |
| `GET /api/auth/nonce?address=`                                  | Mensaje para firmar con la wallet              |
| `POST /api/auth/wallet`                                         | Comprueba la firma y devuelve la sesión        |
| `GET /api/me`                                                   | Tu cuenta (estado, ofertas, hora del servidor) |
| `POST /api/me/{name,deck/active,deck/card,cards/upgrade}`       | Perfil, mazos y mejoras                        |
| `POST /api/me/balls/{unlock,skip,open,free,crown}`              | Pokéballs                                      |
| `POST /api/me/shop/{gift,card,ball,gold}`, `/api/me/road/claim` | Tienda y camino de trofeos                     |

**Base de datos**: mientras Railway esté disponible se usará su PostgreSQL. En desarrollo hay uno local que arranca
solo. Sin `DATABASE_URL` el servidor guarda todo en memoria (y lo avisa), útil para probar rápido.

## Rankings y temporadas (Fase 2B)

Pestaña **Social** del menú (la 5.ª): clasificación y temporada.

- **Clasificación global** y **por arena** (solo los jugadores con trofeos de esa arena), de 100 en 100. Con el mismo
  número de trofeos se comparte puesto. Arriba sale tu puesto (o que aún no tienes, si estás a 0). Las cuentas con
  wallet muestran la dirección abreviada; los invitados también salen.
- **Temporadas mensuales** (mes natural en UTC, p. ej. `2026-10`). Se guarda tu máximo de trofeos de la temporada.
- **Al terminar**:
  - Reinicio suave: por encima de 1600 trofeos se pierde la mitad de lo que sobra (2400 → 2000).
  - Recompensa según tus **trofeos máximos** de la temporada (tramos en `shared/src/meta/season.ts`: de 100 de oro a
    4000 de oro + 150 gemas + Master Ball). Solo si jugaste alguna partida esa temporada.
  - Al entrar sale la ventana de fin de temporada con tu puesto final y el botón para reclamarla (una sola vez).
- **Cierre en el servidor**: un trabajo que se ejecuta al arrancar y cada 10 minutos (reintenta a los 30 s si falla)
  congela el ranking, da a cada jugador su puesto, aplica el reinicio y archiva el top 1000 (tablas `Season` y
  `SeasonResult`). La fila `Season` hace de cerrojo: aunque haya varios servidores, solo uno cierra cada temporada.
  Quien no tenía trofeos cambia de temporada solo la próxima vez que entra.

| Ruta                                                            | Qué hace                                                    |
| --------------------------------------------------------------- | ----------------------------------------------------------- |
| `GET /api/leaderboard?scope=global\|arena&arena=N&limit&offset` | Ranking (con tu puesto si mandas la sesión)                 |
| `GET /api/season`                                               | Temporada actual, tramos de recompensa y top de la anterior |
| `POST /api/me/season/claim`                                     | Cobra la recompensa de la temporada terminada               |

Ahora va sobre PostgreSQL; cuando haya muchos jugadores pasará a Redis (sorted sets) sin cambiar la API.

## Amigos y clanes (Fase 2B)

La pestaña **Social** tiene tres secciones: **Rankings**, **Amigos** y **Clan**.

**Amigos**

- Cada jugador tiene un **código de 8 caracteres** (botón _Copiar_). Con _Añadir amigo_ se manda una solicitud; si los
  dos se la piden, queda aceptada sola. Máximo 100 amigos.
- Se ve quién está **conectado** (ha estado en el menú en los últimos 90 s).
- **Retar** a un amigo conectado crea una sala amistosa y le llega la invitación en su menú (ventana con _Entrar_).
  Caduca en 2 minutos. Las amistosas no dan ni quitan trofeos.
- Ranking **de amigos** en Rankings.

**Clanes**

- Crear uno cuesta **1000 de oro**: nombre único (3-20 caracteres), descripción, escudo (12), abierto o cerrado y
  trofeos mínimos. Hasta 50 miembros. Un jugador solo puede estar en un clan.
- **Rangos**: líder, colíder, veterano y miembro. Nadie asciende a otro a su propio rango ni toca a los de arriba; el
  líder puede ceder el liderazgo (pasa a colíder). Veterano o más puede expulsar a los de rango inferior. Si el líder
  se va, hereda el de más rango y antigüedad; si se va el último, el clan se borra.
- **Pedir cartas** (una vez cada 7 horas): hasta 10 comunes o 1 rara. Cada miembro puede donar hasta 4 comunes o 1 rara
  por petición y gana 5 o 50 de oro y experiencia. Las peticiones caducan en 24 h. Todo se valida en el servidor y la
  donación mueve la carta entre las dos cuentas en una sola transacción (con las filas bloqueadas).
- **Chat en vivo** (sala `clan` de Colyseus, una por clan) con historial de 60 mensajes. Avisos del sistema al entrar,
  salir, cambiar de rango, etc.

**Moderación**

- **Filtro de palabras** en inglés y español (`shared/src/social/filter.ts`): tapa con asteriscos en el chat y rechaza
  nombres de jugador y de clan malsonantes. Detecta acentos, "leet" (`sh1t`), letras repetidas, plurales y letras
  separadas (`p u t a`, `f.u.c.k`). Para ampliar la lista, añade la palabra en `WORDS`.
- **Límite de mensajes**: 5 cada 15 s y al menos 0,8 s entre uno y otro.
- **Denunciar** (tocar un mensaje): con 3 denuncias de jugadores distintos el mensaje se oculta y su autor queda
  **silenciado 24 h**. Las denuncias se guardan (tabla `Report`) para el panel de admin.
- **Silenciar** a un jugador: solo para ti, en este navegador (no ves sus mensajes).

| Ruta                                                      | Qué hace                                                              |
| --------------------------------------------------------- | --------------------------------------------------------------------- |
| `GET /api/social`                                         | Tu código, amigos, solicitudes, invitaciones y clan (marca conectado) |
| `POST /api/friends/{add,accept,remove}`                   | Añadir por código, aceptar, rechazar/cancelar/quitar                  |
| `POST /api/friends/invite`, `/api/friends/invite/dismiss` | Invitar a tu sala amistosa / descartar una invitación                 |
| `GET /api/leaderboard?scope=friends`                      | Ranking tuyo y de tus amigos                                          |
| `GET /api/clans?q=`, `GET /api/clans/:id`                 | Buscar clanes / ver uno con sus miembros                              |
| `POST /api/clans`                                         | Crear clan (cobra el oro en la misma transacción)                     |
| `POST /api/clan/{join,leave,edit,role,kick}`              | Entrar, salir, editar, cambiar rango, expulsar                        |
| `POST /api/clan/request`, `/api/clan/donate`              | Pedir cartas / donar una                                              |
| `POST /api/social/report`                                 | Denunciar un mensaje del chat                                         |
| Sala `clan` (`joinOrCreate('clan', {token, clanId})`)     | Chat: `say` para escribir; llegan `history`, `msg`, `update`…         |

## Buzón de ideas y admin (Fase 2B)

**Ideas** (Social → Ideas)

- Cualquiera las lee. Para **proponer** hay que haber jugado 3 batallas (frena el spam con cuentas nuevas) y como
  mucho 3 al día: título (6-60 caracteres, sin palabrotas), descripción (hasta 500, se censura) y categoría (cartas,
  equilibrio, modos, interfaz u otros).
- **Votar**: un voto por cuenta e idea, se puede quitar; no a las tuyas ni a las cerradas. Orden por más votadas o
  nuevas; filtros abiertas / previstas / hechas / descartadas / mías.
- Tus ideas abiertas las puedes borrar tocándolas.

**Admin** (pestaña que solo ven las cuentas con una wallet de `ADMIN_WALLETS`)

- Se activa poniendo la dirección pública de la wallet en `ADMIN_WALLETS` (en `server/.env` o en las variables de
  Railway; varias separadas por comas) y entrando en el juego con esa wallet. El servidor lo comprueba en **cada
  petición**: quitar una wallet de la lista le quita el acceso al momento. Los invitados nunca son admin.
- **Resumen**: jugadores, con wallet, activos y batallas en 24 h, clanes, ideas abiertas, denuncias y silenciados.
- **Denuncias** del chat agrupadas por mensaje: _Descartar_ (el mensaje vuelve a verse) o _Ocultar + silenciar_
  1 o 7 días. Las denuncias resueltas salen de la lista pero cuentan en el historial del jugador.
- **Jugadores**: buscar por nombre, código de amigo o wallet; silenciar (1 h, 1 d, 7 d, 30 d), quitar el silencio
  o poner el nombre por defecto.
- **Ideas**: cambiar el estado, responder (sale como "Respuesta del equipo"), ocultar o borrar.
- **Registro**: todo lo que hace un admin queda guardado (quién, qué y sobre quién) en la tabla `AdminLog`.

| Ruta                                                       | Qué hace                                          |
| ---------------------------------------------------------- | ------------------------------------------------- |
| `GET /api/ideas?sort=top\|new&status=…&mine=1&offset=`     | Lista de ideas (con tus votos si mandas sesión)   |
| `POST /api/ideas`, `/api/ideas/:id/vote`, `/:id/delete`    | Proponer, votar / quitar el voto, borrar la tuya  |
| `GET /api/admin/{stats,reports,players?q=,log}`            | Solo admins                                       |
| `POST /api/admin/reports/resolve`                          | `{messageId, action: dismiss\|punish, muteHours}` |
| `POST /api/admin/players/{mute,rename}`                    | Silenciar (`hours`, 0 = quitar) / quitar nombre   |
| `POST /api/admin/ideas/:id`, `/api/admin/ideas/:id/delete` | `{status?, reply?, hidden?}` / borrar             |

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
- Al entrar en la cola o en una sala, el cliente solo manda su **sesión**: el nombre, el mazo, los niveles y los
  trofeos los saca el servidor de la cuenta.
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
  src/meta/            Economía (reglas del progreso), Pokéballs, camino de trofeos y rivales
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
server/   Servidor de juego (Colyseus + Express + Prisma)
  prisma/schema.prisma    Base de datos: Account, Wallet, AuthNonce, Match (+ migraciones)
  src/auth.ts             Sesiones (JWT) y verificación de firmas de wallet
  src/routes/account.ts   API de cuenta y economía
  src/store/              Acceso a datos: PostgreSQL (Prisma) y memoria (tests)
  src/rooms/MatchRoom.ts  Partida autoritativa (validación, retardo, reconexión, espectadores)
  src/rooms/QueueRoom.ts  Cola de emparejamiento por trofeos
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

## Arte propio en pixel art (Fase 3B)

Todo el escenario es pixel art original, dibujado por código en `client/src/art/` (sin imágenes externas):

- `pixel.ts`: rejilla pequeña con utilidades (rectángulos, líneas, polígonos, tramado, motas con semilla fija y
  contorno automático) que se convierte en textura a 2x con píxeles duros.
- `towers.ts`: torre del rey (torreones con tejado del color del equipo, corona y puerta) y de las princesas
  (almenas, estandartes y aspilleras), para los dos equipos, con **versión dañada** que aparece por debajo de media
  vida (grietas, almenas rotas, estandarte roto) y escombros al caer.
- `scenery.ts`: puentes de madera, piedra o basalto con lava; **tres decorados por arena** (robles, pinos, rocas,
  cristales lunares, lápidas, árboles muertos, pinos nevados, muñecos de nieve, volcanes, obsidiana, columnas,
  braseros…) y detalles pequeños en el suelo colocados siempre igual en cada arena.

Para cambiar un dibujo, edita su función y recarga: las texturas se regeneran al arrancar.

**Marcos de carta**: adornos en las esquinas según la rareza (remaches en las comunes, escuadras doradas en las raras,
gemas moradas en las épicas y turquesa en las legendarias), un brillo que recorre las épicas y legendarias de vez en
cuando y destellos en las legendarias.

## Apertura de Pokéball (Fase 3C)

- **Luz por rareza**: con cada una de las tres sacudidas, la luz y un aura detrás de la Pokéball se acercan al color de
  la mejor carta que trae (más intensa si hay épica o legendaria), con chispas de ese color.
- **Apertura**: golpe de cámara, destello, onda expansiva y chispas; las dos mitades de la Pokéball salen despedidas.
- **Cartas que salen volando**: cada carta sale boca abajo de la Pokéball, vuela en arco girando y dejando estela, y
  se da la vuelta en el centro. Las épicas, con destello morado. El oro y las gemas salen como un chorro de monedas.
- **Legendarias**: la pantalla se oscurece, sube un haz de luz desde la Pokéball con brasas, la cámara se acerca despacio
  y la carta sube por el haz; al darse la vuelta, destello blanco, onda grande y el cartel de _¡Legendaria!_.

## Sonido y música (Fase 3D)

- **Efectos y música CC0** de Kenney y de Juhani Junkala (ver `CREDITS.md`) en `client/public/audio` (OGG y MP3,
  unos 4 MB). Los golpes, monedas y cartas tienen varias variantes y un poco de variación de tono para no sonar
  siempre igual. Música: _Stage Select_ en el menú, _Stage 1_ en batalla y _Boss Fight_ en la prórroga, en bucle.
- **Mezclador** en Perfil: volumen general, de música y de efectos (10 niveles, se guarda en el navegador). La música
  **baja sola** mientras suena una fanfarria (revelar cartas, mejorar, coronas, ganar o perder) y casi desaparece en la
  secuencia de las legendarias.
- Si un archivo no carga (o el navegador no tiene audio), suena el **sintetizador** de antes.
- Para cambiar un sonido: descarga los paquetes, edita la tabla de `tools/build-audio.ts` y ejecuta

  ```bash
  npm run audio -- --src <carpeta con los paquetes descomprimidos>
  ```

  (necesita ffmpeg). Los paquetes originales no van a git: solo los sonidos elegidos.

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
