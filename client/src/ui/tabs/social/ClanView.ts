import type Phaser from 'phaser';
import {
  CLAN,
  DONATION,
  MAX_LEVEL,
  canEdit,
  canKick,
  canSetRole,
  liveCard,
  nextRole,
  prevRole,
  type ClanChatMessage,
  type ClanInput,
  type ClanRole,
  type ClanType,
} from '@arena/shared';
import { Profile } from '../../../meta/Profile';
import type { ClanChat } from '../../../net/social';
import { Social, type ClanView as ClanInfo, type MemberView } from '../../../net/social';
import { fmtNum, fmtTime } from '../../style';
import * as kit from '../../kit';
import { openModal, toast } from '../../Modal';
import { textPrompt } from '../../textPrompt';
import { cardName, t } from '../../../i18n';
import { Sfx } from '../../../systems/Sfx';
import type { ScrollPanel } from '../../ScrollPanel';
import { makeCardView } from '../../CardView';
import { L } from '../../../layout';
import { errorMessage, runAction, sectionHeader, type Area, type Tab } from '../Tab';
import { clanBadge, confirm, msgTime, onlineDot, panelButton, roleLabel } from './common';

const INPUT_H = 76;

/** Lo que se conserva entre redibujados (la pestaña rehace la vista entera). */
const st = {
  clanId: '',
  members: null as MemberView[] | null,
  search: null as ClanInfo[] | null,
  query: '',
  /** Móvil: se ve la lista de miembros en vez del chat. */
  showMembers: false,
};

/** Texto de un aviso del sistema guardado como JSON {k, ...parámetros}. */
function systemText(body: string): string {
  try {
    const { k, ...p } = JSON.parse(body) as { k: string } & Record<string, string | number>;
    if (typeof p.role === 'string') p.role = roleLabel(p.role as ClanRole);
    return t(k, p);
  } catch {
    return body;
  }
}

/**
 * Clan. Sin clan: buscar, unirse o crear uno. Con clan: chat en vivo con peticiones y
 * donaciones de cartas, datos del clan y miembros (con ascender, degradar y expulsar).
 */
export class ClanView {
  private chatPanel: ScrollPanel | null = null;
  private chatArea: Area | null = null;
  private alive = true;

  constructor(
    readonly tab: Tab,
    readonly A: Area,
    /** Chat del clan (lo mantiene la pestaña para que no se corte al redibujar). */
    readonly chat: ClanChat | null,
  ) {
    const clan = Social.summary?.clan;
    if ((clan?.id ?? '') !== st.clanId) {
      st.clanId = clan?.id ?? '';
      st.members = null;
      st.showMembers = false;
    }
    if (!Social.summary) this.loading();
    else if (!clan) this.buildBrowse();
    else this.buildClan();
  }

  get scene() {
    return this.tab.scene;
  }

  private loading(): void {
    const P = this.tab.scroll(this.A.x, this.A.y, this.A.w, this.A.h);
    P.add(kit.text(this.scene, P.w / 2, 120, t('social.loading'), 'body', '#aab3e8', { size: 22 }));
  }

  // ───────────────────────── Sin clan ─────────────────────────

