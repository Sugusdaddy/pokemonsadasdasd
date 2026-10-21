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
| `npm run start:server`    | Servidor sin recarga, desde el código TypeScript                                     |
| `npm run build:server`    | Empaqueta el servidor para producción en `server/dist/index.js`                      |
| `npm run start:prod`      | Arranca el servidor empaquetado (lo que corre en producción; usa `PORT`)             |
| `npm run build`           | Build de producción en `client/dist/` (estático, se puede subir a cualquier hosting) |
| `npm run golden`          | Comprueba las repeticiones de referencia (`-- --update` las regenera)                |
| `npm run smoke`           | Partida de prueba contra un servidor de verdad (`-- --server URL`, ver "Despliegue") |
| `npm run assets`          | Regenera atlas y `pack.json` desde el pack de sprites                                |
| `npm run assets:fan-only` | Igual, pero solo con sprites de fans (ver [ART_PIPELINE.md](ART_PIPELINE.md))        |
| `npm run icons`           | Regenera los iconos de la app (`client/public/icons/`) desde el pixel art propio     |
| `npm run audio`           | Regenera los sonidos desde los paquetes CC0 (ver "Sonido y música")                  |
| `npm test`                | Tests (Vitest) de la simulación, los datos y la meta                                 |
| `npm run lint`            | ESLint                                                                               |
| `npm run typecheck`       | TypeScript en los cuatro proyectos                                                   |
| `npm run format`          | Prettier                                                                             |
| `npm run check`           | typecheck + lint + tests                                                             |

## Pantalla y controles

El diseño se elige solo según la forma de la ventana, o se fuerza en **Perfil → Pantalla** (o con `?layout=pc` /
`?layout=mobile` en la URL). La arena siempre es vertical, como en el original:

- **PC (1080 de alto, de 1440 a 1920 de ancho)**: arena en el centro a toda la altura. A la izquierda, el rival, sus
  coronas, los emotes y el botón de rendirse. A la derecha, el reloj, tus coronas, la mano, la siguiente carta y el
  elixir. En el menú, barra lateral de pestañas. El ancho se adapta a la ventana: 16:9 en un monitor y 4:3 en una
  **tableta en horizontal**, sin franjas negras en el menú (la batalla se aleja un poco para caber entera).
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
  src/data/cardDefs.ts Las 50 cartas y el mazo inicial
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
tools/    build-assets.ts (atlas + pack.json), ensure-assets.ts, build-server.ts, golden-replays.ts, smoke.ts
deploy/   nginx.conf y cabeceras de seguridad del cliente en Docker
Dockerfile, docker-compose.yml, vercel.json   Despliegue (ver "Despliegue")
.github/workflows/ci.yml                       CI de GitHub Actions
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

Edificios y hechizos con efecto (Fase 4B):

```ts
// edificio defensivo: no se mueve y su vida baja sola en `lifetime` segundos
forretress: { type: 'building', pokemon: 205, cost: 3, hp: 740, dmg: 85, hitSpeed: 0.9, range: 5.5 * T,
              targets: 'ground', lifetime: 30, move: 'spikes' },
// generador (spawn = carta que saca) y de elixir
vespiquen:  { type: 'building', pokemon: 416, cost: 4, hp: 700, dmg: 0, lifetime: 35, spawn: 'combee', spawnEvery: 5 },
chansey:    { type: 'building', pokemon: 113, cost: 5, hp: 900, dmg: 0, lifetime: 60, elixirEvery: 8.5 },
// hechizo que dura: effect 'poison' | 'heal' | 'rage' (dmg = total en toda la duración) o 'freeze'
poison:     { type: 'spell', pokemon: 110, cost: 4, effect: 'poison', dmg: 400, duration: 8, radius: 3 * T, move: 'toxic' },
```

Si la carta usa un Pokémon nuevo, ejecuta `npm run assets` (y `npm test` para comprobar los datos). Para ver si
una carta está muy fuerte o muy floja antes de ajustarla, `npx tsx tools/balance-probe.ts 160 <cartas>` enfrenta
mazos de bots que solo se diferencian en esa carta y cuenta victorias.

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

## Rendimiento, calidad gráfica y app instalable (Fase 3E)

- **Calidad gráfica** en Perfil: **Auto** (por defecto), **Alta** o **Baja**. Baja = 30 fps, sin el shader del río ni
  la viñeta, un tercio de las partículas y sin brillos animados en las cartas. En Auto, si una batalla va por debajo de
  45 fps durante 4 segundos seguidos, el juego baja la calidad solo, avisa y lo recuerda en ese navegador (elegir otra
  opción a mano lo olvida).
