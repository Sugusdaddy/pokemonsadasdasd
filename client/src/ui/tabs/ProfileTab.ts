import { VERSION, allCardKeys } from '@arena/shared';
import { L, layoutPreference, setLayoutPreference, type LayoutMode } from '../../layout';
import { Profile } from '../../meta/Profile';
import { Sfx, Music } from '../../systems/Sfx';
import { levelBadge } from '../style';
import * as kit from '../kit';
import { t, arenaName, getLang, setLang, LANGS, type Lang } from '../../i18n';
import { openModal, toast } from '../Modal';
import { textPrompt } from '../textPrompt';
import { Tab, playerName, sectionHeader } from './Tab';
import type { ScrollPanel } from '../ScrollPanel';

export class ProfileTab extends Tab {
  override build(): void {
    const s = this.scene;
    const d = Profile.d;
    const P = this.scroll();
    // PC: dos columnas (perfil y estadísticas | ajustes y herramientas); móvil: una
    const two = L.pc && P.w >= 1200;
    const W = two ? Math.round(P.w / 2) - 10 : P.w;
    const rx = two ? P.w - W : 0;
    let y = 20;

    // ── Cabecera ──
    const head = s.add.container(W / 2, y + 85);
    head.add(kit.panel(s, -W / 2 + 20, -85, W - 40, 170, 'light'));
    levelBadge(s, -W / 2 + 92, 0, d.kingLevel, 46).forEach((o) => head.add(o));
    head.add(kit.text(s, -W / 2 + 162, -34, playerName(), 'h1', '#ffffff', { originX: 0, size: 40 }));
    head.add(kit.text(s, -W / 2 + 162, 10, arenaName(Profile.arena), 'label', '#ffd75a', { originX: 0, size: 22 }));
    head.add(kit.text(s, -W / 2 + 162, 46, t('profile.tapRename'), 'body', '#dfe4ff', { originX: 0, size: 17 }));
    P.add(head);
    P.addTap(W / 2, y + 85, W - 40, 170, () => void this.rename(), head);
    y += 200;

    // ── Estadísticas ──
    for (const o of sectionHeader(s, 30, y + 10, W - 60, t('profile.stats'))) P.add(o);
    y += 44;
    const all = allCardKeys().length;
    const stats: Array<[string, string | number]> = [
      [t('profile.trophies'), d.trophies],
      [t('profile.best'), d.maxTrophies],
      [t('profile.wins'), d.stats.wins],
      [t('profile.losses'), d.stats.losses],
      [t('profile.threeCrowns'), d.stats.threeCrowns],
      [t('profile.battles'), d.stats.battles],
      [t('profile.cardsFound'), `${Object.keys(d.cards).length}/${all}`],
      [t('profile.winRate'), d.stats.battles ? `${Math.round((d.stats.wins / d.stats.battles) * 100)}%` : '—'],
    ];
    const tw = Math.round((W - 60) / 2);
    stats.forEach(([label, value], i) => {
      const x = 20 + (i % 2) * (tw + 20),
        ty = y + Math.floor(i / 2) * 116;
      P.add(kit.panel(s, x, ty, tw, 100, 'inset'));
      P.add(kit.text(s, x + tw / 2, ty + 30, label, 'label', '#aab3e8', { size: 19 }));
      P.add(kit.text(s, x + tw / 2, ty + 68, String(value), 'h2', '#ffffff', { size: 34 }));
    });
    y += 4 * 116 + 20;
    const leftEnd = y;

    // ── Ajustes ──
    if (two) y = 20;
    for (const o of sectionHeader(s, rx + 30, y + 10, W - 60, t('profile.settings'))) P.add(o);
    y += 50;
    const toggles: Array<[string, keyof typeof d.settings]> = [
      [t('profile.sfx'), 'sfx'],
      [t('profile.music'), 'music'],
    ];
    toggles.forEach(([label, key]) => {
      const on = d.settings[key];
      P.add(kit.panel(s, rx + 20, y, W - 40, 80, 'dark'));
      P.add(kit.text(s, rx + 44, y + 38, label, 'h3', '#ffffff', { originX: 0, size: 24 }));
      const g = s.add.graphics();
      const sx = rx + W - 160;
      g.fillStyle(kit.C.ink).fillRoundedRect(sx, y + 17, 118, 46, 23);
      g.fillStyle(on ? kit.C.good : 0x343d86).fillRoundedRect(sx + 3, y + 20, 112, 40, 20);
      g.fillStyle(0xffffff, 0.25).fillRoundedRect(sx + 8, y + 23, 102, 12, 6);
      g.fillStyle(kit.C.ink).fillCircle(sx + (on ? 94 : 24), y + 42, 19);
      g.fillStyle(0xffffff).fillCircle(sx + (on ? 94 : 24), y + 40, 16);
      P.add(g);
      P.add(
        kit.text(s, sx + (on ? 40 : 76), y + 40, on ? t('common.on') : t('common.off'), 'label', '#ffffff', {
          size: 16,
        }),
      );
      P.addTap(rx + W / 2, y + 40, W - 40, 80, () => {
        d.settings[key] = !d.settings[key];
        Profile.save();
        Sfx.configure(d.settings);
        if (key === 'music' && d.settings.music) Music.play('lobby');
        Sfx.play('click');
        this.rebuild();
      });
      y += 94;
    });

    // ── Pantalla e idioma ──
    y = this.segmented(
      P,
      rx,
      W,
      y,
      t('profile.screen'),
      layoutPreference(),
      [
        ['auto', t('profile.screenAuto')],
        ['pc', t('profile.screenPc')],
        ['mobile', t('profile.screenMobile')],
      ],
      (v) => this.setScreen(v as 'auto' | LayoutMode),
    );
    y = this.segmented(
      P,
      rx,
      W,
      y,
      t('lang.label'),
      getLang(),
      LANGS.map((l) => [l.id, l.label] as [string, string]),
      (v) => {
        setLang(v as Lang);
        // se redibuja todo el menú con el idioma nuevo
        s.scene.restart({ tab: 'profile' });
      },
    );

    // ── Herramientas ──
    y += 10;
    for (const o of sectionHeader(s, rx + 30, y + 10, W - 60, t('profile.tools'))) P.add(o);
    y += 50;
    const tools: Array<[string, kit.ButtonVariant, () => void]> = [
      [
        t('profile.testResources'),
        'info',
        () => {
          d.gold += 5000;
          d.gems += 500;
          Profile.save();
          Sfx.play('coin');
          toast(s, t('profile.resourcesAdded'), '#7dff8a');
        },
      ],
      [
        t('profile.testTrophies'),
        'info',
        () => {
          d.trophies += 300;
          d.maxTrophies = Math.max(d.maxTrophies, d.trophies);
          Profile.save();
          Sfx.play('coin');
          this.rebuild();
        },
      ],
      [t('profile.reset'), 'danger', () => this.confirmReset()],
    ];
    tools.forEach(([label, variant, cb]) => {
      const b = kit.button(s, rx + W / 2, y + 38, W - 40, 72, label, variant, () => {}, { size: 22 });
      b.disableInteractive();
      P.add(b);
      P.addTap(
        rx + W / 2,
        y + 38,
        W - 40,
        72,
        () => {
          Sfx.play('click');
          cb();
        },
        b,
      );
      y += 92;
    });

    y += 20;
    if (two) y = Math.max(y, leftEnd);
    P.add(
      kit.text(s, P.w / 2, y + 70, t('profile.credits', { v: VERSION }), 'body', '#7480c0', {
        size: 17,
        lineSpacing: 6,
        wordWrap: { width: Math.min(P.w - 60, 900) },
      }),
    );
    P.setContentHeight(y + 180);
  }

