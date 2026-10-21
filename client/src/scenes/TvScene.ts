import { W, COLORS, type PlayerInfo, type Replay, type Team } from '@arena/shared';
import { api, type LiveMatch, type ReplayMeta } from '../net/api';
import { Sfx } from '../systems/Sfx';
import { txt, button, panel } from '../ui/style';
import { toast } from '../ui/Modal';
import { BaseScene } from './BaseScene';
import { LAST_REPLAY_KEY } from './BattleScene';

const ago = (iso: string): string => {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `hace ${s} s`;
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return `hace ${Math.round(s / 86400)} d`;
};

/** "TV": partidas en directo para mirar como espectador y repeticiones guardadas. */
export class TvScene extends BaseScene {
  private list!: Phaser.GameObjects.Container;

  constructor() {
    super('Tv');
  }

  create(): void {
    this.modalOpen = 0;
    this.cameras.main.setBackgroundColor('#1b1f3a');
    txt(this, W / 2, 70, 'Arena TV', 52, '#ffd84a');
    button(this, 90, 70, 120, 70, 'Volver', COLORS.red, () => this.scene.start('Lobby', { tab: 'battle' }), 24);
    button(this, W - 90, 70, 120, 70, 'Recargar', COLORS.blue, () => this.scene.restart(), 22);
    this.list = this.add.container(0, 0);
    this.list.add(txt(this, W / 2, 400, 'Cargando…', 30, '#c9c3ff'));
    void this.load_();
  }

  private async load_(): Promise<void> {
    let live: LiveMatch[] = [],
      replays: ReplayMeta[] = [];
    let offline = false;
    try {
      [live, replays] = await Promise.all([api.live(), api.replays(8)]);
    } catch {
      offline = true;
    }
    if (!this.sys.isActive()) return;
    this.list.removeAll(true);
    let y = 150;
    const header = (label: string) => {
      this.list.add(txt(this, 40, y, label, 30, '#ffffff', { originX: 0 }));
      y += 50;
    };
    const vs = (p: Record<Team, PlayerInfo>) => `${p.blue.name}  vs  ${p.red.name}${p.red.bot ? ' (bot)' : ''}`;
    const row = (title: string, sub: string, cta: string, color: number, onTap: () => void) => {
      this.list.add(panel(this, 30, y, W - 60, 92, 0x2a3170, 16));
      this.list.add(txt(this, 54, y + 30, title, 22, '#ffffff', { originX: 0 }));
      this.list.add(txt(this, 54, y + 64, sub, 17, '#c9c3ff', { originX: 0 }));
      this.list.add(button(this, W - 110, y + 46, 140, 64, cta, color, onTap, 24));
      y += 108;
    };

    // tu última partida (guardada en este navegador)
    const last = this.lastLocal();
    if (last) {
      header('Tu última partida');
      row(vs(last.players), 'Repetición guardada en este navegador', 'Ver', COLORS.green, () =>
        this.scene.start('Battle', { kind: 'replay', replay: last, players: last.players, back: 'Tv' }),
      );
    }

    if (offline) {
      header('Servidor');
      this.list.add(txt(this, W / 2, y + 30, 'No hay conexión con el servidor.', 24, '#ff9a9a'));
      return;
    }

    header('En directo');
    if (!live.length) {
      this.list.add(txt(this, 54, y + 10, 'Ahora mismo no hay partidas.', 22, '#9aa0c8', { originX: 0 }));
      y += 60;
    }
    for (const l of live.slice(0, 4)) {
      row(
        vs(l.players),
        `${l.mode === 'bot' ? 'Contra bot' : 'Igualada'} · ${l.spectators} mirando`,
        'Mirar',
        COLORS.orange,
        () => this.scene.start('Online', { mode: 'spectate', roomId: l.roomId }),
      );
    }

    header('Repeticiones');
    if (!replays.length) this.list.add(txt(this, 54, y + 10, 'Todavía no hay ninguna.', 22, '#9aa0c8', { originX: 0 }));
    for (const r of replays.slice(0, 5)) {
      const res =
        r.winner === 'draw' || !r.winner
          ? 'Empate'
          : `Gana ${r.players[r.winner].name} ${r.crowns.blue}-${r.crowns.red}`;
      row(vs(r.players), `${res} · ${ago(r.endedAt)}`, 'Ver', COLORS.blue, () => void this.watch(r));
    }
  }

  private async watch(r: ReplayMeta): Promise<void> {
    try {
      const rep = await api.replay(r.id);
      Sfx.play('select');
      this.scene.start('Battle', { kind: 'replay', replay: rep, players: rep.meta.players, back: 'Tv' });
    } catch (err) {
      toast(this, (err as Error).message, '#ff9a9a');
    }
  }

  private lastLocal(): (Replay & { players: Record<Team, PlayerInfo> }) | null {
    try {
      const r = JSON.parse(localStorage.getItem(LAST_REPLAY_KEY) || 'null') as
        (Replay & { players?: Record<Team, PlayerInfo> }) | null;
      return r?.players ? (r as Replay & { players: Record<Team, PlayerInfo> }) : null;
    } catch {
      return null;
    }
  }
}