  private buildBrowse(): void {
    const s = this.scene,
      A = this.A;
    const colW = L.pc ? Math.min(1100, A.w) : A.w;
    const P = this.tab.scroll(A.x + Math.round((A.w - colW) / 2), A.y, colW, A.h);
    const pad = L.pc ? 0 : 20;
    const w = colW - pad * 2;
    let y = 16;
    P.add(kit.panel(s, pad, y, w, 170, 'blue'));
    P.add(s.add.image(pad + 64, y + 66, 'ic_social').setDisplaySize(80, 80));
    P.add(kit.text(s, pad + 124, y + 42, t('clan.noneTitle'), 'h2', '#ffffff', { originX: 0, size: 30 }));
    P.add(
      kit.text(s, pad + 124, y + 82, t('clan.noneBody'), 'body', '#dfe4ff', {
        originX: 0,
        size: 18,
        wordWrap: { width: w - 150 },
      }),
    );
    const bw = Math.min(280, (w - 60) / 2);
    panelButton(
      P,
      pad + w / 2 - bw / 2 - 10,
      y + 134,
      bw,
      56,
      t('clan.create', { n: CLAN.createCost }),
      'success',
      () => this.editModal(null),
    );
    panelButton(P, pad + w / 2 + bw / 2 + 10, y + 134, bw, 56, t('clan.search'), 'info', () => void this.doSearch());
    y += 196;

    sectionHeader(s, pad, y + 10, w, st.query ? t('clan.results', { q: st.query }) : t('clan.recommended')).forEach(
      (o) => P.add(o),
    );
    y += 56;
    if (!st.search) {
      void Social.searchClans(st.query).then(
        (c) => {
          st.search = c;
          this.redraw();
        },
        () => {
          st.search = [];
          this.redraw();
        },
      );
      P.add(kit.text(s, pad + w / 2, y + 40, t('social.loading'), 'body', '#aab3e8', { size: 20 }));
      P.setContentHeight(y + 100);
      return;
    }
    if (!st.search.length) {
      P.add(kit.text(s, pad + w / 2, y + 40, t('clan.noResults'), 'body', '#aab3e8', { size: 20 }));
      y += 100;
    }
    for (const c of st.search) {
      const h = 104;
      P.add(kit.panel(s, pad, y, w, h - 8, 'card'));
      P.add(clanBadge(s, pad + 50, y + 48, 64, c.badge));
      P.add(kit.text(s, pad + 96, y + 30, c.name, 'h3', '#ffffff', { originX: 0, size: 23 }));
      if (c.description)
        P.add(
          kit.text(s, pad + 96, y + 60, c.description.slice(0, L.pc ? 70 : 34), 'body', '#aab3e8', {
            originX: 0,
            size: 16,
          }),
        );
      const sx = pad + w - (L.pc ? 420 : 290);
      P.add(
        kit.text(s, sx, y + 30, t('clan.membersN', { n: c.members, max: CLAN.maxMembers }), 'label', '#dfe4ff', {
          size: 17,
        }),
      );
      P.add(s.add.image(sx - 26, y + 64, 'ic_trophy').setDisplaySize(24, 24));
      P.add(kit.text(s, sx - 8, y + 64, fmtNum(c.trophies), 'label', '#ffffff', { originX: 0, size: 17 }));
      const blocked =
        c.type === 'closed'
          ? t('clan.closed')
          : c.members >= CLAN.maxMembers
            ? t('clan.full')
            : Profile.d.trophies < c.minTrophies
              ? t('clan.needs', { n: c.minTrophies })
              : null;
      if (blocked) P.add(kit.text(s, pad + w - 90, y + 48, blocked, 'label', '#ff9a9a', { size: 16 }));
      else
        panelButton(
          P,
          pad + w - 90,
          y + 48,
          140,
          56,
          t('clan.join'),
          'success',
          () =>
            void runAction(
              s,
              'clan-join',
              () => Social.joinClan(c.id),
              () => {
                Sfx.play('coin');
                toast(s, t('clan.welcome', { name: c.name }), '#7dff8a');
              },
            ),
        );
      y += h;
    }
    P.setContentHeight(y + 20);
  }

  private async doSearch(): Promise<void> {
    const q = await textPrompt(t('clan.searchTitle'), {
      maxLength: CLAN.nameMax,
      placeholder: t('clan.searchHint'),
      kind: 'text',
      allowEmpty: true,
    });
    if (q === null) return;
    st.query = q.trim();
    st.search = null;
    this.redraw();
  }

