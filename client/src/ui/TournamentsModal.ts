import type Phaser from 'phaser';
import {
  RULE_SETS,
  TOURNAMENT_DURATIONS,
  TOURNAMENT_MAX_PLAYERS,
  TOURNAMENT_NAME_MAX,
  TOURNAMENT_PRIZES,
  type RuleSet,
  type TournamentDetail,
  type TournamentSummary,
} from '@arena/shared';
import { Profile } from '../meta/Profile';
import { Tournaments } from '../net/tournaments';
import { Sfx } from '../systems/Sfx';
import { t } from '../i18n';
import * as kit from './kit';
import { fmtTime } from './style';
import { openModal, toast } from './Modal';
import { textPrompt } from './textPrompt';
import { errorMessage, runAction, type MenuScene } from './tabs/Tab';

// ─────────────────────────────────────────────────────────────
//  TORNEOS: lista (los míos y los abiertos), crear, entrar con código y la clasificación
//  de cada uno, desde donde se juega y se cobra el premio.
// ─────────────────────────────────────────────────────────────

const W = 680,
  H = 880;

const timeLeft = (endsAt: number): string => {
  const ms = endsAt - Date.now();
  return ms <= 0 ? t('tour.ended') : t('tour.left', { time: fmtTime(ms / 1000) });
};

/** Lista de torneos. */
export function openTournaments(s: MenuScene): void {
  if (s.modalOpen) return;
  openModal(s, W, H, t('tour.title'), (box, close) => {
    const content = s.add.container(0, 0);
    box.add(content);
    box.add(
      kit.button(s, -150, -H / 2 + 60, 270, 74, t('tour.create'), 'success', () => {
        close();
        s.time.delayedCall(180, () => openCreate(s));
      }),
    );
    box.add(
      kit.button(s, 150, -H / 2 + 60, 270, 74, t('tour.joinCode'), 'info', () => {
        void textPrompt(t('tour.codeTitle'), { maxLength: 5, upper: true, placeholder: 'ABCDE' }).then((code) => {
          if (!code) return;
          void runAction(
            s,
            'tour:join',
            () => Tournaments.join(code),
            (d) => {
              close();
              s.time.delayedCall(180, () => openTournament(s, d.id, d));
            },
          );
        });
      }),
    );
    const loading = kit.text(s, 0, 0, t('common.loading'), 'body', '#aab3e8', { size: 22 });
    content.add(loading);

    const section = (title: string, y: number) => {
      content.add(kit.text(s, -W / 2 + 34, y, title, 'h3', '#ffffff', { size: 24, originX: 0 }));
      return y + 34;
    };
    const item = (tr: TournamentSummary, y: number, onTap: () => void, cta?: string) => {
      content.add(kit.panel(s, -W / 2 + 20, y, W - 40, 84, tr.mine ? 'light' : 'dark'));
      content.add(kit.text(s, -W / 2 + 40, y + 26, tr.name, 'label', '#ffffff', { size: 21, originX: 0 }));
      content.add(
        kit.text(
          s,
          -W / 2 + 40,
          y + 58,
          `${t(`rules.${tr.rules}`)} · ${t('tour.players', { n: tr.players, max: tr.maxPlayers })} · ${timeLeft(tr.endsAt)}`,
          'body',
          '#aab3e8',
          { size: 16, originX: 0 },
        ),
      );
      if (cta) content.add(kit.button(s, W / 2 - 96, y + 42, 130, 58, cta, 'success', onTap, { size: 20 }));
      else {
        const z = s.add.zone(0, y + 42, W - 40, 84).setInteractive({ useHandCursor: true });
        z.on('pointerup', () => {
          Sfx.play('click');
          onTap();
        });
        content.add(z);
        content.add(kit.text(s, W / 2 - 50, y + 42, '›', 'h2', '#ffd75a', { size: 40 }));
      }
      return y + 94;
    };

    void Tournaments.list().then(
      ({ mine, open }) => {
        if (!box.active) return;
        loading.destroy();
        let y = -H / 2 + 120;
        y = section(t('tour.mine'), y);
        if (!mine.length) {
          content.add(kit.text(s, 0, y + 24, t('tour.noneMine'), 'body', '#7480c0', { size: 18 }));
          y += 60;
        }
        for (const tr of mine.slice(0, 4))
          y = item(tr, y, () => {
            close();
            s.time.delayedCall(180, () => openTournament(s, tr.id, undefined, tr.name));
          });
        y = section(t('tour.open'), y + 10);
        if (!open.length) content.add(kit.text(s, 0, y + 24, t('tour.noneOpen'), 'body', '#7480c0', { size: 18 }));
        for (const tr of open.slice(0, 5))
          y = item(
            tr,
            y,
            () =>
              void runAction(
                s,
                `tour:join:${tr.id}`,
                () => Tournaments.join(tr.code),
                (d) => {
                  close();
                  s.time.delayedCall(180, () => openTournament(s, d.id, d));
                },
              ),
            t('tour.join'),
          );
      },
      (e: Error) => box.active && loading.setText(errorMessage(e)),
    );
  });
}

