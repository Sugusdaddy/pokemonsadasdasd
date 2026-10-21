import type Phaser from 'phaser';
import {
  IDEAS,
  IDEA_CATEGORIES,
  IDEA_STATUSES,
  type IdeaCategory,
  type IdeaSort,
  type IdeaStatus,
  type IdeaView,
} from '@arena/shared';
import { Admin, Ideas, type IdeaFilter, type IdeaPage } from '../../../net/admin';
import * as kit from '../../kit';
import { openModal, toast } from '../../Modal';
import { textPrompt } from '../../textPrompt';
import { t } from '../../../i18n';
import { Sfx } from '../../../systems/Sfx';
import type { ScrollPanel } from '../../ScrollPanel';
import { L } from '../../../layout';
import { runAction, type Area, type Tab } from '../Tab';
import { confirm, msgTime, panelButton } from './common';

/** Color de cada estado. */
const STATUS_PANEL: Record<IdeaStatus, kit.PanelVariant> = {
  open: 'blue',
  planned: 'gold',
  done: 'green',
  rejected: 'red',
};

/** Lo que se conserva entre redibujados (uno para jugadores y otro para el panel de admin). */
interface IdeasState {
  sort: IdeaSort;
  filter: IdeaFilter;
  page: IdeaPage | null;
  loading: boolean;
  failed: boolean;
  /** La vista que se está viendo (la que se redibuja al terminar una carga). */
  view: IdeasView | null;
}
const states: Record<'player' | 'admin', IdeasState> = {
  player: { sort: 'top', filter: 'open', page: null, loading: false, failed: false, view: null },
  admin: { sort: 'new', filter: 'all', page: null, loading: false, failed: false, view: null },
};

/**
 * Buzón de ideas: proponer, votar (un voto por idea, se puede quitar) y ver qué
 * ha respondido el equipo. En modo admin también se cambia el estado, se responde,
 * se oculta y se borra.
 */
export class IdeasView {
  private st: IdeasState;
  private alive = true;

  constructor(
    readonly tab: Tab,
    readonly A: Area,
    readonly admin = false,
  ) {
    this.st = states[admin ? 'admin' : 'player'];
    this.st.view = this;
    const colW = L.pc ? Math.min(1100, A.w) : A.w;
    const P = tab.scroll(A.x + Math.round((A.w - colW) / 2), A.y, colW, A.h);
    P.setContentHeight(this.build(P, colW) + 30);
    if (!this.st.page && !this.st.loading) void this.load();
  }

  get scene() {
    return this.tab.scene;
  }

  /** Carga la primera página (o la siguiente con `more`). */
  async load(more = false): Promise<void> {
    const st = this.st;
    st.loading = true;
    try {
      const page = await Ideas.list(st.sort, st.filter, more && st.page ? st.page.ideas.length : 0);
      st.page = more && st.page ? { ...page, ideas: [...st.page.ideas, ...page.ideas] } : page;
      st.failed = false;
    } catch {
      st.failed = true;
    }
    st.loading = false;
    // la vista puede haberse rehecho mientras cargaba: se redibuja la que esté a la vista
    st.view?.redraw();
  }

  redraw(): void {
    if (this.alive) this.tab.rebuild();
  }

