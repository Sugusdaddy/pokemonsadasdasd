import type Phaser from 'phaser';
import { COLORS, KING_XP, type BallReward } from '@arena/shared';
import { L } from '../layout';
import { Profile } from '../meta/Profile';
import { Music, Sfx } from '../systems/Sfx';
import { levelBadge, fmtNum } from '../ui/style';
import * as kit from '../ui/kit';
import { t } from '../i18n';
import { BattleTab } from '../ui/tabs/BattleTab';
import { CardsTab } from '../ui/tabs/CardsTab';
import { ShopTab } from '../ui/tabs/ShopTab';
import { RoadTab } from '../ui/tabs/RoadTab';
import { ProfileTab } from '../ui/tabs/ProfileTab';
import { SIDEBAR_W, TOP_BAR, playerName, type MenuScene, type Tab, type TabKey } from '../ui/tabs/Tab';
import { shortAddress } from '../net/wallet';
import { BaseScene } from './BaseScene';

export const TOP = TOP_BAR; // alto de la barra superior
export const NAV_Y = 1136; // inicio de la barra de pestañas (móvil)

type TabClass = new (scene: MenuScene) => Tab;
const TABS: Array<{ key: TabKey; label: string; icon: string; cls: TabClass }> = [
  { key: 'shop', label: 'nav.shop', icon: 'ic_shop', cls: ShopTab },
  { key: 'cards', label: 'nav.cards', icon: 'ic_cards', cls: CardsTab },
  { key: 'battle', label: 'nav.battle', icon: 'ic_battle', cls: BattleTab },
  { key: 'road', label: 'nav.road', icon: 'ic_road', cls: RoadTab },
  { key: 'profile', label: 'nav.profile', icon: 'ic_profile', cls: ProfileTab },
];

interface NavItem {
  key: TabKey;
  x: number;
  y: number;
  icon: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  active: Phaser.GameObjects.NineSlice;
  hover: Phaser.GameObjects.NineSlice;
}

/**
 * Menú principal con barra superior, contenido por pestañas y navegación:
 * abajo en móvil, barra lateral a la izquierda en PC.
 */
export class LobbyScene extends BaseScene implements MenuScene {
  private tab: Tab | null = null;
  private current: TabKey | null = null;
  private tickT = 0;
  private levelBadgeObjs: Array<Phaser.GameObjects.Graphics | Phaser.GameObjects.Text> | null = null;
  private badgeLevel = -1;
  private nameT!: Phaser.GameObjects.Text;
  /** Chip junto al nombre: invitado o wallet conectada. */
  private accountChip: Phaser.GameObjects.Container | null = null;
  private chipSig = '';
  private xpBar!: kit.Bar;
  private gold!: ReturnType<typeof kit.pill>;
  private gems!: ReturnType<typeof kit.pill>;
  private navItems: NavItem[] = [];
  private accent!: Phaser.GameObjects.Graphics;
  private badges!: Phaser.GameObjects.Graphics;

  constructor() {
    super('Lobby');
  }

  create(data?: { tab?: TabKey }): void {
    this.modalOpen = 0;
    this.tab = null;
    this.current = null;
    this.badgeLevel = -1;
    this.levelBadgeObjs = null;
    this.accountChip = null;
    this.chipSig = '';
    Profile.tickSlots();
    // lo que cambie en la cuenta (respuestas del servidor) se refleja en la barra y los avisos
    const off = Profile.onChange(() => {
      if (!this.sys.isActive()) return;
      this.refreshTop();
      this.drawBadges();
    });
    this.events.once('shutdown', off);
    Music.play('lobby');
    kit.menuBackground(this, L.w, L.h);
    this.buildTopBar();
    this.buildNav();
    this.showTab(data?.tab || 'battle', true);
    this.input.on('pointerdown', () => Sfx.unlock());
    this.bindKeys();
    kit.fadeIn(this);
    // si la ventana cambió de forma durante la batalla, se aplica ahora
    this.game.events.emit('layout-check');
    (window as unknown as { __lobby: LobbyScene }).__lobby = this;
  }

