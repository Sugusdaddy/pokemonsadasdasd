import { W, COLORS, ARENAS, VERSION, allCardKeys } from '@arena/shared';
import { Profile } from '../../meta/Profile';
import { Sfx, Music } from '../../systems/Sfx';
import { txt, panel, button, levelBadge } from '../style';
import { openModal, toast } from '../Modal';
import { Tab } from './Tab';

export class ProfileTab extends Tab {
  override build(): void {
    const s = this.scene;
    const d = Profile.d;
    const P = this.scroll();
    let y = 20;

    // ── Cabecera ──
    P.add(panel(s, 20, y, W - 40, 170, 0x2a3170, 22));
    levelBadge(s, 90, y + 85, d.kingLevel, 46).forEach((o) => P.add(o));
    P.add(txt(s, 160, y + 50, d.name, 38, '#ffffff', { originX: 0 }));
    P.add(txt(s, 160, y + 95, `${ARENAS[Profile.arena].name}`, 22, '#ffd84a', { originX: 0 }));
    P.add(txt(s, 160, y + 130, 'Toca para cambiar el nombre', 17, '#9aa0c8', { originX: 0 }));
    P.addTap(W / 2, y + 85, W - 40, 170, () => this.rename());
    y += 200;

    // ── Estadísticas ──
    const all = allCardKeys().length;
    const stats: Array<[string, string | number]> = [
      ['Trofeos', d.trophies],
      ['Récord', d.maxTrophies],
      ['Victorias', d.stats.wins],
      ['Derrotas', d.stats.losses],
      ['Victorias 3 coronas', d.stats.threeCrowns],
      ['Batallas', d.stats.battles],
      ['Cartas encontradas', `${Object.keys(d.cards).length}/${all}`],
      ['% de victorias', d.stats.battles ? `${Math.round((d.stats.wins / d.stats.battles) * 100)}%` : '—'],
    ];
    stats.forEach(([label, value], i) => {
      const cx = i % 2 ? 540 : 190,
        cy = y + 60 + Math.floor(i / 2) * 120;
      P.add(panel(s, cx - 160, cy - 50, 320, 100, 0x23284d, 16));
      P.add(txt(s, cx, cy - 18, label, 20, '#c9c3ff'));
      P.add(txt(s, cx, cy + 20, String(value), 32, '#ffffff'));
    });
    y += 4 * 120 + 30;

    // ── Ajustes ──
    P.add(txt(s, 30, y, 'Ajustes', 32, '#ffffff', { originX: 0 }));
    y += 40;
    const toggles: Array<[string, keyof typeof d.settings]> = [
      ['Efectos de sonido', 'sfx'],
      ['Música', 'music'],
    ];
    toggles.forEach(([label, key]) => {
      const on = d.settings[key];
      P.add(panel(s, 20, y, W - 40, 84, 0x23284d, 16));
      P.add(txt(s, 44, y + 42, label, 26, '#ffffff', { originX: 0 }));
      const g = s.add.graphics();
      g.fillStyle(COLORS.panelDark).fillRoundedRect(560, y + 20, 120, 46, 23);
      g.fillStyle(on ? COLORS.green : 0x4a4f80).fillRoundedRect(563, y + 23, 114, 40, 20);
      g.fillStyle(0xffffff).fillCircle(on ? 655 : 585, y + 43, 17);
      P.add(g);
      P.addTap(W / 2, y + 42, W - 40, 84, () => {
        d.settings[key] = !d.settings[key];
        Profile.save();
        Sfx.configure(d.settings);
        if (key === 'music' && d.settings.music) Music.play('lobby');
        Sfx.play('click');
        this.rebuild();
      });
      y += 100;
    });

    // ── Herramientas ──
    y += 10;
    P.add(txt(s, 30, y, 'Herramientas', 32, '#ffffff', { originX: 0 }));
    y += 40;
    const tools: Array<[string, number, () => void]> = [
      [
        'Modo prueba: +5000 oro y +500 gemas',
        COLORS.blue,
        () => {
          d.gold += 5000;
          d.gems += 500;
          Profile.save();
          Sfx.play('coin');
          toast(s, '¡Recursos añadidos!', '#7dff8a');
        },
      ],
      [
        'Modo prueba: +300 trofeos',
        COLORS.blue,
        () => {
          d.trophies += 300;
          d.maxTrophies = Math.max(d.maxTrophies, d.trophies);
          Profile.save();
          Sfx.play('coin');
          this.rebuild();
        },
      ],
      ['Reiniciar progreso', COLORS.red, () => this.confirmReset()],
    ];
    tools.forEach(([label, color, cb]) => {
      const g = s.add.graphics();
      g.fillStyle(COLORS.panelDark).fillRoundedRect(17, y - 3, W - 34, 84, 18);
      g.fillStyle(color).fillRoundedRect(20, y, W - 40, 74, 16);
      g.fillStyle(0xffffff, 0.2).fillRoundedRect(26, y + 4, W - 52, 22, 10);
      P.add(g);
      P.add(txt(s, W / 2, y + 37, label, 24));
      P.addTap(W / 2, y + 37, W - 40, 74, () => {
        Sfx.play('click');
        cb();
      });
      y += 94;
    });

    y += 20;
    P.add(
      txt(
        s,
        W / 2,
        y + 60,
        `Arena Royale v${VERSION} · Fan game sin ánimo de lucro\n` +
          'Sprites: PMD SpriteCollab (ver CREDITS.md). Muchos son\n' +
          'sprites oficiales de Pokémon Mundo Misterioso (Chunsoft).\n' +
          'Pokémon © Nintendo / Creatures / GAME FREAK / The Pokémon Company.\n' +
          'Proyecto de fans no afiliado ni aprobado por ellos ni por Supercell.',
        17,
        '#9aa0c8',
        { lineSpacing: 6 },
      ),
    );
    P.setContentHeight(y + 160);
  }

  rename(): void {
    let name: string | null = null;
    try {
      name = window.prompt('Nombre de entrenador (máx. 16 letras):', Profile.d.name);
    } catch {
      name = null;
    }
    if (name && name.trim()) {
      Profile.d.name = name.trim().slice(0, 16);
      Profile.save();
      this.rebuild();
    }
  }

  confirmReset(): void {
    const s = this.scene;
    openModal(s, 580, 440, '¿Reiniciar?', (box, close) => {
      box.add(txt(s, 0, -40, 'Perderás todas tus cartas, oro,\ngemas y trofeos.', 26));
      box.add(button(s, -130, 120, 220, 84, 'Cancelar', COLORS.blue, close, 28));
      box.add(
        button(
          s,
          130,
          120,
          220,
          84,
          'Reiniciar',
          COLORS.red,
          () => {
            Profile.reset();
            close();
            s.scene.restart({ tab: 'battle' });
          },
          28,
        ),
      );
    });
  }
}
