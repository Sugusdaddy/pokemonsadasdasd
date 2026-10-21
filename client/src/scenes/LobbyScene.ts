import type Phaser from 'phaser';
import { W, H, COLORS, ARENAS, KING_XP, type BallReward } from '@arena/shared';
import { Profile } from '../meta/Profile';
import { Music, Sfx } from '../systems/Sfx';
import { txt, levelBadge, fmtNum } from '../ui/style';
import { BattleTab } from '../ui/tabs/BattleTab';
import { CardsTab } from '../ui/tabs/CardsTab';
import { ShopTab } from '../ui/tabs/ShopTab';
import { RoadTab } from '../ui/tabs/RoadTab';
import { ProfileTab } from '../ui/tabs/ProfileTab';
import type { MenuScene, Tab, TabKey } from '../ui/tabs/Tab';
import { BaseScene } from './BaseScene';

export const TOP = 112; // alto de la barra superior
export const NAV_Y = 1136; // inicio de la barra de pestañas

type TabClass = new (scene: MenuScene) => Tab;
const TABS: Array<{ key: TabKey; label: string; icon: string; cls: TabClass }> = [
  { key: 'shop', label: 'Tienda', icon: 'ic_shop', cls: ShopTab },
  { key: 'cards', label: 'Cartas', icon: 'ic_cards', cls: CardsTab },
  { key: 'battle', label: 'Batalla', icon: 'ic_battle', cls: BattleTab },
  { key: 'road', label: 'Camino', icon: 'ic_road', cls: RoadTab },
  { key: 'profile', label: 'Perfil', icon: 'ic_profile', cls: ProfileTab },
];

interface NavItem {
  key: TabKey;
  x: number;
  icon: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
}