- **Cartas más baratas de dibujar**: las capas fijas de cada carta (marco, arte, nombre, coste, nivel) se pintan una
  vez en una textura y se reutilizan; solo el retrato, el brillo y las marcas siguen vivas. La mano en batalla pasa de
  68 a 28 objetos y el tiempo de dibujo por fotograma en móvil baja a la mitad (3,7 → 1,9 ms).
- **Tableta**: ver "Pantalla y controles". Todo el menú se ha revisado a 1440 de ancho.
- **App instalable (PWA)**: `manifest.webmanifest`, iconos propios en pixel art (`npm run icons`) y un service worker
  que solo existe en el build de producción (`client/pwa/sw.js` es la plantilla; `vite.config.ts` la rellena con la
  lista de ficheros y una versión). Guarda al instalar el código, los iconos y los sprites, así que tras la primera
  visita **arranca sin red** y se puede jugar la práctica contra el bot; el audio y las fuentes se guardan la primera
  vez que se usan. Nunca guarda la API ni el servidor de juego. Cada build nuevo cambia la versión y borra las cachés
  viejas.
- **Instalar**: en Chrome, Edge y Android, botón **Instalar app** en Perfil (sale cuando el navegador lo permite). En
  iPhone/iPad, Perfil explica cómo: Compartir → Añadir a pantalla de inicio.
- Para probar el build con el service worker: `npm run build` y `npm run preview` (puerto 4173).

## Tutorial y misiones (Fase 4A)

- **Tutorial guiado**: la primera vez que entras al menú (cuenta nueva, sin batallas) se propone una partida de
  práctica contra el **Guía**, con explicaciones encima: objetivo (la partida se para), cartas y elixir (se para),
  juega tu primera carta (te señala dónde), defiende un ataque por la izquierda y luego partida libre con consejos
  sueltos (corona, hechizos, elixir lleno). El Guía no es el bot normal: juega poco y donde conviene para enseñar.
  Se puede saltar y repetir desde **Perfil → Jugar el tutorial**. Ganarlo da **150 de oro y 20 gemas** una sola vez
  por cuenta (lo controla el servidor). El guion está en `client/src/battle/tutorialScript.ts` (sin Phaser, con
  tests) y el dibujo en `client/src/battle/Tutorial.ts`.
- **Misiones**: 3 diarias (día UTC) y 3 semanales (lunes a domingo, UTC), al azar entre las de
  `shared/src/meta/missions.ts` y sin repetir clase: jugar, ganar, coronas, victorias de 3 coronas, hechizos, tropas,
  elixir gastado, abrir balls, mejorar cartas y gastar oro. Cada una da oro (y gemas las semanales); cobrar las tres
  de un periodo da un premio extra (Poké Ball + gemas al día, Ultra Ball + gemas a la semana).
- **Todo lo decide el servidor**: reparte las misiones al empezar cada periodo (dentro del estado de la cuenta, sin
  tablas nuevas) y el progreso de batalla sale de los inputs que aceptó SU simulación. Cuentan todas las batallas menos las amistosas. El resto (balls, mejoras, oro) cuenta al hacer la
  acción. API: `POST /api/me/missions/claim` `{ period, id }`, `POST /api/me/missions/bonus` `{ period }` y
  `POST /api/me/tutorial/complete`.
- En el menú, la fila de premios de la pestaña Batalla tiene ahora tres recuadros: ball gratis, ball de coronas y
  **Misiones** (se pone verde y la pestaña lleva aviso cuando hay algo por cobrar).

## Edificios y hechizos nuevos (Fase 4B)

Nueve cartas más (50 en total), repartidas entre las arenas 1 a 4:

| Carta        | Tipo                | Qué hace                                                            |
| ------------ | ------------------- | ------------------------------------------------------------------- |
| Forretress   | Edificio defensivo  | Dispara púas a las tropas de tierra (3 de elixir, 30 s)             |
| Magneton     | Edificio defensivo  | Torreta contra tierra y aire (4, 35 s)                              |
| Vespiquen    | Generador           | Saca un Combee volando cada 5 s (4, 35 s)                           |
| Chansey      | Generador de elixir | +1 de elixir cada 8,5 s mientras aguante (5, 60 s)                  |
| Combee       | Tropa               | Tres abejas voladoras baratas (2); también las saca Vespiquen       |
| Tóxico       | Hechizo que dura    | Nube venenosa: 400 de daño repartido en 8 s (a las torres, el 35 %) |
| Congelación  | Hechizo             | Un poco de daño y deja quietos tropas, edificios y torres 4 s       |
| Aromaterapia | Hechizo que dura    | Cura 450 a tus tropas dentro del área en 3 s                        |
| Furia        | Hechizo que dura    | Tus tropas dentro van y atacan un 35 % más rápido (6 s)             |

