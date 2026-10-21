import { FRIENDS } from '@arena/shared';
import { Social, type PlayerView } from '../../../net/social';
import { fmtNum } from '../../style';
import * as kit from '../../kit';
import { toast } from '../../Modal';
import { textPrompt } from '../../textPrompt';
import { t } from '../../../i18n';
import { Sfx } from '../../../systems/Sfx';
import type { ScrollPanel } from '../../ScrollPanel';
import { L } from '../../../layout';
import { runAction, sectionHeader, type Area, type Tab } from '../Tab';
import { confirm, onlineDot, panelButton } from './common';

const ROW = 84;

/**
 * Amigos: tu código, añadir por código, solicitudes, invitaciones a amistosas
 * y la lista con quién está conectado (con botón para retarle).
 */
export class FriendsView {
  constructor(
    readonly tab: Tab,
    readonly A: Area,
  ) {
    const s = Social.summary;
    if (L.pc) {
      const gap = 32;
      const right = Math.min(520, Math.round(A.w * 0.38));
      const left = A.w - right - gap;
      const P = tab.scroll(A.x, A.y, left, A.h);
      P.setContentHeight(this.buildList(P, 0, left) + 20);
      const R = tab.scroll(A.x + left + gap, A.y, right, A.h);
      let y = this.buildCode(R, 0, right);
      y = this.buildRequests(R, y, right);
      R.setContentHeight(y + 20);
    } else {
      const P = tab.scroll(A.x, A.y, A.w, A.h);
      let y = this.buildCode(P, 0, A.w);
      y = this.buildRequests(P, y, A.w);
      y = this.buildList(P, y, A.w);
      P.setContentHeight(y + 20);
    }
    if (!s) void Social.refresh();
  }

  tick(): void {}

  destroy(): void {}

  get scene() {
    return this.tab.scene;
  }

  /** Tu código y el botón de añadir. */
  buildCode(P: ScrollPanel, y0: number, W: number): number {
    const s = this.scene;
    const pad = L.pc ? 0 : 20;
    const w = W - pad * 2;
    const y = y0 + 16;
    const code = Social.summary?.code ?? '········';
    P.add(kit.panel(s, pad, y, w, 196, 'blue'));
    P.add(kit.text(s, pad + w / 2, y + 34, t('friends.yourCode'), 'label', '#dfe4ff', { size: 20 }));
    P.add(kit.panel(s, pad + w / 2 - 150, y + 58, 300, 64, 'inset'));
    P.add(kit.text(s, pad + w / 2, y + 90, code, 'h2', '#ffd75a', { size: 36 }).setLetterSpacing(4));
    const bw = Math.min(200, (w - 60) / 2);
    panelButton(P, pad + w / 2 - bw / 2 - 10, y + 156, bw, 56, t('friends.copy'), 'neutral', () => this.copy(code));
    panelButton(P, pad + w / 2 + bw / 2 + 10, y + 156, bw, 56, t('friends.add'), 'success', () => void this.add());
    return y + 216;
  }

  copy(code: string): void {
    void navigator.clipboard?.writeText(code).then(
      () => toast(this.scene, t('friends.copied'), '#7dff8a'),
      () => toast(this.scene, code),
    );
  }

  async add(): Promise<void> {
    const code = await textPrompt(t('friends.addTitle'), { maxLength: 12, upper: true, placeholder: 'ABCD2345' });
    if (!code) return;
    void runAction(
      this.scene,
      'friend-add',
      () => Social.addFriend(code),
      (r) => {
        Sfx.play('coin');
        toast(this.scene, r.status === 'accepted' ? t('friends.nowFriends') : t('friends.sent'), '#7dff8a');
      },
    );
  }