  // ───────── Barra superior ─────────
  buildTopBar(): void {
    const g = this.add.graphics().setDepth(100);
    g.fillGradientStyle(0x1f2660, 0x1f2660, 0x111538, 0x111538, 1).fillRect(0, 0, L.w, TOP);
    g.fillStyle(kit.C.ink).fillRect(0, TOP - 2, L.w, 4);
    g.fillStyle(kit.C.gold, 0.55).fillRect(0, TOP - 5, L.w, 2);
    g.fillStyle(0xffffff, 0.06).fillRect(0, 0, L.w, TOP * 0.45);

    // jugador: insignia, nombre y experiencia
    this.nameT = kit.text(this, 96, 36, '', 'h3', '#ffffff', { originX: 0, size: 26 }).setDepth(102);
    this.xpBar = kit.progressBar(this, 96, 58, L.pc ? 240 : 200, 28, kit.C.info, 0, '');
    this.xpBar.root.setDepth(102);
    const profileZone = this.add
      .zone(170, TOP / 2, 300, TOP)
      .setInteractive({ useHandCursor: true })
      .setDepth(105);
    profileZone.on('pointerup', () => !this.modalOpen && this.showTab('profile'));

    // monedas (al tocarlas se va a la tienda)
    const pw = L.pc ? 200 : 150;
    const gx = L.pc ? L.w - 2 * pw - 60 : 380,
      mx = L.pc ? L.w - pw - 30 : 556;
    this.gold = kit.pill(this, gx, 56, pw, 'ic_gold', '0');
    this.gems = kit.pill(this, mx, 56, pw, 'ic_gem', '0');
    this.gold.root.setDepth(102);
    this.gems.root.setDepth(102);
    const goShop = this.add
      .zone(gx + (mx + pw - gx) / 2, 56, mx + pw - gx, 70)
      .setInteractive({ useHandCursor: true })
      .setDepth(105);
    goShop.on('pointerup', () => {
      if (!this.modalOpen) this.showTab('shop');
    });
    this.refreshTop();
  }

  refreshTop(): void {
    const d = Profile.d;
    const need = KING_XP[d.kingLevel] || 1;
    if (this.badgeLevel !== d.kingLevel) {
      if (this.levelBadgeObjs) this.levelBadgeObjs.forEach((o) => o.destroy());
      this.levelBadgeObjs = levelBadge(this, 50, 56, d.kingLevel, 32);
      this.levelBadgeObjs.forEach((o) => o.setDepth(103));
      this.badgeLevel = d.kingLevel;
    }
    this.nameT.setText(playerName());
    this.drawAccountChip();
    this.xpBar.set(d.xp / need, `${d.xp}/${need}`);
    this.gold.set(fmtNum(d.gold));
    this.gems.set(fmtNum(d.gems));
  }

  /** "Invitado" o la wallet (abreviada) al lado del nombre. */
  drawAccountChip(): void {
    const wallet = Profile.wallet;
    const sig = `${wallet ?? ''}|${this.nameT.width}`;
    if (sig === this.chipSig && this.accountChip) return;
    this.chipSig = sig;
    this.accountChip?.destroy();
    const label = wallet ? shortAddress(wallet) : t('account.chipGuest');
    const c = this.add.container(this.nameT.x + this.nameT.width + 12, this.nameT.y).setDepth(102);
    const tt = kit.text(this, 0, 0, label, 'label', '#ffffff', { size: 14 });
    const w = tt.width + 22;
    c.add(kit.panel(this, 0, -14, w, 26, wallet ? 'green' : 'dark'));
    tt.setPosition(w / 2, -1);
    c.add(tt);
    this.accountChip = c;
  }

  // ───────── Navegación (inferior en móvil, lateral en PC) ─────────
  buildNav(): void {
    if (L.pc) {
      kit.panel(this, -24, TOP - 8, SIDEBAR_W + 24, L.h - TOP + 40, 'dark').setDepth(99);
    } else {
      kit.panel(this, -20, NAV_Y - 4, L.w + 40, L.h - NAV_Y + 40, 'dark').setDepth(99);
    }
    this.accent = this.add.graphics().setDepth(101);
    this.navItems = TABS.map((tb, i) => {
      const x = L.pc ? 62 : 72 + i * 144;
      const y = L.pc ? TOP + 78 + i * 128 : NAV_Y + 62;
      const active = L.pc
        ? kit.panel(this, 12, y - 54, SIDEBAR_W - 26, 100, 'gold')
        : kit.panel(this, x - 70, NAV_Y - 22, 140, 158, 'gold');
      active.setDepth(100).setVisible(false);
      const hover = L.pc
        ? kit.panel(this, 12, y - 54, SIDEBAR_W - 26, 100, 'light')
        : kit.panel(this, x - 66, NAV_Y + 2, 132, 128, 'light');
      hover.setDepth(100).setVisible(false).setAlpha(0.55);
      const icon = this.add.image(x, y, tb.icon).setDisplaySize(60, 60).setDepth(102);
      const label = L.pc
        ? kit.text(this, 104, y, t(tb.label), 'h3', '#ffffff', { originX: 0, size: 25 }).setDepth(102)
        : kit.text(this, x, NAV_Y + 112, t(tb.label), 'label', '#ffffff', { size: 20 }).setDepth(102);
      if (L.pc) {
        const hk = kit.text(this, SIDEBAR_W - 30, y + 30, String(i + 1), 'small', '#7480c0', { size: 15, originX: 1 });
        hk.setDepth(102);
      }
      const zone = L.pc ? this.add.zone(SIDEBAR_W / 2, y, SIDEBAR_W, 120) : this.add.zone(x, NAV_Y + 72, 144, 144);
      zone.setInteractive({ useHandCursor: true }).setDepth(103);
      zone.on('pointerup', () => {
        if (!this.modalOpen) {
          Sfx.play('select');
          this.showTab(tb.key);
        }
      });
      zone.on('pointerover', () => this.drawNav(tb.key));
      zone.on('pointerout', () => this.drawNav());
      return { key: tb.key, x, y, icon, label, active, hover };
    });
    this.badges = this.add.graphics().setDepth(104);
  }

