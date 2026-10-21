// ─────────────────────────────────────────────────────────────
//  PUNTO DE ENGANCHE PARA PREMIOS / BLOCKCHAIN
//
//  Se llama al terminar cada partida. Ahora mismo solo lo registra en consola.
//
//  IMPORTANTE si algún día conectas premios reales (SOL u otros):
//  - Nunca pagues según lo que diga el navegador: este resultado se puede
//    falsificar abriendo la consola. El resultado tiene que calcularlo o
//    verificarlo un servidor tuyo (partida autoritativa o repetición de jugadas).
//  - Las claves de la wallet que paga NUNCA van en el código del cliente.
//  - Revisa antes las licencias de los sprites y la normativa de premios/juego.
// ─────────────────────────────────────────────────────────────

export async function onMatchEnd(result) {
  // result = { winner: 'player'|'enemy'|'draw', crowns: {player, enemy}, duration, deck }
  console.info('[rewards] fin de partida', result);
}