- **Edificios en la simulación**: son tropas que no se mueven (`building`), con una peana de piedra propia en
  pixel art. Su vida baja sola hasta acabar su `lifetime`; las tropas no los pueden empujar y no se pueden poner
  uno encima de otro. Los defensivos solo disparan a lo que tienen a tiro (y no a otros edificios). Las tropas que
  van a por torres (Onix, Golem, Snorlax) se desvían a por los edificios cercanos: para eso se ponen en el centro.
  Los generadores sacan su tropa delante con el nivel equivalente al suyo.
- **Hechizos que duran**: zonas en el suelo que actúan cada medio segundo (veneno y curación) o mientras estás
  dentro (furia). La congelación para también las torres.
- **Bot**: defiende con edificios en el centro (sobre todo contra los que van a por torres), planta generadores
  detrás del rey cuando está tranquilo y usa curación y furia sobre su propio ataque. Los mazos de los bots llevan
  como mucho un edificio.
- Las cartas de antes funcionan exactamente igual (los 27 tests de la simulación siguen pasando y las
  repeticiones antiguas se reproducen igual). El protocolo sube a la versión 2: un cliente antiguo no puede jugar
  contra uno nuevo.

## Modos: draft, desafíos y torneos (Fase 4C)

El botón **Modos** de la pestaña Batalla (antes "Amigo") reúne draft, desafío del día, torneos y amistosa. Todo es
gratis, sin cuotas de entrada, y salvo la amistosa se juega con **niveles iguales para todos**: cartas al nivel
inicial de su rareza y rey a nivel 5 (`STANDARD_KING`). Gana quien juega mejor, no quien ha mejorado más. Estos modos
no dan ni quitan trofeos.

- **Draft**: cada uno de los 4 rondas te enseña una pareja de cartas; eliges una y la otra se la lleva el rival. Al
  final cada uno tiene 4 elegidas + 4 recibidas (16 cartas distintas en total, con pocos hechizos y edificios). Hay
  12 s por ronda (si no eliges, se queda la mejor). Cola propia; si no aparece nadie en 20 s, contra un bot. Ganar da
  oro.
- **Desafío del día**: rota cada día UTC entre elixir doble, muerte súbita (la primera torre decide), draft y elixir
  triple. Un intento dura hasta 12 victorias o 3 derrotas (un empate cuenta como derrota) y se repite gratis; los
  premios por victorias (1, 3, 5, 7, 9 y 12: oro, gemas, Super Ball, Ultra Ball) se cobran una vez al día.
- **Torneos**: cualquiera crea uno (nombre, reglas, 15/30/60 min, 4-32 plazas, público o con código; uno a la vez).
  Mientras dura, los apuntados se emparejan **solo entre ellos** (nunca con bots; si el rival no se conecta y entra
  un bot, esa partida no cuenta). Clasificación por victorias, menos derrotas, coronas y antigüedad. Al acabar, los
  tres primeros cobran 500/300/150 de oro si han jugado al menos 4 jugadores con 3 partidas cada uno, y como mucho un
  premio de torneo al día por cuenta (contra granjas de cuentas).
- **Reglas en la simulación**: `MatchSetup.rules` (`elixir` multiplicador y `suddenDeath`). Viajan con la partida,
  así que las repeticiones se reproducen igual; sin reglas, la partida es idéntica a las de siempre.
- **Servidor**: la cola (`QueueRoom`) separa a los jugadores por modo, desafío del día o torneo; la sala
  (`MatchRoom`) hace el draft antes de empezar y reparte los premios según el modo. Tablas nuevas `Tournament` y
  `TournamentPlayer` (migración `tournaments`). API: `POST /api/me/challenge/start`, `GET/POST /api/tournaments`,
  `POST /api/tournaments/join`, `GET /api/tournaments/:id` y `POST /api/tournaments/:id/claim`.

## 2v2 (Fase 4D)

Desde **Modos → 2v2**: dos jugadores por equipo, cada uno con **su mazo, su mano, su elixir y sus niveles**; las
torres son del equipo. Las tropas de tu compañero llevan el aro azul claro.

- **Buscar**: cola 2v2. En cuanto hay cuatro, partida; si el primero lleva esperando el tiempo de los bots, con los
  que haya (enfrentados entre sí) y bots en los sitios libres. Sin trofeos; ganar da oro.
