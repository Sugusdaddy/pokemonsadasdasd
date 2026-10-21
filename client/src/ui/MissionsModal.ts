import type Phaser from 'phaser';
import {
  MISSION_BONUS,
  claimableMissions,
  missionDone,
  msToNextMissions,
  type Mission,
  type MissionClaim,
  type MissionKind,
  type MissionPeriod,
  type MissionReward,
} from '@arena/shared';
import { Profile } from '../meta/Profile';
import { Sfx } from '../systems/Sfx';
import { t } from '../i18n';
import * as kit from './kit';
import { fmtTime, fmtNum } from './style';
import { openModal, toast } from './Modal';
import { runAction, type MenuScene } from './tabs/Tab';

// ─────────────────────────────────────────────────────────────
//  MISIONES: ventana con las diarias y las semanales (pestañas), el progreso de cada una,
//  su premio y el premio extra por completar las tres. Todo lo cobra el servidor.
// ─────────────────────────────────────────────────────────────

const ICON: Record<MissionKind, string> = {
  battles: 'ic_battle',
  wins: 'ic_trophy',
  crowns: 'ic_crown',
  threeCrowns: 'ic_crown',
  spells: 'ic_spell',
  units: 'ic_cards',
  elixir: 'ui_drop',
  balls: 'ball_poke',
  upgrades: 'ic_cards',
  goldSpent: 'ic_gold',
};

const W = 640,
  H = 650;

