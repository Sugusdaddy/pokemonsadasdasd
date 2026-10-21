import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { MatchMode, PlayerInfo, Replay, Team, Winner } from '@arena/shared';

export interface ReplayMeta {
  id: string;
  mode: MatchMode;
  players: Record<Team, PlayerInfo>;
  winner: Winner | null;
  reason: string;
  crowns: Record<Team, number>;
  ticks: number;
  /** Huella del estado final: re-ejecutar la repetición debe dar la misma. */
  hash: number;
  endedAt: string;
}

export interface StoredReplay extends Replay {
  meta: ReplayMeta;
}

/**
 * Repeticiones en disco (un JSON por partida: semilla + inputs + resumen).
 * Fase 2: pasarán a la base de datos; el formato es el mismo.
 */
export class ReplayStore {
  private index: ReplayMeta[] = [];

  constructor(
    readonly dir: string,
    private readonly keep = 500,
  ) {
    fs.mkdirSync(dir, { recursive: true });
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as StoredReplay;
        if (r.meta?.id) this.index.push(r.meta);
      } catch {
        /* fichero dañado: se ignora */
      }
    }
    this.index.sort((a, b) => b.endedAt.localeCompare(a.endedAt));
  }

  static newId(): string {
    return `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
  }

  save(replay: Replay, meta: ReplayMeta): void {
    const stored: StoredReplay = { ...replay, meta };
    fs.writeFileSync(this.file(meta.id), JSON.stringify(stored));
    this.index.unshift(meta);
    while (this.index.length > this.keep) {
      const old = this.index.pop()!;
      fs.rmSync(this.file(old.id), { force: true });
    }
  }

  list(limit = 20): ReplayMeta[] {
    return this.index.slice(0, Math.max(1, Math.min(100, limit)));
  }

  get(id: string): StoredReplay | null {
    if (!/^[a-z0-9-]{6,40}$/.test(id)) return null;
    const f = this.file(id);
    if (!fs.existsSync(f)) return null;
    return JSON.parse(fs.readFileSync(f, 'utf8')) as StoredReplay;
  }

  private file(id: string): string {
    return path.join(this.dir, `${id}.json`);
  }
}