  /** Invitaciones a amistosas y solicitudes de amistad recibidas y enviadas. */
  buildRequests(P: ScrollPanel, y0: number, W: number): number {
    const s = this.scene;
    const pad = L.pc ? 0 : 20;
    const w = W - pad * 2;
    const sum = Social.summary;
    let y = y0;
    if (!sum) return y;

    for (const inv of sum.invites) {
      y += 10;
      P.add(kit.panel(s, pad, y, w, 96, 'green'));
      P.add(
        kit.text(s, pad + 24, y + 30, t('friends.inviteFrom', { name: inv.from.name }), 'h3', '#ffffff', {
          originX: 0,
          size: 21,
        }),
      );
      P.add(kit.text(s, pad + 24, y + 64, t('friends.inviteHint'), 'body', '#e6ffe9', { originX: 0, size: 16 }));
      panelButton(P, pad + w - 160, y + 48, 120, 52, t('friends.join'), 'primary', () =>
        this.joinInvite(inv.code, inv.id),
      );
      panelButton(P, pad + w - 54, y + 48, 52, 52, 'X', 'danger', () => void Social.dismissInvite(inv.id));
      y += 100;
    }

    if (sum.incoming.length) {
      y += 24;
      sectionHeader(s, pad, y, w, t('friends.requests'), String(sum.incoming.length)).forEach((o) => P.add(o));
      y += 44;
      for (const p of sum.incoming) {
        this.personRow(P, pad, y, w, p, 'light');
        panelButton(
          P,
          pad + w - 190,
          y + 38,
          110,
          50,
          t('friends.accept'),
          'success',
          () =>
            void runAction(
              s,
              `acc:${p.accountId}`,
              () => Social.accept(p.accountId),
              () => Sfx.play('coin'),
            ),
        );
        panelButton(
          P,
          pad + w - 64,
          y + 38,
          110,
          50,
          t('friends.decline'),
          'neutral',
          () => void runAction(s, `dec:${p.accountId}`, () => Social.removeFriend(p.accountId)),
        );
        y += ROW;
      }
    }

    if (sum.outgoing.length) {
      y += 24;
      sectionHeader(s, pad, y, w, t('friends.sentTitle')).forEach((o) => P.add(o));
      y += 44;
      for (const p of sum.outgoing) {
        this.personRow(P, pad, y, w, p, 'dark');
        P.add(kit.text(s, pad + w - 170, y + 38, t('friends.pending'), 'label', '#7480c0', { size: 17 }));
        panelButton(
          P,
          pad + w - 54,
          y + 38,
          52,
          50,
          'X',
          'neutral',
          () => void runAction(s, `can:${p.accountId}`, () => Social.removeFriend(p.accountId)),
        );
        y += ROW;
      }
    }
    return y;
  }

  joinInvite(code: string, id: string): void {
    void Social.dismissInvite(id);
    kit.goTo(this.scene, 'Online', { mode: 'join', code });
  }

  /** Lista de amigos: conectados primero. */
  buildList(P: ScrollPanel, y0: number, W: number): number {
    const s = this.scene;
    const pad = L.pc ? 0 : 20;
    const w = W - pad * 2;
    const sum = Social.summary;
    let y = y0 + 24;
    const online = sum?.friends.filter((f) => f.online).length ?? 0;
    sectionHeader(
      s,
      pad,
      y,
      w,
      t('friends.title'),
      sum ? t('friends.count', { n: sum.friends.length, max: FRIENDS.max, online }) : '',
    ).forEach((o) => P.add(o));
    y += 48;
    if (!sum) {
      P.add(kit.text(s, pad + w / 2, y + 50, t('social.loading'), 'body', '#aab3e8', { size: 22 }));
      return y + 100;
    }
    if (!sum.friends.length) {
      P.add(kit.panel(s, pad, y, w, 120, 'inset'));
      P.add(
        kit.text(s, pad + w / 2, y + 60, t('friends.none'), 'body', '#aab3e8', {
          size: 20,
          wordWrap: { width: w - 60 },
        }),
      );
      return y + 130;
    }
    for (const p of sum.friends) {
      this.personRow(P, pad, y, w, p, p.online ? 'card' : 'dark');
      if (p.online)
        panelButton(P, pad + w - 190, y + 38, 120, 50, t('friends.battle'), 'primary', () => this.challenge(p), {
          icon: 'ic_battle',
        });
      panelButton(P, pad + w - 54, y + 38, 52, 50, 'X', 'neutral', () =>
        confirm(
          s,
          t('friends.removeTitle'),
          t('friends.removeBody', { name: p.name }),
          t('friends.remove'),
          () => void runAction(s, `rm:${p.accountId}`, () => Social.removeFriend(p.accountId)),
        ),
      );
      y += ROW;
    }
    return y;
  }

  /** Crea una sala amistosa y le manda el código al amigo. */
  challenge(p: PlayerView): void {
    kit.goTo(this.scene, 'Online', { mode: 'create', inviteTo: { accountId: p.accountId, name: p.name } });
  }

  personRow(P: ScrollPanel, x: number, y: number, w: number, p: PlayerView, variant: kit.PanelVariant): void {
    const s = this.scene;
    const cy = y + 38;
    P.add(kit.panel(s, x, y, w, ROW - 8, variant));
    P.add(onlineDot(s, x + 28, cy, p.online));
    P.add(kit.text(s, x + 50, cy - (p.wallet ? 10 : 0), p.name, 'h3', '#ffffff', { originX: 0, size: 22 }));
    if (p.wallet) P.add(kit.text(s, x + 50, cy + 15, p.wallet, 'small', '#7480c0', { originX: 0, size: 14 }));
    const tx = x + Math.min(w - 330, Math.max(260, w * 0.45));
    P.add(s.add.image(tx, cy, 'ic_trophy').setDisplaySize(30, 30));
    P.add(kit.text(s, tx + 20, cy, fmtNum(p.trophies), 'h3', '#ffffff', { originX: 0, size: 20 }));
  }
}