  private build(P: ScrollPanel, W: number): number {
    const s = this.scene;
    const pad = L.pc ? 0 : 20;
    const w = W - pad * 2;
    const st = this.st;
    let y = 14;

    // cabecera
    if (!this.admin) {
      const hh = L.pc ? 130 : 180;
      P.add(kit.panel(s, pad, y, w, hh, 'blue'));
      P.add(s.add.image(pad + 58, y + 62, 'ic_idea').setDisplaySize(76, 76));
      P.add(kit.text(s, pad + 112, y + 36, t('ideas.title'), 'h2', '#ffffff', { originX: 0, size: 30 }));
      P.add(
        kit.text(s, pad + 112, y + 64, t('ideas.subtitle'), 'body', '#dfe4ff', {
          originX: 0,
          originY: 0,
          size: 17,
          wordWrap: { width: L.pc ? w - 420 : w - 130 },
        }),
      );
      const page = st.page;
      const reason = !page
        ? null
        : !page.canPropose
          ? t('ideas.needBattles')
          : page.left === 0
            ? t('ideas.noneLeft')
            : null;
      const bx = L.pc ? pad + w - 150 : pad + w / 2;
      const by = L.pc ? y + 52 : y + 140;
      panelButton(P, bx, by, 260, 60, t('ideas.propose'), 'success', () => this.proposeModal(), {
        disabled: !page || !!reason,
      });
      const hint = reason ?? (page?.left != null ? t('ideas.left', { n: page.left }) : '');
      if (hint && L.pc) P.add(kit.text(s, bx, by + 46, hint, 'small', '#dfe4ff', { size: 14 }));
      y += hh + 16;
    }

    // orden y filtro
    const sorts: IdeaSort[] = ['top', 'new'];
    const filters: IdeaFilter[] = this.admin ? ['all', ...IDEA_STATUSES] : [...IDEA_STATUSES, 'mine'];
    const sw = L.pc ? 130 : 150;
    sorts.forEach((so, i) => {
      panelButton(
        P,
        pad + sw / 2 + i * (sw + 10),
        y + 26,
        sw,
        48,
        t(`ideas.sort.${so}`),
        st.sort === so ? 'info' : 'dark',
        () => this.setSort(so),
        { size: 18 },
      );
    });
    if (st.page) {
      P.add(
        kit.text(s, pad + w, y + 26, t('ideas.count', { n: st.page.total }), 'label', '#aab3e8', {
          originX: 1,
          size: 17,
        }),
      );
    }
    y += 62;
    const fw = (w - (filters.length - 1) * 8) / filters.length;
    filters.forEach((f, i) => {
      panelButton(
        P,
        pad + fw / 2 + i * (fw + 8),
        y + 24,
        fw,
        46,
        t(`ideas.filter.${f}`),
        st.filter === f ? 'primary' : 'dark',
        () => this.setFilter(f),
        { size: L.pc ? 17 : 15 },
      );
    });
    y += 64;

    // lista
    if (!st.page) {
      const msg = st.failed ? t('social.offline') : t('social.loading');
      P.add(kit.text(s, pad + w / 2, y + 50, msg, 'body', '#aab3e8', { size: 20 }));
      return y + 100;
    }
    if (!st.page.ideas.length) {
      P.add(kit.panel(s, pad, y, w, 110, 'inset'));
      P.add(kit.text(s, pad + w / 2, y + 55, t('ideas.empty'), 'body', '#aab3e8', { size: 19 }));
      return y + 120;
    }
    for (const idea of st.page.ideas) y = this.card(P, pad, y, w, idea);
    if (st.page.ideas.length < st.page.total) {
      panelButton(P, pad + w / 2, y + 34, 260, 56, t('ideas.more'), 'neutral', () => void this.load(true), {
        disabled: st.loading,
      });
      y += 80;
    }
    return y;
  }

  /** Tarjeta de una idea: votos a la izquierda; título, texto, datos y respuesta del equipo. */
  private card(P: ScrollPanel, x: number, y: number, w: number, idea: IdeaView): number {
    const s = this.scene;
    const cx = x + 112;
    const cw = w - 112 - 20;
    const objs: Phaser.GameObjects.GameObject[] = [];
    const title = kit.text(s, cx, y + 22, idea.title, 'h3', '#ffffff', {
      originX: 0,
      originY: 0,
      size: 22,
      wordWrap: { width: cw - (idea.status !== 'open' ? 140 : 0), useAdvancedWrap: true },
      align: 'left',
    });
    objs.push(title);
    let ty = y + 22 + title.height + 6;
    if (idea.body) {
      const body = kit.text(s, cx, ty, idea.body, 'body', '#dfe4ff', {
        originX: 0,
        originY: 0,
        size: 17,
        wordWrap: { width: cw, useAdvancedWrap: true },
        align: 'left',
      });
      objs.push(body);
      ty += body.height + 8;
    }
    const meta = kit.text(
      s,
      cx,
      ty,
      `${t(`ideas.cat.${idea.category}`)}  ·  ${t('ideas.by', { name: idea.name })}  ·  ${msgTime(idea.at)}`,
      'small',
      '#8f9ad8',
      { originX: 0, originY: 0, size: 14 },
    );
    objs.push(meta);
    ty += meta.height + 10;
    let replyH = 0;
    let reply: Phaser.GameObjects.Text | null = null;
    if (idea.reply) {
      reply = kit.text(s, cx + 16, ty + 30, idea.reply, 'body', '#ffffff', {
        originX: 0,
        originY: 0,
        size: 16,
        wordWrap: { width: cw - 32, useAdvancedWrap: true },
        align: 'left',
      });
      replyH = reply.height + 44;
    }
    const h = Math.max(116, ty - y + replyH + 12);

    P.add(kit.panel(s, x, y, w, h, idea.hidden ? 'dark' : idea.mine ? 'light' : 'card'));
    // votos
    const open = idea.status === 'open';
    const canVote = open && !idea.mine && !idea.hidden;
    const vy = y + Math.min(h / 2, 58);
    P.add(kit.panel(s, x + 14, vy - 44, 84, 88, idea.voted ? 'gold' : 'inset'));
    const g = s.add.graphics();
    g.fillStyle(idea.voted ? 0xffffff : canVote ? 0xffd75a : 0x5a64a8);
    g.fillTriangle(x + 56, vy - 30, x + 40, vy - 10, x + 72, vy - 10);
    P.add(g);
    P.add(kit.text(s, x + 56, vy + 18, String(idea.votes), 'h3', idea.voted ? '#ffffff' : '#dfe4ff', { size: 24 }));
    if (canVote) P.addTap(x + 56, vy, 84, 88, () => this.vote(idea));
    // estado
    if (!open) {
      const sp = kit.panel(s, x + w - 150, y + 14, 134, 36, STATUS_PANEL[idea.status]);
      P.add(sp);
      P.add(kit.text(s, x + w - 83, y + 32, t(`ideas.status.${idea.status}`), 'label', '#ffffff', { size: 15 }));
    }
    if (idea.hidden)
      P.add(kit.text(s, x + w - 20, y + h - 20, t('ideas.hidden'), 'small', '#ff9a9a', { originX: 1, size: 14 }));
    objs.forEach((o) => P.add(o));
    if (reply) {
      P.add(kit.panel(s, cx, ty, cw, replyH - 8, 'inset'));
      P.add(kit.text(s, cx + 16, ty + 16, t('ideas.teamReply'), 'label', '#ffd75a', { originX: 0, size: 14 }));
      P.add(reply);
    }
    // tocar la idea: opciones (borrar la tuya; moderar si eres admin)
    if (this.admin) P.addTap(x + 112 + cw / 2, y + h / 2, cw, h, () => this.adminModal(idea));
    else if (idea.mine && open) P.addTap(x + 112 + cw / 2, y + h / 2, cw, h, () => this.deleteOwn(idea));
    return y + h + 12;
  }