/** Clasificación de un torneo, con jugar, compartir el código y cobrar. Se refresca sola. */
export function openTournament(s: MenuScene, id: string, first?: TournamentDetail, name?: string): void {
  if (s.modalOpen) return;
  openModal(s, W, H, first?.name ?? name ?? t('tour.title'), (box, close) => {
    const content = s.add.container(0, 0);
    box.add(content);
    let timer: Phaser.Time.TimerEvent | null = null;
    box.once('destroy', () => timer?.remove());

    const render = (d: TournamentDetail) => {
      content.removeAll(true);
      let y = -H / 2 + 40;
      content.add(
        kit.text(s, 0, y, `${t(`rules.${d.rules}`)} · ${timeLeft(d.endsAt)}`, 'label', '#aab3e8', { size: 20 }),
      );
      y += 40;
      // código para invitar
      content.add(kit.panel(s, -150, y, 300, 70, 'gold'));
      content.add(kit.text(s, 0, y + 34, d.code, 'hero', '#ffffff', { size: 44 }).setLetterSpacing(8));
      content.add(kit.text(s, 0, y + 90, t('tour.shareCode'), 'small', '#7480c0', { size: 16 }));
      y += 120;
      // clasificación (los 10 primeros y tú)
      const rows = d.standings.slice(0, 10);
      const meRow = d.standings.find((p) => p.accountId === Profile.accountId);
      if (meRow && !rows.includes(meRow)) rows.push(meRow);
      for (const p of rows) {
        const mine = p.accountId === Profile.accountId;
        content.add(kit.panel(s, -W / 2 + 30, y, W - 60, 44, mine ? 'blue' : 'dark'));
        const medal = p.rank <= 3 && d.hasPrizes ? ['#ffd75a', '#dfe4ff', '#e0a060'][p.rank - 1] : '#ffffff';
        content.add(kit.text(s, -W / 2 + 64, y + 22, `#${p.rank}`, 'label', medal, { size: 20 }));
        content.add(kit.text(s, -W / 2 + 110, y + 22, p.name, 'label', '#ffffff', { size: 19, originX: 0 }));
        content.add(
          kit.text(
            s,
            W / 2 - 50,
            y + 22,
            t('tour.record', { w: p.wins, l: p.losses, c: p.crowns }),
            'body',
            '#aab3e8',
            {
              size: 17,
              originX: 1,
            },
          ),
        );
        y += 50;
      }
      const bottom = H / 2 - 70;
      content.add(
        kit.text(
          s,
          0,
          bottom - 74,
          d.hasPrizes
            ? t('tour.prizes', { a: TOURNAMENT_PRIZES[0], b: TOURNAMENT_PRIZES[1], c: TOURNAMENT_PRIZES[2] })
            : t('tour.prizesNeed'),
          'body',
          '#7480c0',
          { size: 16, wordWrap: { width: W - 80 } },
        ),
      );
      if (!d.ended && d.me) {
        content.add(
          kit.button(
            s,
            0,
            bottom,
            340,
            86,
            t('tour.play'),
            'primary',
            () => {
              close();
              kit.goTo(s, 'Online', { mode: 'tournament', tournamentId: d.id, name: d.name });
            },
            { size: 34 },
          ),
        );
      } else if (!d.ended && !d.me && d.players < d.maxPlayers) {
        content.add(
          kit.button(
            s,
            0,
            bottom,
            340,
            86,
            t('tour.join'),
            'success',
            () => void runAction(s, `tour:join:${d.id}`, () => Tournaments.join(d.code), render),
          ),
        );
      } else if (d.ended && d.me && d.me.rank <= 3 && d.hasPrizes && !d.me.prizeClaimed) {
        content.add(
          kit.button(
            s,
            0,
            bottom,
            340,
            86,
            t('tour.claim'),
            'success',
            () =>
              void runAction(
                s,
                `tour:claim:${d.id}`,
                () => Tournaments.claim(d.id),
                (gold) => {
                  Sfx.play('coin');
                  toast(s, t('common.plusGold', { n: gold }), '#ffd84a');
                  void Tournaments.get(id).then((x) => box.active && render(x));
                },
              ),
          ),
        );
      }
    };

    const refresh = () =>
      void Tournaments.get(id).then(
        (d) => box.active && render(d),
        (e: Error) => box.active && toast(s, errorMessage(e), '#ff9a9a'),
      );
    if (first) render(first);
    refresh();
    timer = s.time.addEvent({ delay: 5000, loop: true, callback: refresh });
  });
}