/** Abre la ventana. `onChange` se llama cada vez que se cobra algo (para refrescar el menú). */
export function openMissions(s: MenuScene, onChange: () => void, start: MissionPeriod = 'daily'): void {
  if (s.modalOpen) return;
  let period: MissionPeriod =
    start === 'daily' &&
    !claimableMissions(Profile.d.missions, 'daily') &&
    claimableMissions(Profile.d.missions, 'weekly')
      ? 'weekly'
      : start;
  openModal(s, W, H, t('missions.title'), (box, close) => {
    const content = s.add.container(0, 0);
    box.add(content);
    let timer: Phaser.GameObjects.Text | null = null;
    const tick = s.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () =>
        timer?.setText(t('missions.newIn', { time: fmtTime(msToNextMissions(period, Profile.now()) / 1000) })),
    });
    box.once('destroy', () => tick.remove());

    const claimed = (r: MissionClaim) => {
      onChange();
      if (r.ball) {
        close();
        s.openBallScene(r.ball, 'battle');
        return;
      }
      Sfx.play('coin');
      if (r.gold) toast(s, t('common.plusGold', { n: r.gold }), '#ffd84a');
      if (r.gems) toast(s, t('common.plusGems', { n: r.gems }), '#7dff8a', s.scale.height / 2 + 60);
      if (r.kingLevelUp)
        toast(s, t('result.kingLevel', { n: Profile.d.kingLevel }), '#ffd84a', s.scale.height / 2 - 60);
      render();
    };

    const render = () => {
      content.removeAll(true);
      const board = Profile.d.missions?.[period];

      // pestañas diarias / semanales, con aviso si hay algo por cobrar
      (['daily', 'weekly'] as const).forEach((p, i) => {
        const x = i ? 125 : -125;
        const b = kit.button(
          s,
          x,
          -H / 2 + 62,
          230,
          64,
          t(`missions.${p}`),
          p === period ? 'primary' : 'neutral',
          () => {
            if (period === p) return;
            period = p;
            render();
          },
        );
        content.add(b);
        if (claimableMissions(Profile.d.missions, p)) {
          const dot = s.add.graphics();
          dot.fillStyle(kit.C.ink).fillCircle(x + 104, -H / 2 + 36, 13);
          dot.fillStyle(0xe8303a).fillCircle(x + 104, -H / 2 + 34, 11);
          content.add(dot);
        }
      });
      timer = kit.text(s, 0, -H / 2 + 118, '', 'label', '#aab3e8', { size: 19 });
      content.add(timer);
      tick.callback?.();

      let y = -H / 2 + 148;
      for (const m of board?.list ?? []) {
        row(m, y);
        y += 100;
      }
      if (board)
        bonusRow(
          y + 6,
          board.list.every((m) => m.claimed),
          board.bonusClaimed,
        );
      content.add(
        kit.text(s, 0, H / 2 - 30, t('missions.note'), 'body', '#7480c0', { size: 16, wordWrap: { width: W - 60 } }),
      );
    };

    const rewardIcons = (r: MissionReward, x: number, cy: number) => {
      const parts: Array<[string, number]> = [];
      if (r.gold) parts.push(['ic_gold', r.gold]);
      if (r.gems) parts.push(['ic_gem', r.gems]);
      parts.forEach(([icon, n], i) => {
        const yy = parts.length > 1 ? cy - 15 + i * 30 : cy;
        content.add(s.add.image(x, yy, icon).setDisplaySize(30, 30));
        content.add(kit.text(s, x + 20, yy, `+${fmtNum(n)}`, 'number', '#ffffff', { size: 20, originX: 0 }));
      });
    };

    const status = (x: number, cy: number, done: boolean, claimedAlready: boolean, onClaim: () => void) => {
      if (claimedAlready) {
        content.add(kit.text(s, x, cy, `✓ ${t('missions.claimed')}`, 'label', '#7dff8a', { size: 22 }));
        return;
      }
      const b = kit.button(s, x, cy, 124, 58, t('missions.claim'), 'success', onClaim, { size: 22 });
      b.setDisabled(!done);
      content.add(b);
      if (done)
        s.tweens.add({ targets: b, scale: 1.06, yoyo: true, repeat: -1, duration: 520, ease: 'Sine.easeInOut' });
    };

    const row = (m: Mission, y: number) => {
      const cy = y + 44;
      const done = missionDone(m);
      content.add(kit.panel(s, -W / 2 + 20, y, W - 40, 88, done && !m.claimed ? 'green' : 'dark'));
      const ic = s.add.image(-W / 2 + 62, cy, ICON[m.kind]).setDisplaySize(52, 52);
      content.add(ic);
      const title = kit.text(
        s,
        -W / 2 + 98,
        cy - 20,
        t(`missions.kind.${m.kind}`, { n: fmtNum(m.target) }),
        'label',
        '#ffffff',
        {
          size: 21,
          originX: 0,
        },
      );
      if (title.width > 300) title.setScale(300 / title.width);
      content.add(title);
      const bar = kit.progressBar(s, -W / 2 + 98, cy + 2, 240, 28, done ? 0x44d17a : kit.C.gold, m.progress / m.target);
      bar.set(m.progress / m.target, `${fmtNum(m.progress)}/${fmtNum(m.target)}`);
      content.add(bar.root);
      if (m.claimed) [ic, title, bar.root].forEach((o) => o.setAlpha(0.55));
      rewardIcons(m.reward, 72, cy);
      status(
        W / 2 - 92,
        cy,
        done,
        m.claimed,
        () => void runAction(s, `mission:${m.id}`, () => Profile.claimMission(period, m.id), claimed),
      );
    };

    const bonusRow = (y: number, ready: boolean, done: boolean) => {
      const cy = y + 46;
      const r = MISSION_BONUS[period];
      content.add(kit.panel(s, -W / 2 + 20, y, W - 40, 92, ready && !done ? 'gold' : 'light'));
      if (r.ball) content.add(s.add.image(-W / 2 + 62, cy, `ball_${r.ball}`).setDisplaySize(60, 60));
      const title = kit.text(s, -W / 2 + 98, cy, t('missions.bonus'), 'label', '#ffffff', { size: 21, originX: 0 });
      if (title.width > 250) title.setScale(250 / title.width);
      content.add(title);
      rewardIcons(r, 72, cy);
      status(
        W / 2 - 92,
        cy,
        ready,
        done,
        () => void runAction(s, `mission-bonus:${period}`, () => Profile.claimMissionBonus(period), claimed),
      );
    };

    render();
  });
}
