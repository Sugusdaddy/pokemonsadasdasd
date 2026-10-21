# Arena Royale v2: fan game estilo Clash Royale con Pokémon

Juego completo para navegador hecho con **Phaser 3**. No necesita compilación. Usa directamente tu pack `SpritesPokemon` (spritesheets en 8 direcciones y `animations_metadata.json`).

## Qué incluye

**Menú (5 pestañas)**
- **Batalla**: arena actual con su Pokémon estrella, barra de trofeos hacia la siguiente arena, botón de batalla, 4 huecos de Pokéball con temporizador (o abrir ya con gemas), Ball gratis cada 10 minutos y Ball corona cada 10 coronas.
- **Cartas**: 3 mazos guardables y colección de 41 cartas con rareza (común, rara, épica y legendaria), nivel y progreso. Al tocar una carta ves su ficha con estadísticas, la mejoras con oro y la cambias en el mazo.
- **Tienda**: regalo diario, 6 ofertas de cartas que cambian cada día, Pokéballs por gemas y oro por gemas. No hay dinero real.
- **Camino de trofeos**: recompensas cada 50 trofeos y 6 arenas que desbloquean cartas nuevas.
- **Perfil**: nombre, nivel de rey, estadísticas, ajustes de sonido y música, modo prueba y reinicio del progreso.

**Pokéballs**: Poké, Super, Ultra, Master, gratis y corona. La animación de apertura sigue estos pasos: cae, se tambalea 3 veces como en una captura, se abre con un destello y saca las cartas una a una con efectos según la rareza. Al final aparece un resumen.

**Batalla**
- Pantalla VS y 6 arenas temáticas: bosque, cueva, torre fantasma, hielo, volcán con río de lava y meseta.
- Cada carta tiene niveles que suben su vida y su daño. Las torres también tienen nivel de rey.
- Elixir x2 en el último minuto y tiempo extra con muerte súbita.
- Las tropas buscan objetivo y cruzan por los puentes. Hay daño en área, quemadura, ralentización y efectividad de tipos.
- Las tropas caen al desplegarlas, los proyectiles dejan estela y las torres se rompen en escombros.
- Emotes, botón de rendirse e IA que defiende, apoya a sus tanques y no desperdicia elixir.
- Pantalla de recompensas al terminar: trofeos, oro, Pokéball, coronas, nueva arena y subida de nivel.

**Sonido y música** sintetizados con Web Audio, sin archivos.

El **progreso** se guarda en el navegador (localStorage).

## Cómo arrancarlo

1. Copia tu carpeta **`SpritesPokemon`** dentro de `assets/`. Debe quedar `assets/SpritesPokemon/animations_metadata.json`.
2. En la carpeta del juego, arranca un servidor local: `python -m http.server 8000` o `npx serve .`.
3. Abre `http://localhost:8000`. Si haces doble clic en `index.html` no funciona.

> Para probar rápido: en **Perfil → Modo prueba** tienes +5000 oro, +500 gemas y +300 trofeos.

## Estructura

| Archivo | Para qué sirve |
|---|---|
| `src/config.js` | **Todo el balance**: arenas, rarezas, mejoras, Pokéballs (tiempos y contenido), economía, IA, torres |
| `src/data/cards.js` | Las 41 cartas y el mazo inicial |
| `src/meta/Profile.js` | Progreso guardado: oro, gemas, cartas, mazos, huecos, resultados |
| `src/meta/Balls.js` | Qué sale en cada Pokéball |
| `src/meta/Road.js` | Recompensas del camino de trofeos |
| `src/meta/Opponent.js` | Generación del rival (nombre, mazo y niveles) |
| `src/scenes/LobbyScene.js` + `src/ui/tabs/*` | Menú y sus pestañas |
| `src/scenes/BallOpenScene.js` | Animación de apertura |
| `src/scenes/BattleScene.js` | La partida |
| `src/entities/*` | Tropas, torres y proyectiles |
| `src/systems/EnemyAI.js` | IA del rival |
| `src/systems/Sfx.js` | Efectos y música |
| `src/systems/Assets.js` | Carga de sprites y texturas dibujadas (Pokéballs, iconos, torres, decorados) |
| `src/net/rewards.js` | Punto de enganche al terminar cada partida (para servidor o blockchain) |

## Añadir una carta

En `src/data/cards.js`:

```js
lapras: { pokemon: 131, cost: 5, rarity: 'epic', arena: 3 },   // el resto se calcula solo
```

O con todos los detalles:

```js
lapras: {
  pokemon: 131, cost: 5, rarity: 'epic', arena: 3,
  hp: 1500, dmg: 120, hitSpeed: 1.6, range: 5 * T, splash: 1 * T,
  speed: 'slow', move: 'ice-beam', targets: 'any', desc: 'Rayo hielo en área.',
},
```

Los ataques (`move`) son las claves de `attacks` en `animations_metadata.json`. Su tipo decide la efectividad, y `burn` y `slow` aplican quemadura y ralentización.

## Premios en Solana: léelo antes

`src/net/rewards.js` recibe cada resultado, pero **viene del navegador y se puede falsificar**. Antes de repartir nada tiene que haber un servidor que decida quién gana. La clave de la wallet nunca puede estar en el cliente. Revisa también la normativa de premios de tu país.

## Licencias y créditos

- **Código**: tuyo.
- **Phaser**: MIT (`vendor/PHASER_LICENSE.md`).
- **Sprites**: PMD SpriteCollab. En `CREDITS.md` tienes el autor y el origen de los 966 Pokémon:
  - **362 son sprites oficiales** de *Pokémon Mundo Misterioso* (Chunsoft) y **130 son mixtos**. A esos no les aplica ninguna licencia abierta.
  - **474 son de fans**, con licencia **CC BY-NC 4.0**: no comercial y con atribución obligatoria.
- **Pokémon** © Nintendo / Creatures / GAME FREAK / The Pokémon Company. Este es un proyecto de fans no autorizado y pueden pedir que se retire. Tampoco uses el nombre, el logo ni el arte de Clash Royale (Supercell).

Si quieres monetizarlo o repartir premios sin riesgo, sustituye los Pokémon por criaturas propias con la misma estructura de carpetas y el mismo `animations_metadata.json`. El código no cambia.