  private setSort(so: IdeaSort): void {
    if (this.st.sort === so) return;
    this.st.sort = so;
    this.st.page = null;
    this.redraw();
    void this.load();
  }

  private setFilter(f: IdeaFilter): void {
    if (this.st.filter === f) return;
    this.st.filter = f;
    this.st.page = null;
    this.redraw();
    void this.load();
  }

  /** Cambia una idea en la lista sin recargarla. */
  private patch(id: string, p: Partial<IdeaView>): void {
    const page = this.st.page;
    if (!page) return;
    page.ideas = page.ideas.map((i) => (i.id === id ? { ...i, ...p } : i));
    this.st.view?.redraw();
  }

  private vote(idea: IdeaView): void {
    void runAction(
      this.scene,
      `vote:${idea.id}`,
      () => Ideas.vote(idea.id),
      (r) => {
        Sfx.play(r.voted ? 'select' : 'click');
        this.patch(idea.id, r);
      },
    );
  }

  private deleteOwn(idea: IdeaView): void {
    const s = this.scene;
    confirm(
      s,
      t('ideas.deleteTitle'),
      t('ideas.deleteBody', { title: idea.title }),
      t('ideas.delete'),
      () =>
        void runAction(
          s,
          `del:${idea.id}`,
          () => Ideas.remove(idea.id),
          () => void this.load(),
        ),
    );
  }