- **Con amigos**: sala con código. El primer amigo que entra va a tu equipo (con cuatro, los dos últimos son el
  rival). Quien la crea pulsa **Empezar** cuando quiera y los sitios libres los ocupan bots. Como las amistosas, no
  da ni quita nada. Los amigos entran con **Amistosa → Unirse con código**.
- **Si alguien se va** (o pulsa "Dejar la partida"), un bot ocupa su sitio y su compañero sigue jugando; el
  resultado le cuenta igual. En 1v1 rendirse sigue siendo perder.
- **Simulación**: cada equipo puede tener un segundo asiento (`MatchSetup.partners`, asientos `blue2` y `red2`) y
  los inputs llevan `seat: 1` cuando son del compañero. Sin compañeros la partida es exactamente la de antes: 30
  partidas grabadas con el motor anterior se reproducen igual. El protocolo sube a la versión 3 (un cliente
  anterior no puede conectarse: no sabría dibujar una partida 2v2).
- Pendiente para más adelante: buscar partida **en pareja** (dos amigos juntos contra otra pareja de la cola).

## Balance, estadísticas, accesibilidad y errores (Fase 4E)

- **Estadísticas de cartas**: al acabar cada partida (menos las amistosas), por cada jugador (no bots) cada carta de
  su mazo suma una partida, una victoria si ganó su equipo y las veces que la jugó. Se guardan por versión de
  balance (tabla `CardStat`), así se ve el efecto de cada cambio.
- **Balance editable**: en **Admin → Cartas** está la tabla de victorias y uso (en rojo las que ganan demasiado, en
  azul las que poco). Tocando una carta se cambian su **vida, daño, segundos entre ataques y coste** (entre ¼ y 4
  veces la base) y **Guardar versión** pide una nota y crea una versión nueva (tabla `BalanceVersion`, con
  historial y registro de admin). Vale para las partidas que empiecen a partir de ese momento: cada partida lleva en
  `MatchSetup.balance` los números con los que se jugó, así que el servidor, los clientes y las **repeticiones**
  usan siempre esos, aunque luego cambien. Lo de `cardDefs.ts` sigue siendo la base; sin cambios, las partidas son
  idénticas a las de antes. Los menús enseñan el balance en vigor (`GET /api/balance`). API de admin:
  `GET/POST /api/admin/balance` y `GET /api/admin/cards?version=N`. Protocolo v4 (las partidas llevan el balance).
- **Accesibilidad** (Perfil): **colores para daltonismo** (los equipos pasan a azul cielo y bermellón de la paleta de
  Okabe-Ito, también en las torres y peanas) y **texto grande** (descripciones y ayudas un 15 % más grandes).
- **Errores a Sentry, solo si lo activas**: en el servidor con `SENTRY_DSN` (ver `server/.env.example`) y en el
  navegador con `VITE_SENTRY_DSN` al compilar. Sin esas variables **no se carga el SDK ni se manda nada**. Con ellas
  se mandan los errores sin datos personales: sin usuario, sin cabeceras (la sesión), sin cookies, sin el nombre de
  la máquina, sin lo que sale por consola ni el rastro de clics, y sin trazas de rendimiento. Hay un test que lo
  comprueba con un "Sentry" falso en local. (SDK 10: el 11 necesita Node 20.)

## Despliegue (Fase 5)

Plan: **servidor + PostgreSQL en Railway** (entornos `staging` y `production`, cada uno con su base de datos) y
**cliente en Vercel**. Subdominios gratis por ahora. Esto es lo que ya está listo (5A):

- **Servidor de producción**: `npm run build:server` lo empaqueta en un solo `server/dist/index.js` (con mapa de
  fuentes; las dependencias se quedan en `node_modules`) y `npm run start:prod` lo arranca sin compilar nada.
- **Docker**: el `Dockerfile` hace la imagen del servidor (Node 22, sin dependencias de desarrollo, con Prisma para
  `migrate deploy`, como usuario sin privilegios y con healthcheck). `docker compose up --build` levanta el juego
  entero como en producción en http://localhost:8080: Postgres, servidor (aplica las migraciones al arrancar) y
  cliente con nginx. Necesita los atlas de `client/public/gen` (`npm run assets`).
- **Configuración obligatoria en producción** (`NODE_ENV=production`): el servidor **no arranca** si falta
  `DATABASE_URL`, si `SESSION_SECRET` es el de ejemplo o tiene menos de 32 caracteres, o si falta `CORS_ORIGINS`.
  `ALLOW_DEV_CHEATS` se ignora siempre en producción.
