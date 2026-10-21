import {
  CHALLENGE_MAX_LOSSES,
  CHALLENGE_MAX_WINS,
  CHALLENGE_REWARDS,
  challengeOfDay,
  msToNextChallenge,
} from '@arena/shared';
import { Profile } from '../meta/Profile';
import { t } from '../i18n';
import * as kit from './kit';
import { fmtTime } from './style';
import { openModal } from './Modal';
import { runAction, type MenuScene } from './tabs/Tab';
import { openTournaments } from './TournamentsModal';

// ─────────────────────────────────────────────────────────────
//  MODOS DE JUEGO (botón "Modos" de la pestaña Batalla): draft, desafío del día,
//  torneos y amistosa. Todos gratis y, salvo la amistosa, con niveles iguales.
// ─────────────────────────────────────────────────────────────

const W = 660,
  H = 860;

export function openModes(s: MenuScene, onFriendly: () => void): void {
  if (s.modalOpen) return;
  openModal(s, W, H, t('modes.title'), (box, close) => {
    const row = (
      y: number,
      icon: string,
      title: string,
      body: string,
      cta: string,
      variant: kit.ButtonVariant,
      onTap: () => void,
      h = 170,
    ) => {
      box.add(kit.panel(s, -W / 2 + 20, y, W - 40, h, 'dark'));
      box.add(s.add.image(-W / 2 + 76, y + 58, icon).setDisplaySize(68, 68));
      box.add(kit.text(s, -W / 2 + 124, y + 34, title, 'h3', '#ffffff', { size: 26, originX: 0 }));
      box.add(
        kit.text(s, -W / 2 + 124, y + 64, body, 'body', '#aab3e8', {
          size: 18,
          originX: 0,
          originY: 0,
          align: 'left',
          wordWrap: { width: 330 },
        }),
      );
      box.add(kit.button(s, W / 2 - 104, y + 58, 150, 70, cta, variant, onTap, { size: 24 }));
      return y + h + 14;
    };
    const go = (data: object) => {
      close();
      kit.goTo(s, 'Online', data);
    };

    let y = -H / 2 + 34;
    // ── Draft ──
    y = row(y, 'ic_cards', t('modes.draft'), t('modes.draftDesc'), t('modes.play'), 'primary', () =>
      go({ mode: 'draft' }),
    );

    // ── Desafío del día ──
    const now = Profile.now();
    const c = challengeOfDay(now);
    const run = Profile.d.challenge?.period === c.period ? Profile.d.challenge : undefined;
    const status = run?.active
      ? t('modes.challengeRun', { w: run.wins, l: run.losses, maxL: CHALLENGE_MAX_LOSSES })
      : run
        ? t('modes.challengeEnded', { w: run.wins })
        : t('modes.challengeDesc', { max: CHALLENGE_MAX_WINS, maxL: CHALLENGE_MAX_LOSSES });
    const cta = run?.active ? t('modes.continue') : run ? t('modes.again') : t('modes.start');
    const cy = y;
    y = row(
      y,
      'ic_crown',
      `${t('modes.challenge')}: ${t(`rules.${c.rules}`)}`,
      `${t(`rules.${c.rules}.desc`)}\n${status}`,
      cta,
      'success',
      () =>
        void runAction(
          s,
          'challenge:start',
          () => Profile.startChallenge(),
          () => go({ mode: 'challenge' }),
        ),
      230,
    );
    // premios por victorias: los ya cobrados hoy, en dorado
    const paid = run?.paid ?? 0;
    CHALLENGE_REWARDS.forEach((r, i) => {
      const x = -W / 2 + 124 + i * 52,
        yy = cy + 196;
      const g = s.add.graphics();
      g.fillStyle(kit.C.ink).fillCircle(x, yy, 19);
      g.fillStyle(paid >= r.wins ? kit.C.gold : 0x2f3a86).fillCircle(x, yy, 16);
      box.add(g);
      box.add(kit.text(s, x, yy, String(r.wins), 'label', paid >= r.wins ? '#3a2600' : '#ffffff', { size: 16 }));
    });
    box.add(
      kit.text(
        s,
        W / 2 - 104,
        cy + 196,
        t('modes.changesIn', { time: fmtTime(msToNextChallenge(now) / 1000) }),
        'small',
        '#7480c0',
        {
          size: 15,
        },
      ),
    );

    // ── Torneos ──
    y = row(y, 'ic_trophy', t('modes.tournaments'), t('modes.tournamentsDesc'), t('modes.open'), 'info', () => {
      close();
      s.time.delayedCall(180, () => openTournaments(s));
    });

    // ── Amistosa ──
    row(y, 'ic_social', t('modes.friendly'), t('modes.friendlyDesc'), t('modes.open'), 'neutral', () => {
      close();
      s.time.delayedCall(180, onFriendly);
    });
  });
}