  /** Crear (clan null) o editar el tuyo. */
  editModal(clan: ClanInfo | null): void {
    const s = this.scene;
    const f: ClanInput = clan
      ? {
          name: clan.name,
          description: clan.description,
          badge: clan.badge,
          type: clan.type,
          minTrophies: clan.minTrophies,
        }
      : { name: '', description: '', badge: Math.floor(Math.random() * CLAN.badges), type: 'open', minTrophies: 0 };
    openModal(s, 640, 760, clan ? t('clan.editTitle') : t('clan.createTitle'), (box, close) => {
      const objs: Phaser.GameObjects.GameObject[] = [];
      const draw = () => {
        objs.forEach((o) => o.destroy());
        objs.length = 0;
        const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
          box.add(o);
          objs.push(o);
          return o;
        };
        add(clanBadge(s, 0, -260, 110, f.badge));
        add(
          kit.button(
            s,
            -120,
            -260,
            60,
            56,
            '<',
            'neutral',
            () => ((f.badge = (f.badge + CLAN.badges - 1) % CLAN.badges), draw()),
          ),
        );
        add(kit.button(s, 120, -260, 60, 56, '>', 'neutral', () => ((f.badge = (f.badge + 1) % CLAN.badges), draw())));
        const field = (y: number, label: string, value: string, onTap: () => void) => {
          add(kit.text(s, -270, y - 38, label, 'label', '#aab3e8', { originX: 0, size: 18 }));
          add(kit.panel(s, -270, y - 22, 540, 60, 'inset'));
          add(kit.text(s, -250, y + 8, value || '—', 'h3', value ? '#ffd75a' : '#5a64a8', { originX: 0, size: 22 }));
          const z = add(s.add.zone(0, y + 8, 540, 60).setInteractive({ useHandCursor: true }));
          z.on('pointerup', onTap);
        };
        field(
          -140,
          t('clan.fieldName'),
          f.name,
          () =>
            void textPrompt(t('clan.fieldName'), { maxLength: CLAN.nameMax, kind: 'text', value: f.name }).then((v) => {
              if (v !== null) f.name = v.trim();
              draw();
            }),
        );
        field(
          -30,
          t('clan.fieldDesc'),
          f.description.slice(0, 40),
          () =>
            void textPrompt(t('clan.fieldDesc'), {
              maxLength: CLAN.descMax,
              kind: 'long',
              value: f.description,
              allowEmpty: true,
            }).then((v) => {
              if (v !== null) f.description = v.trim();
              draw();
            }),
        );
        add(kit.text(s, -270, 60, t('clan.fieldType'), 'label', '#aab3e8', { originX: 0, size: 18 }));
        const typeBtn = (x: number, ty: ClanType) =>
          add(
            kit.button(
              s,
              x,
              100,
              250,
              54,
              t(`clan.type.${ty}`),
              f.type === ty ? 'info' : 'dark',
              () => ((f.type = ty), draw()),
              {
                size: 20,
              },
            ),
          );
        typeBtn(-140, 'open');
        typeBtn(140, 'closed');
        add(kit.text(s, -270, 160, t('clan.fieldMin'), 'label', '#aab3e8', { originX: 0, size: 18 }));
        add(
          kit.button(
            s,
            -200,
            204,
            70,
            54,
            '-',
            'neutral',
            () => ((f.minTrophies = Math.max(0, f.minTrophies - 100)), draw()),
          ),
        );
        add(kit.text(s, 0, 204, fmtNum(f.minTrophies), 'h2', '#ffffff', { size: 28 }));
        add(
          kit.button(
            s,
            200,
            204,
            70,
            54,
            '+',
            'neutral',
            () => ((f.minTrophies = Math.min(10_000, f.minTrophies + 100)), draw()),
          ),
        );
        const ok = add(
          kit.button(
            s,
            0,
            310,
            380,
            76,
            clan ? t('clan.save') : t('clan.createBtn', { n: CLAN.createCost }),
            'primary',
            () => {
              void runAction(
                s,
                'clan-edit',
                () => (clan ? Social.editClan(f).then((r) => r.clan) : Social.createClan(f)),
                () => {
                  close();
                  Sfx.play('coin');
                  toast(s, clan ? t('clan.saved') : t('clan.created'), '#7dff8a');
                },
              );
            },
            { icon: clan ? undefined : 'ic_gold' },
          ),
        );
        if (f.name.length < CLAN.nameMin || (!clan && Profile.d.gold < CLAN.createCost)) ok.setDisabled(true);
      };
      draw();
    });
  }

  // ───────────────────────── Con clan ─────────────────────────

  private buildClan(): void {
    const A = this.A;
    const clan = Social.summary!.clan!;
    if (L.pc) {
      const gap = 28;
      const right = Math.min(500, Math.round(A.w * 0.36));
      const left = A.w - right - gap;
      this.chatArea = { x: A.x, y: A.y, w: left, h: A.h - INPUT_H - 10 };
      this.buildInput(A.x, A.y + A.h - INPUT_H, left);
      const R = this.tab.scroll(A.x + left + gap, A.y, right, A.h);
      let y = this.buildInfo(R, 0, right, clan);
      y = this.buildMembers(R, y, right);
      R.setContentHeight(y + 20);
    } else {
      // móvil: datos del clan arriba, chat en medio y la caja de escribir abajo
      const head = 196;
      const R = this.tab.scroll(A.x, A.y, A.w, head);
      this.buildInfo(R, 0, A.w, clan, true);
      if (st.showMembers) {
        const M = this.tab.scroll(A.x + 20, A.y + head + 6, A.w - 40, A.h - head - 6);
        M.setContentHeight(this.buildMembers(M, 0, A.w - 40) + 20);
      } else {
        this.chatArea = { x: A.x, y: A.y + head + 6, w: A.w, h: A.h - head - INPUT_H - 16 };
        this.buildInput(A.x + 20, A.y + A.h - INPUT_H, A.w - 40);
      }
    }
    this.drawChat();
    if (!st.members) void this.loadMembers();
  }

  async loadMembers(): Promise<void> {
    const id = Social.summary?.clan?.id;
    if (!id) return;
    try {
      st.members = (await Social.clan(id)).members;
      if (L.pc || st.showMembers) this.redraw();
    } catch {
      /* se reintenta al volver a la pestaña */
    }
  }

  /** Datos del clan y botones (pedir cartas, miembros, editar, salir). */
  buildInfo(
    P: ScrollPanel,
    y0: number,
    W: number,
    clan: NonNullable<NonNullable<typeof Social.summary>['clan']>,
    compact = false,
  ): number {
    const s = this.scene;
    const pad = L.pc ? 0 : 20;
    const w = W - pad * 2;
    const y = y0 + 12;
    const h = compact ? 176 : 214;
    P.add(kit.panel(s, pad, y, w, h, 'blue'));
    P.add(clanBadge(s, pad + 54, y + 56, compact ? 70 : 84, clan.badge));
    P.add(kit.text(s, pad + 108, y + 34, clan.name, 'h2', '#ffffff', { originX: 0, size: compact ? 26 : 30 }));
    P.add(
      kit.text(
        s,
        pad + 108,
        y + 68,
        `${roleLabel(clan.role)}  ·  ${t('clan.membersN', { n: clan.members, max: CLAN.maxMembers })}`,
        'label',
        '#ffd75a',
        {
          originX: 0,
          size: 17,
        },
      ),
    );
    P.add(s.add.image(pad + 120, y + 98, 'ic_trophy').setDisplaySize(26, 26));
    P.add(kit.text(s, pad + 140, y + 98, fmtNum(clan.trophies), 'label', '#ffffff', { originX: 0, size: 18 }));
    if (!compact && clan.description)
      P.add(
        kit.text(s, pad + 24, y + 132, clan.description, 'body', '#dfe4ff', {
          originX: 0,
          size: 17,
          wordWrap: { width: w - 48 },
        }),
      );
    // botones
    const by = y + h - 40;
    const btns: Array<[string, kit.ButtonVariant, () => void]> = [
      [t('clan.requestBtn'), 'success', () => this.requestModal()],
    ];
    if (!L.pc)
      btns.push([
        st.showMembers ? t('clan.chat') : t('clan.members'),
        'info',
        () => {
          st.showMembers = !st.showMembers;
          this.redraw();
        },
      ]);
    if (canEdit(clan.role)) btns.push([t('clan.edit'), 'neutral', () => this.editModal(clan)]);
    btns.push([t('clan.leave'), 'danger', () => this.leave(clan.name)]);
    const bw = Math.min(170, (w - 24 - (btns.length - 1) * 10) / btns.length);
    btns.forEach(([label, v, fn], i) =>
      panelButton(P, pad + 12 + bw / 2 + i * (bw + 10), by, bw, 50, label, v, fn, { size: 17 }),
    );
    return y + h + 6;
  }

  leave(name: string): void {
    const s = this.scene;
    confirm(
      s,
      t('clan.leaveTitle'),
      t('clan.leaveBody', { name }),
      t('clan.leave'),
      () =>
        void runAction(
          s,
          'clan-leave',
          () => Social.leaveClan(),
          () => toast(s, t('clan.left')),
        ),
    );
  }

  buildMembers(P: ScrollPanel, y0: number, W: number): number {
    const s = this.scene;
    let y = y0 + 20;
    sectionHeader(s, 0, y, W, t('clan.members'), st.members ? String(st.members.length) : '').forEach((o) => P.add(o));
    y += 44;
    if (!st.members) {
      P.add(kit.text(s, W / 2, y + 30, t('social.loading'), 'body', '#aab3e8', { size: 18 }));
      return y + 60;
    }
    st.members.forEach((m, i) => {
      this.memberRow(P, 0, y, W, m, i + 1);
      y += 70;
    });
    return y;
  }

  memberRow(P: ScrollPanel, x: number, y: number, w: number, m: MemberView, pos: number): void {
    const s = this.scene;
    const mine = m.accountId === Profile.accountId;
    const cy = y + 31;
    P.add(kit.panel(s, x, y, w, 62, mine ? 'light' : 'card'));
    P.add(kit.text(s, x + 26, cy, String(pos), 'label', '#7480c0', { size: 16 }));
    P.add(onlineDot(s, x + 52, cy, m.online));
    P.add(kit.text(s, x + 70, cy - 10, m.name, 'h3', '#ffffff', { originX: 0, size: 19 }));
    P.add(
      kit.text(s, x + 70, cy + 13, roleLabel(m.role), 'small', m.role === 'member' ? '#7480c0' : '#ffd75a', {
        originX: 0,
        size: 14,
      }),
    );
    P.add(kit.text(s, x + w - 150, cy, t('clan.donated', { n: m.donations }), 'small', '#aab3e8', { size: 14 }));
    P.add(s.add.image(x + w - 88, cy, 'ic_trophy').setDisplaySize(24, 24));
    P.add(kit.text(s, x + w - 72, cy, fmtNum(m.trophies), 'label', '#ffffff', { originX: 0, size: 17 }));
    if (!mine) P.addTap(x + w / 2, cy, w, 62, () => this.memberModal(m));
  }

  /** Opciones sobre un miembro: ascender, degradar, expulsar, silenciar. */
  memberModal(m: MemberView): void {
    const s = this.scene;
    const me = Social.summary?.clan?.role ?? 'member';
    const up = nextRole(m.role),
      down = prevRole(m.role);
    const actions: Array<[string, kit.ButtonVariant, () => void]> = [];
    if (up && canSetRole(me, m.role, up))
      actions.push([
        up === 'leader' ? t('clan.makeLeader') : t('clan.promote', { role: roleLabel(up) }),
        'success',
        () => this.setRole(m, up),
      ]);
    if (down && canSetRole(me, m.role, down))
      actions.push([t('clan.demote', { role: roleLabel(down) }), 'neutral', () => this.setRole(m, down)]);
    if (canKick(me, m.role))
      actions.push([
        t('clan.kick'),
        'danger',
        () =>
          confirm(
            s,
            t('clan.kick'),
            t('clan.kickBody', { name: m.name }),
            t('clan.kick'),
            () =>
              void runAction(
                s,
                `kick:${m.accountId}`,
                () => Social.kick(m.accountId),
                () => void this.loadMembers(),
              ),
          ),
      ]);
    const blocked = Social.blocked.has(m.accountId);
    actions.push([blocked ? t('chat.unmute') : t('chat.mute'), 'dark', () => Social.toggleBlock(m.accountId)]);
    const h = 260 + actions.length * 80;
    openModal(s, 560, h, m.name, (box, close) => {
      box.add(
        kit.text(s, 0, -h / 2 + 70, `${roleLabel(m.role)}  ·  ${fmtNum(m.trophies)}`, 'label', '#ffd75a', { size: 20 }),
      );
      actions.forEach(([label, v, fn], i) =>
        box.add(
          kit.button(
            s,
            0,
            -h / 2 + 150 + i * 80,
            420,
            64,
            label,
            v,
            () => {
              close();
              fn();
            },
            { size: 21 },
          ),
        ),
      );
    });
  }

  setRole(m: MemberView, role: ClanRole): void {
    const s = this.scene;
    const go = () =>
      void runAction(
        s,
        `role:${m.accountId}`,
        () => Social.setRole(m.accountId, role),
        () => void this.loadMembers(),
      );
    if (role === 'leader')
      confirm(s, t('clan.makeLeader'), t('clan.makeLeaderBody', { name: m.name }), t('common.yes'), go);
    else go();
  }

  /** Elegir carta para pedir (comunes y raras que tienes y no están al máximo). */
  requestModal(): void {
    const s = this.scene;
    const next = Social.summary?.clan?.nextRequestAt ?? 0;
    const wait = next - Profile.now();
    if (wait > 0) {
      toast(s, t('clan.requestWait', { t: fmtTime(Math.ceil(wait / 1000)) }), '#ff9a9a');
      return;
    }
    const keys = Object.keys(Profile.d.cards).filter((k) => {
      const c = liveCard(k);
      return DONATION[c.rarity] && Profile.d.cards[k].level < MAX_LEVEL;
    });
    const cols = 4,
      cw = 132,
      ch = 158;
    const rows = Math.max(1, Math.ceil(keys.length / cols));
    const h = Math.min(L.h - 120, 200 + rows * (ch + 20));
    openModal(s, 660, h, t('clan.requestTitle'), (box, close) => {
      box.add(
        kit.text(s, 0, -h / 2 + 60, t('clan.requestBody'), 'body', '#dfe4ff', { size: 19, wordWrap: { width: 580 } }),
      );
      keys.forEach((k, i) => {
        const x = -((cols - 1) * (cw + 14)) / 2 + (i % cols) * (cw + 14);
        const y = -h / 2 + 120 + ch / 2 + Math.floor(i / cols) * (ch + 20);
        const card = liveCard(k);
        const v = makeCardView(s, card, x, y, cw, ch, { level: Profile.d.cards[k].level, compact: true });
        v.setSize(cw, ch).setInteractive({ useHandCursor: true });
        v.on(
          'pointerup',
          () =>
            void runAction(
              s,
              'clan-request',
              () => Social.requestCards(k),
              (r) => {
                close();
                this.chat?.upsert(r.message);
                Sfx.play('select');
                toast(s, t('clan.requested', { card: cardName(card) }), '#7dff8a');
              },
            ),
        );
        box.add(v);
      });
    });
  }

  // ───────────────────────── Chat ─────────────────────────

  private buildInput(x: number, y: number, w: number): void {
    const s = this.scene;
    const P = this.tab.scroll(x, y, w, INPUT_H);
    const muted = Social.summary?.mutedUntil;
    const placeholder = muted ? t('chat.mutedUntil', { t: msgTime(muted) }) : t('chat.placeholder');
    P.add(kit.panel(s, 0, 6, w - 140, INPUT_H - 12, 'inset'));
    P.add(kit.text(s, 22, INPUT_H / 2, placeholder, 'body', '#5a64a8', { originX: 0, size: 19 }));
    P.addTap((w - 140) / 2, INPUT_H / 2, w - 140, INPUT_H, () => void this.write());
    panelButton(P, w - 64, INPUT_H / 2, 124, 60, t('chat.send'), 'primary', () => void this.write(), {
      disabled: !!muted,
    });
  }

  async write(): Promise<void> {
    if (Social.summary?.mutedUntil) return toast(this.scene, t('err.chat.muted'), '#ff9a9a');
    const text = await textPrompt(t('chat.prompt'), { maxLength: 140, kind: 'text' });
    if (text?.trim()) this.chat?.say(text);
  }

  /** (Re)dibuja solo el chat, manteniéndolo abajo si ya estaba abajo. */
  drawChat(): void {
    const A = this.chatArea;
    if (!A || !this.alive) return;
    const old = this.chatPanel;
    const atBottom = !old || old.scrollY >= old.contentH - old.h - 40;
    const prevY = old?.scrollY ?? 0;
    if (old) {
      this.tab.panels.splice(this.tab.panels.indexOf(old), 1);
      old.destroy();
    }
    const P = this.tab.scroll(A.x, A.y, A.w, A.h);
    this.chatPanel = P;
    const s = this.scene;
    const pad = L.pc ? 0 : 20;
    const w = A.w - pad * 2;
    P.add(kit.panel(s, pad, 0, w, Math.max(A.h, 10), 'dark').setAlpha(0.55));
    let y = 14;
    const chat = this.chat;
    if (!chat || (!chat.messages.length && !chat.error)) {
      P.add(
        kit.text(s, A.w / 2, 80, chat?.connected ? t('chat.empty') : t('chat.connecting'), 'body', '#7480c0', {
          size: 20,
        }),
      );
    } else if (chat.error && !chat.messages.length) {
      P.add(kit.text(s, A.w / 2, 80, t(chat.error), 'body', '#ff9a9a', { size: 20 }));
    }
    for (const m of chat?.messages ?? []) {
      if (m.accountId && Social.blocked.has(m.accountId)) continue;
      y = this.message(P, pad + 14, y, w - 28, m);
    }
    P.setContentHeight(y + 10);
    P.set(atBottom ? P.contentH : prevY);
  }

  private message(P: ScrollPanel, x: number, y: number, w: number, m: ClanChatMessage): number {
    const s = this.scene;
    if (m.kind === 'system') {
      P.add(
        kit.text(s, x + w / 2, y + 16, systemText(m.body), 'small', '#8f9ad8', {
          size: 15,
          wordWrap: { width: w - 40 },
        }),
      );
      return y + 38;
    }
    const mine = m.accountId === Profile.accountId;
    if (m.kind === 'request') return this.request(P, x, y, w, m, mine);
    const bw = Math.min(w - 40, L.pc ? 640 : 560);
    const bx = mine ? x + w - bw : x;
    const body = m.hidden ? t('chat.hidden') : m.body;
    const tx = kit.text(s, bx + 18, y + 40, body, 'body', m.hidden ? '#7480c0' : '#ffffff', {
      originX: 0,
      originY: 0,
      size: 19,
      wordWrap: { width: bw - 36, useAdvancedWrap: true },
      align: 'left',
      fontStyle: m.hidden ? 'italic' : undefined,
    });
    const bh = tx.height + 54;
    P.add(kit.panel(s, bx, y, bw, bh, mine ? 'light' : 'card'));
    P.add(kit.text(s, bx + 18, y + 22, m.name, 'label', mine ? '#ffd75a' : '#9fc4ff', { originX: 0, size: 16 }));
    P.add(kit.text(s, bx + bw - 16, y + 22, msgTime(m.at), 'small', '#7480c0', { originX: 1, size: 13 }));
    P.add(tx);
    if (!mine && !m.hidden && m.accountId) P.addTap(bx + bw / 2, y + bh / 2, bw, bh, () => this.messageModal(m));
    return y + bh + 10;
  }

  /** Petición de cartas: carta, progreso y botón de donar. */
  private request(P: ScrollPanel, x: number, y: number, w: number, m: ClanChatMessage, mine: boolean): number {
    const s = this.scene;
    const card = liveCard(m.card!);
    const h = 148;
    const bw = Math.min(w, L.pc ? 640 : 600);
    const bx = mine ? x + w - bw : x;
    P.add(kit.panel(s, bx, y, bw, h, mine ? 'light' : 'card'));
    P.add(makeCardView(s, card, bx + 62, y + h / 2, 90, 110, { compact: true }));
    P.add(
      kit.text(s, bx + 124, y + 26, t('clan.requestMsg', { name: m.name }), 'label', '#9fc4ff', {
        originX: 0,
        size: 16,
      }),
    );
    P.add(kit.text(s, bx + 124, y + 56, cardName(card), 'h3', '#ffffff', { originX: 0, size: 22 }));
    const barW = bw - 124 - (mine ? 24 : 170);
    const bar = kit.progressBar(
      s,
      bx + 124,
      y + 98,
      barW,
      26,
      kit.C.good,
      m.got / Math.max(1, m.want),
      `${m.got}/${m.want}`,
    );
    P.add(bar.root);
    P.add(kit.text(s, bx + bw - 16, y + 22, msgTime(m.at), 'small', '#7480c0', { originX: 1, size: 13 }));
    if (!mine) {
      const own = Profile.d.cards[m.card!]?.count ?? 0;
      const rule = DONATION[card.rarity];
      const expired = Profile.now() - m.at > CLAN.requestTtlMs;
      const done = m.got >= m.want || expired || (m.donors[Profile.accountId] ?? 0) >= (rule?.perDonor ?? 0);
      panelButton(P, bx + bw - 82, y + 98, 140, 56, t('clan.donate'), 'success', () => this.donate(m), {
        disabled: done || own < 1,
        size: 19,
      });
      if (!done)
        P.add(kit.text(s, bx + bw - 82, y + 58, t('clan.youHave', { n: own }), 'small', '#aab3e8', { size: 13 }));
    }
    return y + h + 10;
  }

  private donate(m: ClanChatMessage): void {
    const s = this.scene;
    void runAction(
      s,
      `donate:${m.id}`,
      () => Social.donate(m.id),
      (r) => {
        this.chat?.upsert(r.message);
        Sfx.play('coin');
        toast(s, t('common.plusGold', { n: r.gold }), '#ffd84a');
        // tu contador de donaciones en la lista de miembros
        if (L.pc) this.membersChanged();
      },
    );
  }

  /** Tocar un mensaje de otro: denunciar o silenciar a su autor. */
  private messageModal(m: ClanChatMessage): void {
    const s = this.scene;
    const blocked = Social.blocked.has(m.accountId!);
    openModal(s, 560, 520, m.name, (box, close) => {
      box.add(
        kit.text(s, 0, -170, `"${m.body.slice(0, 60)}"`, 'body', '#dfe4ff', { size: 19, wordWrap: { width: 480 } }),
      );
      const reasons = ['insult', 'spam', 'cheat'] as const;
      reasons.forEach((r, i) =>
        box.add(
          kit.button(
            s,
            0,
            -80 + i * 74,
            420,
            62,
            t(`chat.report.${r}`),
            'danger',
            () => {
              close();
              void Social.report(m.id, r).then(
                () => toast(s, t('chat.reported'), '#7dff8a'),
                (e) => toast(s, errorMessage(e), '#ff9a9a'),
              );
            },
            { size: 20 },
          ),
        ),
      );
      box.add(
        kit.button(
          s,
          0,
          170,
          420,
          62,
          blocked ? t('chat.unmute') : t('chat.mute'),
          'neutral',
          () => {
            close();
            const now = Social.toggleBlock(m.accountId!);
            toast(s, now ? t('chat.muted', { name: m.name }) : t('chat.unmuted', { name: m.name }));
          },
          { size: 20 },
        ),
      );
    });
  }

  // ───────────────────────── Ciclo de vida ─────────────────────────

  /** Redibuja toda la sección (lo hace la pestaña). */
  private redraw(): void {
    if (this.alive) this.tab.rebuild();
  }

  /** Lo llama la pestaña cuando cambian los miembros o los datos del clan. */
  membersChanged(): void {
    st.members = null;
    void this.loadMembers();
  }

  tick(): void {}

  destroy(): void {
    this.alive = false;
  }
}