  /** Proponer una idea: título, texto y categoría. */
  proposeModal(): void {
    const s = this.scene;
    const f = { title: '', body: '', category: 'cards' as IdeaCategory };
    openModal(s, 640, 720, t('ideas.propose'), (box, close) => {
      const objs: Phaser.GameObjects.GameObject[] = [];
      const draw = () => {
        objs.forEach((o) => o.destroy());
        objs.length = 0;
        const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
          box.add(o);
          objs.push(o);
          return o;
        };
        const field = (y: number, h: number, label: string, value: string, onTap: () => void) => {
          add(kit.text(s, -270, y - 18, label, 'label', '#aab3e8', { originX: 0, size: 18 }));
          add(kit.panel(s, -270, y, 540, h, 'inset'));
          add(
            kit.text(s, -250, y + 16, value || t('ideas.tapToWrite'), 'body', value ? '#ffffff' : '#5a64a8', {
              originX: 0,
              originY: 0,
              size: 18,
              wordWrap: { width: 500, useAdvancedWrap: true },
              align: 'left',
              maxLines: Math.floor((h - 20) / 24),
            }),
          );
          const z = add(s.add.zone(0, y + h / 2, 540, h).setInteractive({ useHandCursor: true }));
          z.on('pointerup', onTap);
        };
        field(
          -250,
          70,
          t('ideas.fieldTitle', { n: IDEAS.titleMax }),
          f.title,
          () =>
            void textPrompt(t('ideas.fieldTitle', { n: IDEAS.titleMax }), {
              maxLength: IDEAS.titleMax,
              kind: 'text',
              value: f.title,
            }).then((v) => {
              if (v !== null) f.title = v;
              draw();
            }),
        );
        field(
          -130,
          170,
          t('ideas.fieldBody', { n: IDEAS.bodyMax }),
          f.body,
          () =>
            void textPrompt(t('ideas.fieldBody', { n: IDEAS.bodyMax }), {
              maxLength: IDEAS.bodyMax,
              kind: 'long',
              value: f.body,
              allowEmpty: true,
            }).then((v) => {
              if (v !== null) f.body = v;
              draw();
            }),
        );
        add(kit.text(s, -270, 82, t('ideas.fieldCategory'), 'label', '#aab3e8', { originX: 0, size: 18 }));
        IDEA_CATEGORIES.forEach((c, i) => {
          const bw = 102;
          add(
            kit.button(
              s,
              -270 + bw / 2 + i * (bw + 7),
              126,
              bw,
              52,
              t(`ideas.cat.${c}`),
              f.category === c ? 'info' : 'dark',
              () => ((f.category = c), draw()),
              { size: 15 },
            ),
          );
        });
        const ok = add(
          kit.button(s, 0, 260, 360, 76, t('ideas.send'), 'primary', () => {
            void runAction(
              s,
              'idea-propose',
              () => Ideas.propose(f.title, f.body, f.category),
              () => {
                close();
                Sfx.play('coin');
                toast(s, t('ideas.sent'), '#7dff8a');
                this.st.sort = 'new';
                this.st.filter = 'mine';
                this.st.page = null;
                void this.load();
              },
            );
          }),
        );
        if (f.title.length < IDEAS.titleMin) ok.setDisabled(true);
      };
      draw();
    });
  }

  // ───────── Admin ─────────

  private adminModal(idea: IdeaView): void {
    const s = this.scene;
    const upd = (p: { status?: IdeaStatus; reply?: string; hidden?: boolean }) =>
      void runAction(
        s,
        `adm:${idea.id}`,
        () => Admin.updateIdea(idea.id, p),
        (r) => {
          toast(s, t('admin.saved'), '#7dff8a');
          this.patch(idea.id, r.idea);
        },
      );
    openModal(s, 620, 640, t('admin.ideaTitle'), (box, close) => {
      box.add(
        kit.text(s, 0, -230, idea.title, 'h3', '#ffffff', {
          size: 22,
          wordWrap: { width: 540, useAdvancedWrap: true },
        }),
      );
      box.add(kit.text(s, 0, -186, t('ideas.votesN', { n: idea.votes }), 'label', '#ffd75a', { size: 17 }));
      IDEA_STATUSES.forEach((st, i) => {
        box.add(
          kit.button(
            s,
            -201 + i * 134,
            -120,
            126,
            58,
            t(`ideas.status.${st}`),
            idea.status === st ? STATUS_VARIANT[st] : 'dark',
            () => {
              close();
              upd({ status: st });
            },
            { size: 16 },
          ),
        );
      });
      const btn = (y: number, label: string, v: kit.ButtonVariant, fn: () => void) =>
        box.add(kit.button(s, 0, y, 440, 64, label, v, () => (close(), fn()), { size: 20 }));
      btn(
        -30,
        idea.reply ? t('admin.editReply') : t('admin.reply'),
        'info',
        () =>
          void textPrompt(t('admin.reply'), {
            maxLength: IDEAS.replyMax,
            kind: 'long',
            value: idea.reply,
            allowEmpty: true,
          }).then((v) => v !== null && upd({ reply: v })),
      );
      btn(50, idea.hidden ? t('admin.unhide') : t('admin.hide'), 'neutral', () => upd({ hidden: !idea.hidden }));
      btn(130, t('ideas.delete'), 'danger', () =>
        confirm(
          s,
          t('ideas.deleteTitle'),
          t('ideas.deleteBody', { title: idea.title }),
          t('ideas.delete'),
          () =>
            void runAction(
              s,
              `adel:${idea.id}`,
              () => Admin.deleteIdea(idea.id),
              () => void this.load(),
            ),
        ),
      );
    });
  }

  tick(): void {}

  destroy(): void {
    this.alive = false;
    if (this.st.view === this) this.st.view = null;
  }
}

const STATUS_VARIANT: Record<IdeaStatus, kit.ButtonVariant> = {
  open: 'info',
  planned: 'primary',
  done: 'success',
  rejected: 'danger',
};
