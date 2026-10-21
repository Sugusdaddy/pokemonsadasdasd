Estás trabajando en "Arena Royale", un fan game estilo Clash Royale con sprites de Pokémon (pack PMD SpriteCollab en assets/SpritesPokemon, con animations_metadata.json). Ya existe una v2 jugable en Phaser 3 + JavaScript sin build: menú de 5 pestañas, Pokéballs con temporizador y animación de apertura, 41 cartas con rareza y nivel, 6 arenas, tienda, camino de trofeos, IA, sonido sintetizado y progreso en localStorage. Lee primero README.md, src/config.js, src/data/cards.js, src/meta/Profile.js y src/scenes/BattleScene.js.

OBJETIVO: convertirlo en un juego online profesional, pulido y escalable, sin romper lo que ya funciona. Trabaja por fases. Cada fase termina con el juego arrancando, tests en verde, README actualizado y un commit. Antes de cada fase, enséñame un plan corto. Pregúntame antes de decisiones caras de deshacer (proveedor de hosting, base de datos, modelo de cuentas, cualquier cosa con dinero o cripto).

FASE 0. Base técnica
- Migra a Vite + TypeScript estricto, con ESLint + Prettier y Vitest.
- Usa un monorepo: /client (Phaser), /server, /shared.
- Extrae la simulación de batalla de BattleScene a /shared/sim: TypeScript puro sin Phaser, determinista, tick fijo de 20 Hz y RNG con semilla. El cliente solo dibuja e interpola. Añade tests de la simulación: daño, tipos, puentes, coronas y tiempo extra.
- Empaqueta los sprites usados en atlas (free-tex-packer o similar) y usa pools de objetos para proyectiles, números de daño y partículas.

FASE 1. Servidor autoritativo y matchmaking
- Node + Colyseus (o Socket.IO, justifica la elección). El servidor ejecuta /shared/sim. Los clientes solo envían "jugar carta X en (x,y)". El servidor valida elixir, mano, zona y ritmo, y reenvía.
- Reconexión durante la partida y compensación de latencia (input delay de unos 100 ms, como Clash Royale).
- Matchmaking por trofeos con una ventana que se amplía con el tiempo de espera. Si no hay rival en 20 s, partida contra bot. Partidas amistosas por código de sala.
- Repeticiones: guardar semilla + inputs y poder verlas. Modo espectador.

FASE 2. Cuentas, economía en servidor y leaderboard
- PostgreSQL + Prisma y Redis.
- Login con email (magic link) y, opcionalmente, "Sign in with Solana" (firmar un mensaje, sin transacciones).
- Mueve todo Profile.js al servidor: oro, gemas, cartas, mazos y Pokéballs. Los temporizadores usan la hora del servidor. Toda compra o mejora se valida en el servidor y el cliente solo cachea.
- Leaderboards: global, por arena, de amigos y por temporada mensual (con reset suave de trofeos y recompensas de fin de temporada), en Redis sorted sets.
- Amigos, clanes básicos con donación de cartas y chat con filtro de palabras y botón de reportar.
- Buzón de ideas de la comunidad: los jugadores proponen ideas (cartas, modos, cambios) y votan. Panel de admin para marcarlas como planeadas o hechas.

FASE 3. Gráficos y "juice" de nivel profesional
- Sistema de diseño de UI coherente: paneles nine-slice, botones con estados, transiciones entre escenas, fondo del menú animado.
- Arenas con shaders (agua y lava animadas), luz y sombras suaves, partículas de Phaser para hechizos, impactos y destrucción de torres. Hit-stop leve en golpes fuertes y screen shake configurable.
- Torres y decorados con arte pixel art propio a 2x. Marcos de carta por rareza con brillo animado para épicas y legendarias.
- Apertura de Pokéball más espectacular: cámara, luz por rareza, cartas que salen volando, y legendarias con secuencia especial.
- Responsive real (móvil, tablet y escritorio), 60 fps en móviles medios, PWA instalable y modo bajo consumo.
- Audio: sustituye el sintetizador por efectos CC0 (por ejemplo Kenney) y música con mezclador y volúmenes.

FASE 4. Contenido y retención
- Tutorial guiado y misiones diarias y semanales.
- Desafíos y torneos, modo 2v2 y modo draft.
- Edificios (torres defensivas y generadores) y más hechizos.
- Balance basado en datos: un panel de admin que edita config.js desde la base de datos y telemetría de % de victorias por carta.
- Idiomas ES/EN, accesibilidad (daltonismo, tamaño de texto) y Sentry para errores.

FASE 5. Despliegue
- Docker compose (server, postgres, redis). Cliente en Cloudflare Pages o Vercel y servidor en Fly.io o Railway.
- CI con GitHub Actions: lint, tests y build. Entornos de staging y producción.

FASE 6 (opcional, solo cuando yo lo confirme). Premios en Solana
- Ganadores decididos solo por el servidor a partir de partidas verificadas (repeticiones). Nunca usar resultados enviados por el cliente.
- Sin cuotas de entrada ni compras con cripto, para que no sea juego de azar. Fondo de premios que aporto yo.
- Programa Anchor o pagos desde una wallet del servidor con límites diarios. Las claves solo en el servidor, en un gestor de secretos. Primero devnet.
- Antidetección de bots y multicuentas antes de pagar nada.

IMPORTANTE (propiedad intelectual): CREDITS.md indica qué sprites son oficiales de Pokémon Mundo Misterioso (Chunsoft) y cuáles son de fans (CC BY-NC). Añade una opción en config para usar solo sprites de fans y prepara el pipeline para sustituir todo el arte por criaturas propias con la misma estructura de carpetas y metadatos. Si el juego se hace público o reparte premios, el objetivo es lanzarlo con arte propio. Mantén siempre el aviso de fan game no afiliado y los créditos.