  /** Fila de ajuste con opciones excluyentes (pantalla, idioma). */
  segmented(
    P: ScrollPanel,
    rx: number,
    W: number,
    y: number,
    label: string,
    current: string,
    opts: Array<[string, string]>,
    onPick: (v: string) => void,
  ): number {
    const s = this.scene;
    const ow = Math.min(132, Math.floor((W - 260) / opts.length));
    P.add(kit.panel(s, rx + 20, y, W - 40, 80, 'dark'));
    P.add(kit.text(s, rx + 44, y + 38, label, 'h3', '#ffffff', { originX: 0, size: 24 }));
    opts.forEach(([v, text], i) => {
      const bx = rx + W - 44 - (opts.length - i) * (ow + 6) + ow / 2 + 6,
        active = current === v;
      const c = s.add.container(bx, y + 40);
      c.add(kit.panel(s, -ow / 2, -26, ow, 48, active ? 'gold' : 'card'));
      const tt = kit.text(s, 0, -4, text, 'label', active ? '#ffffff' : '#aab3e8', { size: 19 });
      if (tt.width > ow - 12) tt.setScale((ow - 12) / tt.width);
      c.add(tt);
      P.add(c);
      P.addTap(
        bx,
        y + 40,
        ow,
        50,
        () => {
          if (active) return;
          Sfx.play('click');
          onPick(v);
        },
        c,
      );
    });
    return y + 94;
  }

  /** Selector Auto / PC / Móvil. Se guarda en el navegador y se aplica al momento. */
  setScreen(v: 'auto' | LayoutMode): void {
    setLayoutPreference(v);
    const before = L.mode;
    this.scene.game.events.emit('layout-check');
    // si el modo no cambia (p. ej. "Auto" en la misma ventana), solo se redibuja
    if (L.mode === before) this.rebuild();
  }

  async rename(): Promise<void> {
    const name = await textPrompt(t('profile.renameTitle'), { maxLength: 16, placeholder: playerName() });
    if (name && name.trim()) {
      Profile.d.name = name.trim().slice(0, 16);
      Profile.save();
      this.rebuild();
    }
  }

  confirmReset(): void {
    const s = this.scene;
    openModal(s, 600, 440, t('profile.resetTitle'), (box, close) => {
      box.add(kit.text(s, 0, -50, t('profile.resetBody'), 'body', '#ffffff', { size: 24, wordWrap: { width: 500 } }));
      box.add(kit.button(s, -135, 110, 230, 84, t('common.cancel'), 'neutral', close, { size: 28 }));
      box.add(
        kit.button(
          s,
          135,
          110,
          230,
          84,
          t('profile.resetConfirm'),
          'danger',
          () => {
            Profile.reset();
            close();
            s.scene.restart({ tab: 'battle' });
          },
          { size: 28 },
        ),
      );
    });
  }
}
