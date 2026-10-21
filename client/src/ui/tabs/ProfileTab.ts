import type Phaser from 'phaser';
import { VERSION, allCardKeys } from '@arena/shared';
import { L, layoutPreference, setLayoutPreference, type LayoutMode } from '../../layout';
import { Profile } from '../../meta/Profile';
import { Sfx, Music, DEFAULT_VOLUMES, type Volumes } from '../../systems/Sfx';
import { panelButton } from './social/common';
import { levelBadge } from '../style';
import * as kit from '../kit';
import { t, arenaName, getLang, setLang, LANGS, type Lang } from '../../i18n';
import { openModal, toast } from '../Modal';
import { textPrompt } from '../textPrompt';
import { Tab, playerName, sectionHeader, runAction } from './Tab';
import { ApiError, walletSignIn } from '../../net/session';
import { availableWallets, shortAddress, type WalletOption } from '../../net/wallet';
import type { ScrollPanel } from '../ScrollPanel';
import { SHAKE_LEVELS, type ShakeLevel } from '../../battle/juice';
import { shake } from '../../systems/Shake';
import { canInstall, iosInstallHint, promptInstall } from '../../systems/Install';
import {
  QUALITY_LEVELS,
  applyFpsCap,
  isAutoLow,
  qualitySetting,
  setAutoLow,
  type QualityLevel,
} from '../../systems/Quality';

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

    // ── Cuenta (invitado o wallet de Solana) ──
    y = this.accountSection(P, W, y);

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
    const settings = Profile.settings;
    // mezclador: general, música y efectos
    const mixer: Array<[string, keyof Volumes]> = [
      [t('profile.volMaster'), 'master'],
      [t('profile.volMusic'), 'music'],
      [t('profile.volSfx'), 'sfx'],
    ];
    for (const [label, key] of mixer) y = this.volumeRow(P, rx, W, y, label, key);

    // ── Vibración de pantalla (golpes fuertes, hechizos, torres) ──
    y = this.segmented(
      P,
      rx,
      W,
      y,
      t('profile.shake'),
      settings.shake ?? 'normal',
      SHAKE_LEVELS.map((l) => [l, t(`profile.shake.${l}`)] as [string, string]),
      (v) => {
        settings.shake = v as ShakeLevel;
        Profile.saveSettings();
        Sfx.play('click');
        // una muestra de cómo se nota
        shake(s, 220, 0.01);
        this.rebuild();
      },
    );

    // ── Calidad gráfica ──
    y = this.segmented(
      P,
      rx,
      W,
      y,
      t('profile.quality'),
      qualitySetting(),
      QUALITY_LEVELS.map(
        (q) => [q, q === 'auto' && isAutoLow() ? t('quality.autoLowShort') : t(`quality.${q}`)] as [string, string],
      ),
      (v) => {
        settings.quality = v as QualityLevel;
        setAutoLow(false); // elegir a mano vuelve a dejar que Auto lo mida de nuevo
        Profile.saveSettings();
        applyFpsCap(s.game);
        this.rebuild();
      },
    );

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

    // ── App instalable (si el navegador lo permite) ──
    if (canInstall()) {
      const b = kit.button(s, rx + W / 2, y + 38, W - 40, 72, t('profile.install'), 'success', () => {}, { size: 22 });
      b.disableInteractive();
      P.add(b);
      P.addTap(
        rx + W / 2,
        y + 38,
        W - 40,
        72,
        () => {
          Sfx.play('click');
          void promptInstall().then((ok) => {
            if (ok) toast(s, t('profile.installed'), '#7dff8a');
            if (s.sys.isActive()) this.rebuild();
          });
        },
        b,
      );
      y += 92;
    } else if (iosInstallHint()) {
      P.add(
        kit.text(s, rx + W / 2, y + 26, t('profile.installIos'), 'body', '#aab3e8', {
          size: 18,
          wordWrap: { width: W - 60 },
        }),
      );
      y += 62;
    }

    // ── Herramientas ──
    y += 10;
    for (const o of sectionHeader(s, rx + 30, y + 10, W - 60, t('profile.tools'))) P.add(o);
    y += 50;
    const tools: Array<[string, kit.ButtonVariant, () => void]> = [
      [
        t('profile.testResources'),
        'info',
        () =>
          void runAction(
            s,
            'dev:resources',
            () => Profile.devCheat('resources'),
            () => {
              Sfx.play('coin');
              toast(s, t('profile.resourcesAdded'), '#7dff8a');
            },
          ),
      ],
      [
        t('profile.testTrophies'),
        'info',
        () =>
          void runAction(
            s,
            'dev:trophies',
            () => Profile.devCheat('trophies'),
            () => {
              Sfx.play('coin');
              this.rebuild();
            },
          ),
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

  /** Fila de volumen: − [10 tramos que se pueden tocar] +. */
  volumeRow(P: ScrollPanel, rx: number, W: number, y: number, label: string, key: keyof Volumes): number {
    const s = this.scene;
    const v = Profile.settings.vol?.[key] ?? DEFAULT_VOLUMES[key];
    const level = Math.round(v * 10);
    const set = (n: number) => {
      const vol = { ...DEFAULT_VOLUMES, ...Profile.settings.vol, [key]: Math.max(0, Math.min(10, n)) / 10 };
      Profile.settings.vol = vol;
      Profile.saveSettings();
      Sfx.setVolumes(vol);
      if (key === 'music') Music.play('lobby');
      else Sfx.play('select');
      this.rebuild();
    };
    P.add(kit.panel(s, rx + 20, y, W - 40, 80, 'dark'));
    P.add(kit.text(s, rx + 44, y + 28, label, 'h3', '#ffffff', { originX: 0, size: 23 }));
    P.add(
      kit.text(s, rx + 44, y + 58, level ? `${level * 10}%` : t('common.off'), 'label', level ? '#aab3e8' : '#ff9a9a', {
        originX: 0,
        size: 16,
      }),
    );
    const n = 10,
      segW = 16,
      gap = 4;
    const barW = n * segW + (n - 1) * gap;
    const plusX = rx + W - 70,
      barX = plusX - 40 - barW,
      minusX = barX - 40;
    panelButton(P, minusX, y + 40, 52, 48, '-', 'neutral', () => set(level - 1), { size: 26, disabled: level <= 0 });
    panelButton(P, plusX, y + 40, 52, 48, '+', 'neutral', () => set(level + 1), { size: 26, disabled: level >= 10 });
    const g = s.add.graphics();
    const col = key === 'music' ? kit.C.info : key === 'sfx' ? kit.C.good : kit.C.gold;
    for (let i = 0; i < n; i++) {
      const x = barX + i * (segW + gap);
      const h = 14 + i * 2; // tramos cada vez más altos, como un ecualizador
      g.fillStyle(kit.C.ink).fillRoundedRect(x - 1, y + 58 - h - 1, segW + 2, h + 2, 4);
      g.fillStyle(i < level ? col : 0x2a3170).fillRoundedRect(x, y + 58 - h, segW, h, 3);
      if (i < level) g.fillStyle(0xffffff, 0.3).fillRect(x + 2, y + 58 - h + 2, segW - 4, 3);
      // tocar un tramo pone ese nivel (o lo baja uno si ya era ese)
      P.addTap(x + segW / 2, y + 40, segW + gap, 60, () => set(level === i + 1 ? i : i + 1));
    }
    P.add(g);
    return y + 94;
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
      await runAction(
        this.scene,
        'rename',
        () => Profile.setName(name.trim().slice(0, 16)),
        () => this.rebuild(),
      );
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
          () =>
            void runAction(
              s,
              'reset',
              () => Profile.reset(),
              () => {
                close();
                s.scene.restart({ tab: 'battle' });
              },
            ),
          { size: 28 },
        ),
      );
    });
  }

  // ───────────────────────── Cuenta ─────────────────────────

  /** Tarjeta de cuenta: invitado (con "Conectar wallet") o wallet conectada (con "Cerrar sesión"). */
  accountSection(P: ScrollPanel, W: number, y: number): number {
    const s = this.scene;
    for (const o of sectionHeader(s, 30, y + 10, W - 60, t('account.title'))) P.add(o);
    y += 44;
    const guest = !Profile.wallet;
    const h = 196;
    const c = s.add.container(0, y);
    c.add(kit.panel(s, 20, 0, W - 40, h, guest ? 'card' : 'green'));
    // chip de estado
    const chip = guest ? t('account.chipGuest') : t('account.chipWallet');
    const ct = kit.text(s, 0, 0, chip, 'label', '#ffffff', { size: 16 });
    const cw = ct.width + 28;
    c.add(kit.panel(s, 44, 18, cw, 30, guest ? 'dark' : 'gold'));
    ct.setPosition(44 + cw / 2, 32);
    c.add(ct);
    const title = guest ? t('account.guest') : shortAddress(Profile.wallet!);
    c.add(kit.text(s, 44 + cw + 14, 32, title, 'h3', '#ffffff', { originX: 0, size: 26 }));
    const btnW = Math.min(300, Math.round((W - 80) * 0.42));
    c.add(
      kit.text(s, 44, 104, guest ? t('account.guestBody') : t('account.walletBody'), 'body', '#e6eaff', {
        originX: 0,
        size: 18,
        lineSpacing: 4,
        wordWrap: { width: W - 120 - btnW },
      }),
    );
    const bx = W - 40 - btnW / 2,
      by = h - 52;
    const b = kit.button(
      s,
      bx,
      by,
      btnW,
      70,
      guest ? t('account.connect') : t('account.signOut'),
      guest ? 'primary' : 'neutral',
      () => {},
      { size: 22 },
    );
    b.disableInteractive();
    c.add(b);
    P.add(c);
    P.addTap(bx, y + by, btnW, 70, () => (guest ? this.openWalletPicker() : this.confirmSignOut()), b);
    return y + h + 30;
  }

  /** Ventana con las wallets de Solana instaladas en el navegador. */
  openWalletPicker(): void {
    const s = this.scene;
    const wallets = availableWallets();
    const rowH = 92;
    const h = wallets.length ? 250 + wallets.length * rowH : 470;
    openModal(s, 620, h, t('account.pickTitle'), (box, close) => {
      const top = -h / 2 + 100;
      box.add(
        kit.text(s, 0, top, wallets.length ? t('account.pickBody') : t('account.noWallets'), 'body', '#e6eaff', {
          size: 19,
          wordWrap: { width: 520 },
          lineSpacing: 4,
        }),
      );
      if (!wallets.length) {
        box.add(
          kit.button(
            s,
            0,
            h / 2 - 80,
            380,
            84,
            t('account.getPhantom'),
            'primary',
            () => {
              window.open('https://phantom.app/download', '_blank', 'noopener');
            },
            { size: 24 },
          ),
        );
        return;
      }
      wallets.forEach((w, i) => {
        const ry = top + 70 + i * rowH;
        const row = kit.button(s, 0, ry, 520, rowH - 16, '', 'dark', () => void this.connectWallet(w, close), {
          size: 24,
        });
        row.add(kit.text(s, -150, -2, w.name, 'h3', '#ffffff', { originX: 0, size: 26 }));
        box.add(row);
        void this.walletIcon(w, i).then((key) => {
          if (!row.active) return;
          if (key) row.add(s.add.image(-200, -2, key).setDisplaySize(52, 52));
          else row.add(this.genericWalletIcon(-200, -2));
        });
      });
    });
  }

  /** Carga el icono (data URL) de una wallet como textura. Devuelve la clave o null si falla. */
  walletIcon(w: WalletOption, i: number): Promise<string | null> {
    const s = this.scene;
    if (!w.icon || !w.icon.startsWith('data:image')) return Promise.resolve(null);
    const key = `wallet_${w.name.replace(/\W/g, '')}_${i}`;
    if (s.textures.exists(key)) return Promise.resolve(key);
    return new Promise((resolve) => {
      const done = (ok: boolean) => {
        clearTimeout(timer);
        s.textures.off(`addtexture-${key}`, onAdd);
        s.textures.off('onerror', onErr);
        resolve(ok ? key : null);
      };
      const onAdd = () => done(true);
      const onErr = (k: string) => k === key && done(false);
      const timer = setTimeout(() => done(s.textures.exists(key)), 1500);
      s.textures.once(`addtexture-${key}`, onAdd);
      s.textures.on('onerror', onErr);
      s.textures.addBase64(key, w.icon);
    });
  }

  genericWalletIcon(x: number, y: number): Phaser.GameObjects.Graphics {
    const g = this.scene.add.graphics({ x, y });
    g.fillStyle(kit.C.ink).fillRoundedRect(-26, -20, 52, 40, 9);
    g.fillStyle(0x9b5cff).fillRoundedRect(-23, -17, 46, 34, 7);
    g.fillStyle(0xffffff, 0.3).fillRoundedRect(-19, -14, 38, 9, 4);
    g.fillStyle(kit.C.ink).fillRoundedRect(6, -5, 20, 14, 5);
    g.fillStyle(0xffd75a).fillCircle(14, 2, 4);
    return g;
  }

  /** Conecta la wallet, firma el mensaje del servidor y entra con esa cuenta. */
  async connectWallet(w: WalletOption, close: () => void): Promise<void> {
    const s = this.scene;
    await runAction(
      s,
      'wallet',
      async () => {
        try {
          const { address, sign } = await w.connect();
          Profile.apply(await walletSignIn(address, sign));
          return true;
        } catch (e) {
          if (e instanceof ApiError) throw e;
          // la wallet lanza sus propios errores: cancelar la firma es lo más habitual
          const msg = e instanceof Error ? e.message : String(e);
          const code = (e as { code?: number })?.code;
          if (code === 4001 || /reject|denied|cancel|declin|closed/i.test(msg)) {
            toast(s, t('account.signCancelled'), '#ffd84a');
            return false;
          }
          throw new ApiError(msg.startsWith('err.') ? msg : 'err.wallet.signature', 0);
        }
      },
      (ok) => {
        if (!ok) return;
        Sfx.play('coin');
        close();
        toast(s, t('account.connected'), '#7dff8a');
        s.scene.restart({ tab: 'profile' });
      },
    );
  }

  confirmSignOut(): void {
    const s = this.scene;
    openModal(s, 600, 420, t('account.signOutTitle'), (box, close) => {
      box.add(kit.text(s, 0, -46, t('account.signOutBody'), 'body', '#ffffff', { size: 22, wordWrap: { width: 500 } }));
      box.add(kit.button(s, -135, 100, 230, 84, t('common.cancel'), 'neutral', close, { size: 28 }));
      box.add(
        kit.button(
          s,
          135,
          100,
          230,
          84,
          t('account.signOut'),
          'danger',
          () =>
            void runAction(
              s,
              'signout',
              () => Profile.signOut(),
              () => {
                close();
                s.scene.restart({ tab: 'profile' });
              },
            ),
          { size: 26 },
        ),
      );
    });
  }
}