/** Menú principal con barra superior, contenido por pestañas y navegación inferior. */
export class LobbyScene extends BaseScene implements MenuScene {
  private tab: Tab | null = null;
  private current: TabKey | null = null;
  private tickT = 0;
  private topG!: Phaser.GameObjects.Graphics;
  private levelBadgeObjs: Array<Phaser.GameObjects.Graphics | Phaser.GameObjects.Text> | null = null;
  private badgeLevel = -1;
  private nameT!: Phaser.GameObjects.Text;
  private xpT!: Phaser.GameObjects.Text;
  private goldT!: Phaser.GameObjects.Text;
  private gemT!: Phaser.GameObjects.Text;
  private navG!: Phaser.GameObjects.Graphics;
  private navItems: NavItem[] = [];
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
    Profile.tickSlots();
    Music.play('lobby');
    this.drawBackground();
    this.buildTopBar();
    this.buildNav();
    this.showTab(data?.tab || 'battle', true);
    this.input.on('pointerdown', () => Sfx.unlock());
    (window as unknown as { __lobby: LobbyScene }).__lobby = this;
  }

  drawBackground(): void {
    const ar = ARENAS[Profile.arena];
    const g = this.add.graphics();
    g.fillGradientStyle(0x2a3a8f, 0x2a3a8f, 0x0d1024, 0x0d1024, 1).fillRect(0, 0, W, H);
    g.fillStyle(ar.grass[0], 0.08);
    for (let i = 0; i < 18; i++) g.fillCircle((i * 137) % W, (i * 263) % H, 40 + (i % 5) * 20);
  }

  // ───────── Barra superior ─────────
  buildTopBar(): void {
    const g = this.add.graphics().setDepth(100);
    g.fillStyle(COLORS.panelDark, 0.85).fillRect(0, 0, W, TOP);
    g.fillStyle(0x000000, 0.25).fillRect(0, TOP, W, 4);
    this.topG = this.add.graphics().setDepth(101);
    this.nameT = txt(this, 92, 34, '', 24, '#ffffff', { originX: 0 }).setDepth(102);
    this.xpT = txt(this, 186, 74, '', 15, '#ffffff').setDepth(103);
    this.goldT = txt(this, 482, 56, '', 24, '#ffffff', { originX: 1 }).setDepth(103);
    this.gemT = txt(this, 680, 56, '', 24, '#ffffff', { originX: 1 }).setDepth(103);
    this.add.image(392, 56, 'ic_gold').setDisplaySize(44, 44).setDepth(104);
    this.add.image(574, 56, 'ic_gem').setDisplaySize(42, 42).setDepth(104);
    const goShop = this.add.zone(540, 56, 360, 70).setInteractive({ useHandCursor: true }).setDepth(105);
    goShop.on('pointerup', () => {
      if (!this.modalOpen) this.showTab('shop');
    });
    this.refreshTop();
  }

  refreshTop(): void {
    const d = Profile.d;
    const g = this.topG;
    g.clear();
    // pastillas de oro y gemas
    for (const [x, w] of [
      [392, 110],
      [574, 126],
    ]) {
      g.fillStyle(0x000000, 0.45).fillRoundedRect(x, 36, w, 40, 14);
    }
    // XP
    const need = KING_XP[d.kingLevel] || 1;
    g.fillStyle(0x000000, 0.45).fillRoundedRect(92, 62, 190, 24, 10);
    g.fillStyle(0x3a7cff).fillRoundedRect(92, 62, Math.max(12, 190 * Math.min(1, d.xp / need)), 24, 10);
    if (this.badgeLevel !== d.kingLevel) {
      if (this.levelBadgeObjs) this.levelBadgeObjs.forEach((o) => o.destroy());
      this.levelBadgeObjs = levelBadge(this, 48, 56, d.kingLevel, 30);
      this.levelBadgeObjs.forEach((o) => o.setDepth(103));
      this.badgeLevel = d.kingLevel;
    }
    this.nameT.setText(d.name);
    this.xpT.setText(`${d.xp}/${need}`);
    this.goldT.setText(fmtNum(d.gold));
    this.gemT.setText(fmtNum(d.gems));
  }

  // ───────── Navegación inferior ─────────
  buildNav(): void {
    this.navG = this.add.graphics().setDepth(100);
    this.navItems = TABS.map((t, i) => {
      const x = 72 + i * 144;
      const icon = this.add
        .image(x, NAV_Y + 62, t.icon)
        .setDisplaySize(64, 64)
        .setDepth(102);
      const label = txt(this, x, NAV_Y + 118, t.label, 20).setDepth(102);
      const zone = this.add
        .zone(x, NAV_Y + 72, 144, 144)
        .setInteractive({ useHandCursor: true })
        .setDepth(103);
      zone.on('pointerup', () => {
        if (!this.modalOpen) {
          Sfx.play('select');
          this.showTab(t.key);
        }
      });
      return { key: t.key, x, icon, label };
    });
    this.badges = this.add.graphics().setDepth(104);
  }

  drawNav(): void {
    const g = this.navG;
    g.clear();
    g.fillStyle(COLORS.panelDark).fillRect(0, NAV_Y, W, H - NAV_Y);
    g.fillStyle(0x2a2f5c).fillRect(0, NAV_Y + 4, W, H - NAV_Y);
    for (const it of this.navItems) {
      const active = it.key === this.current;
      if (active) {
        g.fillStyle(COLORS.panelDark).fillRoundedRect(it.x - 74, NAV_Y - 14, 148, 162, 16);
        g.fillStyle(0x4a55c8).fillRoundedRect(it.x - 70, NAV_Y - 10, 140, 154, 14);
        g.fillStyle(0xffffff, 0.15).fillRoundedRect(it.x - 64, NAV_Y - 4, 128, 40, 10);
      } else {
        g.fillStyle(0x000000, 0.2).fillRect(it.x + 71, NAV_Y + 12, 2, 112);
      }
      it.icon.setDisplaySize(active ? 80 : 60, active ? 80 : 60).setY(NAV_Y + (active ? 50 : 62));
      it.label.setVisible(active);
    }
    this.drawBadges();
  }

  drawBadges(): void {
    const g = this.badges;
    g.clear();
    const dot = (key: TabKey, on: boolean) => {
      if (!on) return;
      const it = this.navItems.find((i) => i.key === key);
      if (!it) return;
      g.fillStyle(COLORS.panelDark).fillCircle(it.x + 30, NAV_Y + 26, 15);
      g.fillStyle(COLORS.red).fillCircle(it.x + 30, NAV_Y + 24, 13);
    };
    dot(
      'cards',
      Object.keys(Profile.d.cards).some((k) => Profile.canUpgrade(k) && Profile.d.gold >= Profile.goldNeeded(k)),
    );
    dot('road', RoadTab.claimable());
    dot('shop', !Profile.d.shop.freeClaimed || Profile.d.shop.day !== new Date().toDateString());
  }

  showTab(key: TabKey, instant = false): void {
    if (this.current === key && this.tab) return;
    if (this.tab) this.tab.destroy();
    this.current = key;
    const Cls = (TABS.find((t) => t.key === key) ?? TABS[2]).cls;
    this.tab = new Cls(this);
    if (!instant) {
      this.tab.root.setAlpha(0).setY(16);
      this.tweens.add({ targets: this.tab.root, alpha: 1, y: 0, duration: 160, ease: 'Cubic.easeOut' });
    }
    this.drawNav();
  }

  /** Abre una Pokéball con la animación (sale del menú y vuelve a la pestaña indicada). */
  openBallScene(reward: BallReward, back?: TabKey): void {
    this.scene.start('BallOpen', { reward, back: back || this.current });
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
