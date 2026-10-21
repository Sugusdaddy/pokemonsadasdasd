import { previousSeasonId, rollSeason, seasonAt } from '@arena/shared';
import type { SeasonResultRow, Store } from './store/types';

/** Cuántos puestos se guardan en el archivo de cada temporada. */
const ARCHIVE_TOP = 1000;

/**
 * Cierra la temporada anterior si ha empezado un mes nuevo.
 * Solo un proceso la cierra (la fila Season hace de cerrojo). Congela el ranking por trofeos,
 * y a cada jugador le aplica el reinicio suave y su recompensa (con su puesto final).
 * Los jugadores sin trofeos cambian de temporada solos la próxima vez que entren.
 */
export async function closeSeasonIfNeeded(
  store: Store,
  now = Date.now(),
): Promise<{ closed: string; players: number } | null> {
  const prev = previousSeasonId(seasonAt(now).id);
  if (!(await store.beginSeasonClose(prev))) return null;
  const snapshot = await store.rankedSnapshot();
  const top: SeasonResultRow[] = [];
  let rank = 0;
  let lastTrophies = -1;
  for (let i = 0; i < snapshot.length; i++) {
    const { accountId, trophies } = snapshot[i];
    if (trophies !== lastTrophies) rank = i + 1; // empates comparten puesto
    lastTrophies = trophies;
    try {
      const { state } = await store.mutate(accountId, (s) => {
        rollSeason(s, now, rank);
      });
      if (top.length < ARCHIVE_TOP) {
        top.push({ accountId, rank, name: state.name, trophies, best: state.pendingSeason?.best ?? trophies });
      }
    } catch (e) {
      console.error('[season] no se pudo cerrar la temporada para', accountId, e);
    }
  }
  await store.finishSeasonClose(prev, top);
  console.log(`[season] temporada ${prev} cerrada: ${snapshot.length} jugadores`);
  return { closed: prev, players: snapshot.length };
}

/**
 * Comprueba al arrancar y cada 10 minutos. Si falla (p. ej. la base de datos aún
 * arrancando), reintenta a los 30 s.
 */
export function startSeasonJob(store: Store): () => void {
  let retry: ReturnType<typeof setTimeout> | null = null;
  const run = () =>
    void closeSeasonIfNeeded(store).catch((e) => {
      console.error('[season]', e instanceof Error ? e.message : e);
      if (!retry) retry = setTimeout(() => ((retry = null), run()), 30_000);
    });
  run();
  const t = setInterval(run, 10 * 60 * 1000);
  return () => {
    clearInterval(t);
    if (retry) clearTimeout(retry);
  };
}
