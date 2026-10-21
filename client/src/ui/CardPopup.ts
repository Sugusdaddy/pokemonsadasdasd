import { T, COLORS, RARITIES, ARENAS, MAX_LEVEL, getCard, cardAtLevel, type Card } from '@arena/shared';
import { Profile } from '../meta/Profile';
import type { BaseScene } from '../scenes/BaseScene';
import { Sfx } from '../systems/Sfx';
import { makeCardView } from './CardView';
import { txt, button } from './style';
import { openModal, toast } from './Modal';

const TYPE_ES: Record<string, string> = {
  normal: 'Normal',
  fire: 'Fuego',
  water: 'Agua',
  grass: 'Planta',
  electric: 'Eléctrico',
  psychic: 'Psíquico',
  ice: 'Hielo',
  fighting: 'Lucha',
  poison: 'Veneno',
  ground: 'Tierra',
  flying: 'Volador',
  bug: 'Bicho',
  rock: 'Roca',
  ghost: 'Fantasma',
  dragon: 'Dragón',
  dark: 'Siniestro',
  steel: 'Acero',
  fairy: 'Hada',
};
const SPEED_ES: Record<string, string> = { slow: 'Lenta', medium: 'Media', fast: 'Rápida', veryfast: 'Muy rápida' };
const TARGET_ES: Record<string, string> = { ground: 'Tierra', any: 'Tierra y aire', buildings: 'Torres' };
export const typeEs = (t: string): string => TYPE_ES[t] || t;

type StatRow = [string, string | number, string];

function statRows(c: Card, next: Card | null): StatRow[] {
  const plus = (a: number, b: number | undefined) => (next && b != null && b > a ? `  +${Math.round(b - a)}` : '');
  if (c.type === 'spell') {
    return [
      ['Daño', c.dmg, plus(c.dmg, next?.dmg)],
      ['Daño a torres', Math.round(c.dmg * c.towerDmg), plus(c.dmg * c.towerDmg, next ? next.dmg * next.towerDmg : 0)],
      ['Radio', `${(c.radiusSpell / T).toFixed(1)} casillas`, ''],
      ['Tipo', typeEs(c.moveType), ''],
    ];
  }
  return [
    ['Vida', c.hp, plus(c.hp, next?.hp)],
    ['Daño', c.dmg, plus(c.dmg, next?.dmg)],
    ['Daño por segundo', Math.round(c.dmg / c.hitSpeed), plus(c.dmg / c.hitSpeed, next ? next.dmg / next.hitSpeed : 0)],
    ['Velocidad de ataque', `${c.hitSpeed} s`, ''],
    ['Alcance', c.range <= 1.2 * T ? 'Cuerpo a cuerpo' : `${(c.range / T).toFixed(1)} casillas`, ''],
    ['Velocidad', SPEED_ES[c.speedName] || '—', ''],
    ['Objetivos', TARGET_ES[c.targets], ''],
    ['Tipo de ataque', `${typeEs(c.moveType)}${c.splash ? ' · área' : ''}`, ''],
    ...(c.count > 1 ? [['Cantidad', `x${c.count}`, ''] as StatRow] : []),
    ...(c.flying ? [['Vuela', 'Sí', ''] as StatRow] : []),
  ];
}

/** Ventana de detalle de una carta: estadísticas, mejorar y usar en el mazo. */
export function openCardPopup(
  scene: BaseScene,
  key: string,
  { onUse, onChange }: { onUse?: (key: string) => void; onChange?: () => void } = {},
): void {
  const base = getCard(key);
  const owned = Profile.has(key);
  const rar = RARITIES[base.rarity];
  openModal(scene, 660, 1000, base.name, (box, close) => {
    const level = Profile.level(key);
    const c = cardAtLevel(key, level);
    const canNext = owned && level < MAX_LEVEL;
    const next = canNext ? cardAtLevel(key, level + 1) : null;
    const need = owned ? Profile.cardsNeeded(key) : 0;
    const have = owned ? Profile.d.cards[key].count : 0;
    const view = makeCardView(scene, base, -170, -300, 200, 240, {
      level: owned ? level : null,
      locked: !owned,
      progress: owned ? { have, need } : null,
    });
    box.add(view);
    box.add(txt(scene, 40, -400, rar.label, 30, rar.css, { originX: 0 }));
    box.add(
      txt(
        scene,
        40,
        -360,
        `${typeEs(base.types[0])}${base.types[1] ? ' / ' + typeEs(base.types[1]) : ''}`,
        22,
        '#c9c3ff',
        { originX: 0 },
      ),
    );
    box.add(txt(scene, 40, -310, base.desc, 20, '#ffffff', { originX: 0, wordWrap: { width: 260 }, align: 'left' }));
    if (!owned) {
      box.add(
        txt(scene, 40, -220, `Se consigue en\n${ARENAS[base.arena].name}`, 22, '#ffd84a', {
          originX: 0,
          align: 'left',
        }),
      );
    }

    const rows = statRows(c, Profile.canUpgrade(key) ? next : null);
    let y = -130;
    rows.forEach(([label, value, extra], i) => {
      const g = scene.add.graphics();
      g.fillStyle(i % 2 ? 0x2a2f5c : 0x30366a).fillRoundedRect(-290, y - 22, 580, 44, 8);
      box.add(g);
      box.add(txt(scene, -270, y, label, 22, '#c9c3ff', { originX: 0 }));
      box.add(txt(scene, 270 - (extra ? 90 : 0), y, String(value), 24, '#ffffff', { originX: 1 }));
      if (extra) box.add(txt(scene, 270, y, extra, 22, '#7dff8a', { originX: 1 }));
      y += 48;
    });

    const by = 420;
    if (owned && level < MAX_LEVEL) {
      const gold = Profile.goldNeeded(key);
      const can = Profile.canUpgrade(key);
      const up = button(
        scene,
        onUse ? -150 : 0,
        by,
        280,
        96,
        can ? `Mejorar ${gold}` : `Faltan ${need - have}`,
        can ? COLORS.green : 0x5a5f8a,
        () => {
          const r = Profile.upgrade(key);
          if (r.ok) {
            Sfx.play('upgrade');
            toast(scene, `¡${base.name} sube a nivel ${r.level}!`, '#7dff8a');
            if (r.kingLevelUp) toast(scene, `¡Nivel de rey ${Profile.d.kingLevel}!`, '#ffd84a', 500);
            close();
            onChange?.();
          } else {
            toast(scene, r.reason === 'gold' ? 'Te falta oro' : 'Te faltan cartas', '#ff9a9a');
          }
        },
        26,
        can ? { icon: 'ic_gold' } : {},
      );
      box.add(up);
    } else if (owned) {
      box.add(txt(scene, onUse ? -150 : 0, by, 'Nivel máximo', 28, '#ffd84a'));
    }
    if (onUse && owned) {
      box.add(
        button(
          scene,
          150,
          by,
          260,
          96,
          'Usar',
          COLORS.blue,
          () => {
            close();
            onUse(key);
          },
          32,
        ),
      );
    }
  });
}
