// ─────────────────────────────────────────────────────────────
//  PUNTO DE ENGANCHE PARA PREMIOS / BLOCKCHAIN
//
//  Se llama al terminar cada partida. Ahora mismo solo lo registra en consola.
//
//  IMPORTANTE si algún día conectas premios reales (SOL u otros):
//  - Nunca pagues según lo que diga el navegador: este resultado se puede
//    falsificar abriendo la consola. El resultado lo decide el servidor
//    re-ejecutando la repetición (semilla + inputs) con /shared/sim.
//  - Las claves de la wallet que paga NUNCA van en el código del cliente.
//  - Revisa antes las licencias de los sprites y la normativa de premios/juego.
// ─────────────────────────────────────────────────────────────
import type { Replay, Winner } from '@arena/shared';

export interface MatchSummary {
  winner: Winner;
  crowns: { blue: number; red: number };
  duration: number;
  deck: string[];
  opponent: string;
  replay: Replay;
}

export async function onMatchEnd(result: MatchSummary): Promise<void> {
  console.info('[rewards] fin de partida', { ...result, replay: `${result.replay.inputs.length} inputs` });
}