/** Crear un torneo: nombre, reglas, duración, plazas y si es público. */
function openCreate(s: MenuScene): void {
  if (s.modalOpen) return;
  const pick = {
    name: t('tour.defaultName', { name: Profile.displayName }).slice(0, TOURNAMENT_NAME_MAX),
    rules: 'classic' as RuleSet,
    minutes: 30 as number,
    maxPlayers: 8 as number,
    isPublic: true,
  };
  openModal(s, W, 820, t('tour.create'), (box, close) => {
    const content = s.add.container(0, 0);
    box.add(content);
    const seg = <V extends string | number | boolean>(
      y: number,
      label: string,
      options: ReadonlyArray<[V, string]>,
      value: V,
      set: (v: V) => void,
    ) => {
      content.add(kit.text(s, -W / 2 + 40, y, label, 'label', '#aab3e8', { size: 19, originX: 0 }));
      const bw = Math.min(150, (W - 80) / options.length - 8);
      options.forEach(([v, text], i) => {
        const x = -W / 2 + 40 + bw / 2 + i * (bw + 8);
        content.add(
          kit.button(
            s,
            x,
            y + 50,
            bw,
            58,
            text,
            v === value ? 'primary' : 'neutral',
            () => {
              set(v);
              render();
            },
            { size: 17 },
          ),
        );
      });
      return y + 104;
    };
    const render = () => {
      content.removeAll(true);
      let y = -410 + 40;
      content.add(kit.text(s, -W / 2 + 40, y, t('tour.name'), 'label', '#aab3e8', { size: 19, originX: 0 }));
      content.add(
        kit.button(
          s,
          0,
          y + 50,
          W - 80,
          62,
          pick.name,
          'neutral',
          () => {
            void textPrompt(t('tour.name'), { maxLength: TOURNAMENT_NAME_MAX, value: pick.name }).then((v) => {
              if (v && v.trim()) pick.name = v.trim();
              if (box.active) render();
            });
          },
          { size: 22 },
        ),
      );
      y += 110;
      y = seg(
        y,
        t('tour.rules'),
        RULE_SETS.map((r) => [r, t(`rules.${r}`)] as [RuleSet, string]),
        pick.rules,
        (v) => (pick.rules = v),
      );
      content.add(kit.text(s, 0, y - 8, t(`rules.${pick.rules}.desc`), 'body', '#7480c0', { size: 16 }));
      y += 24;
      y = seg(
        y,
        t('tour.duration'),
        TOURNAMENT_DURATIONS.map((m) => [m, t('tour.minutes', { n: m })] as [number, string]),
        pick.minutes,
        (v) => (pick.minutes = v),
      );
      y = seg(
        y,
        t('tour.size'),
        TOURNAMENT_MAX_PLAYERS.map((n) => [n, String(n)] as [number, string]),
        pick.maxPlayers,
        (v) => (pick.maxPlayers = v),
      );
      y = seg(
        y,
        t('tour.visibility'),
        [
          [true, t('tour.public')],
          [false, t('tour.private')],
        ] as Array<[boolean, string]>,
        pick.isPublic,
        (v) => (pick.isPublic = v),
      );
      content.add(
        kit.button(
          s,
          0,
          410 - 60,
          360,
          86,
          t('tour.createGo'),
          'success',
          () =>
            void runAction(
              s,
              'tour:create',
              () => Tournaments.create(pick),
              (d) => {
                close();
                s.time.delayedCall(180, () => openTournament(s, d.id, d));
              },
            ),
          { size: 32 },
        ),
      );
    };
    render();
  });
}