- **CORS**: `CORS_ORIGINS` es la lista de webs del cliente, separadas por comas. Acepta un `*` dentro del nombre
  para las vistas previas de Vercel (`https://arena-royale-*-equipo.vercel.app`; el `*` no cruza puntos). Se aplica
  a la API, al emparejamiento de Colyseus y a la conexión WebSocket (otra web no puede ni conectarse). Sin la
  variable, en desarrollo se acepta todo.
- **Límites**: además de los del login y los invitados, toda la API tiene un tope por IP (600 peticiones/min).
- **Desplegar sin cortar partidas**: al recibir `SIGTERM` el servidor deja de aceptar colas y partidas nuevas,
  `/api/health` responde 503, la cola avisa a quien espera para que vuelva a entrar (el cliente lo hace solo, ya en
  el servidor nuevo) y las partidas en curso **terminan con su resultado normal**. Si alguna no acaba en
  `SHUTDOWN_DRAIN_SECONDS` (5 min por defecto en producción, 0 en desarrollo) se corta **sin resultado**: nadie
  gana ni pierde trofeos por un reinicio. Antes, un reinicio daba la partida por perdida al primero en
  desconectarse.
- **Cliente**: el build lleva una Content-Security-Policy en un `<meta>` (solo scripts propios, conexión al
  servidor de `VITE_SERVER_URL`, a Sentry si hay DSN y a las fuentes de Google). `vercel.json` y
  `deploy/nginx.conf` ponen el resto de cabeceras (sin iframes, `nosniff`, Referrer y Permissions-Policy) y la
  caché: `assets/` para siempre (llevan hash) y el resto revalidando, para que lleguen las actualizaciones.
- **Determinismo vigilado**: `shared/test/fixtures/golden-replays.json` guarda 24 partidas bot contra bot (1v1,
  elixir x2/x3, muerte súbita, 2v2 y balance cambiado). Un test las vuelve a jugar y exige la misma huella: si un
  cambio en la simulación hiciera que las repeticiones guardadas se vieran distinto, falla. Si es a propósito,
  `npm run golden -- --update` y explicarlo en el commit.

| Variable (servidor)      | Para qué                                                                         |
| ------------------------ | -------------------------------------------------------------------------------- |
| `NODE_ENV`               | `production` en Railway (activa las comprobaciones de arriba)                    |
| `DATABASE_URL`           | PostgreSQL (Railway la da en su servicio de base de datos)                       |
| `SESSION_SECRET`         | Firma de las sesiones: aleatorio, 32+ caracteres, distinto en cada entorno       |
| `CORS_ORIGINS`           | Webs del cliente, p. ej. `https://arena-royale.vercel.app`                       |
| `PUBLIC_DOMAIN`          | Dominio del mensaje que firma la wallet (si no, el de la web desde la que juega) |
| `ADMIN_WALLETS`          | Wallets con la pestaña Admin                                                     |
| `SHUTDOWN_DRAIN_SECONDS` | Tiempo para que terminen las partidas al apagar (300 por defecto en producción)  |
| `SENTRY_DSN`             | Opcional: errores a Sentry                                                       |
| `PORT`                   | Lo pone Railway                                                                  |

### Repositorio y CI (5B)

- Los **atlas de sprites** (`client/public/gen`, ~6 MB) van en git para que el CI y Vercel compilen el cliente sin
  el pack original, que sigue fuera (`assets/SpritesPokemon`, 109 MB).
- **GitHub Actions** (`.github/workflows/ci.yml`), en cada push a `main` y en cada pull request:
  - **check**, en Node 18 y 22: migraciones sobre un PostgreSQL de verdad, tipos, lint, formato, todos los tests
    (también los de Prisma y las repeticiones de referencia) y los builds del cliente y del servidor.
  - **docker**: construye las imágenes, levanta `docker compose`, comprueba el cliente de nginx (CSP, cabeceras,
    atlas) y juega dos **partidas de prueba**: una normal y otra mandando a mitad el `SIGTERM` de un despliegue,
    que tiene que seguir hasta el final, con `/api/health` en 503, y después el servidor se apaga limpio.
- **Prueba de humo** (`npm run smoke -- --server URL [--origin WEB] [--drain-cmd "…"]`): crea un invitado, juega
  contra el bot, se rinde y comprueba resultado, recompensas, CORS y que la repetición guardada da la misma huella
  con este código. Sirve igual contra staging y producción.

Del cliente (al compilar): `VITE_SERVER_URL` (p. ej. `wss://arena-royale-production.up.railway.app`) y
`VITE_SENTRY_DSN` (opcional).

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