  drawNav(hover: TabKey | null = null): void {
    const g = this.accent;
    g.clear();
    for (const it of this.navItems) {
      const active = it.key === this.current;
      it.active.setVisible(active);
      it.hover.setVisible(!active && it.key === hover);
      if (L.pc) {
        it.icon.setDisplaySize(active ? 70 : 58, active ? 70 : 58);
        it.label.setColor(active ? '#ffffff' : '#aab3e8');
        if (active) {
          g.fillStyle(kit.C.ink).fillRoundedRect(0, it.y - 42, 9, 84, 4);
          g.fillStyle(kit.C.gold).fillRoundedRect(0, it.y - 39, 6, 78, 3);
        }
      } else {
        it.icon.setDisplaySize(active ? 78 : 58, active ? 78 : 58).setY(NAV_Y + (active ? 44 : 62));
        it.label.setVisible(active);
      }
    }
    this.drawBadges();
  }

  /** Teclado: 1-5 cambian de pestaña y Enter empieza la batalla (Esc lo gestiona cada ventana). */
  bindKeys(): void {
    const kb = this.input.keyboard;
    if (!kb) return;
    kb.on('keydown', (e: KeyboardEvent) => {
      if (this.modalOpen) return;
      const n = Number(e.key);
      if (n >= 1 && n <= TABS.length) {
        Sfx.play('select');
        this.showTab(TABS[n - 1].key);
      } else if (e.key === 'Enter' && this.current === 'battle' && this.tab instanceof BattleTab) {
        this.tab.startBattle();
      }
    });
  }

  drawBadges(): void {
    const g = this.badges;
    g.clear();
    const dot = (key: TabKey, on: boolean) => {
      if (!on) return;
      const it = this.navItems.find((i) => i.key === key);
      if (!it) return;
      const bx = it.x + 30,
        by = L.pc ? it.y - 28 : NAV_Y + 22;
      g.fillStyle(kit.C.ink).fillCircle(bx, by + 2, 14);
      g.fillStyle(COLORS.red).fillCircle(bx, by, 12);
      g.fillStyle(0xffffff, 0.45).fillCircle(bx - 4, by - 4, 4);
    };
    dot(
      'cards',
      Object.keys(Profile.d.cards).some((k) => Profile.canUpgrade(k) && Profile.d.gold >= Profile.goldNeeded(k)),
    );
    dot('road', RoadTab.claimable());
    // el servidor renueva la tienda cada día: basta con mirar si el regalo está sin cobrar
    dot('shop', !Profile.d.shop.freeClaimed);
  }

  showTab(key: TabKey, instant = false): void {
    if (this.current === key && this.tab) return;
    if (this.tab) this.tab.destroy();
    this.current = key;
    const Cls = (TABS.find((tb) => tb.key === key) ?? TABS[2]).cls;
    this.tab = new Cls(this);
    if (!instant) {
      this.tab.root.setAlpha(0).setY(16);
      this.tweens.add({ targets: this.tab.root, alpha: 1, y: 0, duration: 180, ease: 'Cubic.easeOut' });
    }
    this.drawNav();
  }

  /** Abre una Pokéball con la animación (sale del menú y vuelve a la pestaña indicada). */
  openBallScene(reward: BallReward, back?: TabKey): void {
    kit.goTo(this, 'BallOpen', { reward, back: back || this.current });
  }

  override update(_t: number, delta: number): void {
    this.tickT += delta;
    if (this.tickT > 250) {
      this.tickT = 0;
      Profile.tickSlots();
      this.refreshTop();
      this.drawBadges();
      this.tab?.tick();
    }
    this.tab?.update(delta);
  }
}
