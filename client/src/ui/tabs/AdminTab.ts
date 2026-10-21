import {
  BALANCE_STATS,
  allCardKeys,
  getCard,
  setLiveBalance,
  statApplies,
  statRange,
  withOverride,
  type Balance,
  type BalanceStat,
  type CardOverride,
} from '@arena/shared';
import { cardName } from '../../i18n';
import { Sfx } from '../../systems/Sfx';
import {
  Admin,
  MUTE_OPTIONS,
  type CardStat,
  type AdminLogEntry,
  type AdminPlayer,
  type AdminStats,
  type ReportGroup,
} from '../../net/admin';
import { fmtNum } from '../style';
import * as kit from '../kit';
import { openModal, toast } from '../Modal';
import { textPrompt } from '../textPrompt';
import { t } from '../../i18n';
import { L } from '../../layout';
import type { ScrollPanel } from '../ScrollPanel';
import { Tab, runAction, sectionHeader, type Area } from './Tab';
import { IdeasView } from './social/IdeasView';
import { confirm, msgTime, panelButton } from './social/common';

type Section = 'summary' | 'reports' | 'players' | 'cards' | 'ideas' | 'log';
const BAR_H = 76;

/** Lo cargado (se conserva al redibujar y al volver a la pestaña). */
const data = {
  stats: null as AdminStats | null,
  reports: null as ReportGroup[] | null,
  query: '',
  players: null as AdminPlayer[] | null,
  log: null as AdminLogEntry[] | null,
  /** Balance en vigor, cambios sin guardar y estadísticas de las cartas. */
  balance: null as Balance | null,
  draft: null as Record<string, CardOverride> | null,
  cards: null as { version: number; decks: number; rows: CardStat[] } | null,
  failed: false,
};

/** Paso de los botones − / + del editor de balance. */
const STEP: Record<BalanceStat, (base: number) => number> = {
  hp: (b) => Math.max(1, Math.round(b * 0.05)),
  dmg: (b) => Math.max(1, Math.round(b * 0.05)),
  hitSpeed: () => 0.05,
  cost: () => 1,
};

const muteLabel = (h: number): string => (h < 24 ? t('admin.hours', { n: h }) : t('admin.days', { n: h / 24 }));

/**
 * Pestaña de admin (solo la ven las cuentas con una wallet de ADMIN_WALLETS; el servidor
 * lo comprueba en cada petición). Resumen, denuncias del chat, jugadores, ideas y registro.
 */
export class AdminTab extends Tab {
  static section: Section = 'summary';
  /** La pestaña que se está viendo (la que se redibuja al terminar una carga). */
  private static current: AdminTab | null = null;
  declare private view: IdeasView | null;

  constructor(scene: ConstructorParameters<typeof Tab>[0]) {
    super(scene);
    AdminTab.current = this;
    void this.load();
  }

  /** Carga lo que necesita la sección abierta. */
  async load(): Promise<void> {
    try {
      const sec = AdminTab.section;
      if (sec === 'summary') data.stats = await Admin.stats();
      else if (sec === 'reports') data.reports = await Admin.reports();
      else if (sec === 'players' && data.query) data.players = await Admin.players(data.query);
      else if (sec === 'log') data.log = await Admin.log();
      else if (sec === 'cards') {
        const [b, c] = await Promise.all([Admin.balance(), Admin.cards()]);
        data.balance = b.current;
        data.draft ??= structuredClone(b.current.o);
        data.cards = c;
      }
      data.failed = false;
    } catch {
      data.failed = true;
    }
    AdminTab.current?.rebuild();
  }

  override build(): void {
    this.view?.destroy();
    this.view = null;
    const full = this.area;
    this.sectionBar(full);
    const A: Area = { x: full.x, y: full.y + BAR_H, w: full.w, h: full.h - BAR_H };
    const sec = AdminTab.section;
    if (sec === 'ideas') {
      this.view = new IdeasView(this, A, true);
      return;
    }
    const colW = L.pc ? Math.min(1100, A.w) : A.w;
    const P = this.scroll(A.x + Math.round((A.w - colW) / 2), A.y, colW, A.h);
    const pad = L.pc ? 0 : 20;
    const w = colW - pad * 2;
    let y = 10;
    if (sec === 'summary') y = this.buildSummary(P, pad, y, w);
    else if (sec === 'reports') y = this.buildReports(P, pad, y, w);
    else if (sec === 'players') y = this.buildPlayers(P, pad, y, w);
    else if (sec === 'cards') y = this.buildCards(P, pad, y, w);
    else y = this.buildLog(P, pad, y, w);
    P.setContentHeight(y + 30);
  }

  private sectionBar(A: Area): void {
    const s = this.scene;
    const pad = L.pc ? 0 : 20;
    const w = Math.min(L.pc ? 1100 : A.w, A.w) - pad * 2;
    const items: Array<[Section, string]> = [
      ['summary', t('admin.secSummary')],
      ['reports', t('admin.secReports')],
      ['players', t('admin.secPlayers')],
      ['cards', t('admin.secCards')],
      ['ideas', t('admin.secIdeas')],
      ['log', t('admin.secLog')],
    ];
    const bw = (w - (items.length - 1) * 10) / items.length;
    items.forEach(([key, label], i) => {
      const on = AdminTab.section === key;
      this.root.add(
        kit.button(
          s,
          A.x + pad + bw / 2 + i * (bw + 10),
          A.y + 32,
          bw,
          58,
          label,
          on ? 'danger' : 'dark',
          () => this.setSection(key),
          {
            size: L.pc ? 20 : 15,
          },
        ),
      );
    });
  }

  setSection(sec: Section): void {
    if (AdminTab.section === sec) return;
    AdminTab.section = sec;
    this.rebuild();
    void this.load();
  }

  private loading(P: ScrollPanel, x: number, y: number, w: number): number {
    P.add(
      kit.text(
        this.scene,
        x + w / 2,
        y + 50,
        data.failed ? t('admin.failed') : t('social.loading'),
        'body',
        '#aab3e8',
        { size: 20 },
      ),
    );
    return y + 100;
  }

  // ───────── Cartas: victorias, uso y balance ─────────

  /** ¿Hay cambios sin guardar respecto al balance en vigor? */
  private pendingCards(): string[] {
    const cur = data.balance?.o ?? {};
    const draft = data.draft ?? {};
    const keys = new Set([...Object.keys(cur), ...Object.keys(draft)]);
    return [...keys].filter((k) => JSON.stringify(cur[k] ?? {}) !== JSON.stringify(draft[k] ?? {}));
  }

  private buildCards(P: ScrollPanel, x: number, y: number, w: number): number {
    const s = this.scene;
    const st = data.cards;
    sectionHeader(
      s,
      x,
      y + 14,
      w,
      t('admin.cardsTitle', { v: data.balance?.v ?? 0 }),
      st ? t('admin.cardsGames', { n: st.decks }) : '',
    ).forEach((o) => P.add(o));
    y += 60;
    if (!st || !data.balance) return this.loading(P, x, y, w);
    // cambios sin guardar
    const pending = this.pendingCards();
    if (pending.length) {
      P.add(kit.panel(s, x, y, w, 78, 'gold'));
      P.add(
        kit.text(s, x + 20, y + 39, t('admin.cardsPending', { n: pending.length }), 'label', '#3a2600', {
          originX: 0,
          size: 18,
        }),
      );
      panelButton(P, x + w - 300, y + 39, 170, 54, t('admin.cardsSave'), 'success', () => this.saveBalance());
      panelButton(P, x + w - 110, y + 39, 170, 54, t('admin.cardsDiscard'), 'neutral', () => {
        data.draft = structuredClone(data.balance!.o);
        this.rebuild();
      });
      y += 92;
    }
    P.add(
      kit.text(s, x + w / 2, y + 4, t('admin.cardsHint'), 'small', '#7480c0', {
        size: 15,
        originY: 0,
        wordWrap: { width: w - 20 },
      }),
    );
    y += 56;
    // tabla: de más a menos victorias (las que no se han jugado, al final)
    const byKey = new Map(st.rows.map((r) => [r.key, r]));
    const rows = allCardKeys().map((k) => ({ k, r: byKey.get(k) }));
    const rate = (r?: CardStat) => (r && r.games ? r.wins / r.games : -1);
    rows.sort((a, b) => rate(b.r) - rate(a.r) || a.k.localeCompare(b.k));
    const cols = L.pc ? [0.36, 0.16, 0.16, 0.16, 0.16] : [0.4, 0.2, 0.2, 0.2, 0];
    const colX = (i: number) => x + 16 + cols.slice(0, i).reduce((a, b) => a + b, 0) * (w - 32);
    const head = [t('admin.colCard'), t('admin.colWin'), t('admin.colUse'), t('admin.colGames'), t('admin.colPlays')];
    head.forEach((h, i) => cols[i] && P.add(kit.text(s, colX(i), y, h, 'label', '#aab3e8', { originX: 0, size: 15 })));
    y += 26;
    for (const { k, r } of rows) {
      const ov = data.draft?.[k];
      P.add(kit.panel(s, x, y, w, 50, ov ? 'blue' : 'card'));
      const card = getCard(k);
      const win = rate(r);
      const winCol = win < 0 ? '#7480c0' : win > 0.58 ? '#ff9a9a' : win < 0.42 ? '#9fc4ff' : '#ffffff';
      const cells = [
        `${ov ? '✎ ' : ''}${cardName(card)}`,
        win < 0 ? '—' : `${Math.round(win * 100)} %`,
        r && st.decks ? `${Math.round((r.games / st.decks) * 100)} %` : '—',
        r ? String(r.games) : '0',
        r && r.games ? (r.plays / r.games).toFixed(1) : '—',
      ];
      cells.forEach((txt, i) => {
        if (!cols[i]) return;
        P.add(kit.text(s, colX(i), y + 25, txt, 'label', i === 1 ? winCol : '#ffffff', { originX: 0, size: 17 }));
      });
      P.addTap(x + w / 2, y + 25, w, 50, () => {
        Sfx.play('click');
        this.editCard(k);
      });
      y += 56;
    }
    return y;
  }

  /** Editor de una carta: − / + por estadística, sobre una copia (se guarda todo junto). */
  private editCard(key: string): void {
    const s = this.scene;
    const base = getCard(key);
    const stats = BALANCE_STATS.filter((st) => statApplies(base, st));
    openModal(s, 620, 210 + stats.length * 92, cardName(base), (box, close) => {
      const content = s.add.container(0, 0);
      box.add(content);
      const H = 210 + stats.length * 92;
      const render = () => {
        content.removeAll(true);
        const cur = withOverride(base, data.draft?.[key]);
        let y = -H / 2 + 50;
        for (const st of stats) {
          const changed = cur[st] !== base[st];
          content.add(kit.panel(s, -280, y, 560, 78, changed ? 'blue' : 'dark'));
          content.add(kit.text(s, -256, y + 26, t(`admin.stat.${st}`), 'label', '#ffffff', { originX: 0, size: 19 }));
          content.add(
            kit.text(s, -256, y + 54, t('admin.statBase', { n: base[st] }), 'small', '#aab3e8', {
              originX: 0,
              size: 14,
            }),
          );
          content.add(
            kit.text(s, 120, y + 39, String(cur[st]), 'number', changed ? '#ffd75a' : '#ffffff', { size: 26 }),
          );
          const [lo, hi] = statRange(base, st);
          const set = (v: number) => {
            const value = Math.min(hi, Math.max(lo, st === 'hitSpeed' ? Math.round(v * 100) / 100 : Math.round(v)));
            const ov = { ...(data.draft![key] ?? {}) };
            if (value === base[st]) delete ov[st];
            else ov[st] = value;
            if (Object.keys(ov).length) data.draft![key] = ov;
            else delete data.draft![key];
            render();
          };
          content.add(
            kit.button(s, 30, y + 39, 64, 56, '−', 'neutral', () => set(cur[st] - STEP[st](base[st])), { size: 30 }),
          );
          content.add(
            kit.button(s, 210, y + 39, 64, 56, '+', 'neutral', () => set(cur[st] + STEP[st](base[st])), { size: 30 }),
          );
          y += 92;
        }
        content.add(
          kit.button(
            s,
            -140,
            H / 2 - 60,
            240,
            70,
            t('admin.cardReset'),
            'neutral',
            () => {
              delete data.draft![key];
              render();
            },
            { size: 22 },
          ),
        );
        content.add(kit.button(s, 140, H / 2 - 60, 240, 70, t('common.ok'), 'success', close, { size: 26 }));
      };
      render();
      box.once('destroy', () => this.rebuild());
    });
  }

  /** Guarda todos los cambios como una versión nueva (con una nota de qué y por qué). */
  private saveBalance(): void {
    const s = this.scene;
    void textPrompt(t('admin.cardsNote'), { maxLength: 120 }).then((note) => {
      if (!note?.trim()) return;
      void runAction(
        s,
        'admin:balance',
        () => Admin.saveBalance(data.draft ?? {}, note.trim()),
        (r) => {
          data.balance = r.current;
          data.draft = structuredClone(r.current.o);
          setLiveBalance(r.current);
          toast(s, t('admin.cardsSaved', { v: r.current.v }), '#7dff8a');
          void this.load();
        },
      );
    });
  }

  // ───────── Resumen ─────────
  private buildSummary(P: ScrollPanel, x: number, y: number, w: number): number {
    const s = this.scene;
    sectionHeader(s, x, y + 14, w, t('admin.secSummary'), t('admin.last24h')).forEach((o) => P.add(o));
    y += 60;
    const st = data.stats;
    if (!st) return this.loading(P, x, y, w);
    const cards: Array<[string, number, string]> = [
      ['admin.stat.accounts', st.accounts, '#ffffff'],
      ['admin.stat.withWallet', st.withWallet, '#9fc4ff'],
      ['admin.stat.active24h', st.active24h, '#7dff8a'],
      ['admin.stat.matches24h', st.matches24h, '#ffd75a'],
      ['admin.stat.clans', st.clans, '#ffffff'],
      ['admin.stat.ideasOpen', st.ideasOpen, '#ffd75a'],
      ['admin.stat.reports24h', st.reports24h, st.reports24h ? '#ff9a9a' : '#ffffff'],
      ['admin.stat.muted', st.muted, '#ffffff'],
    ];
    const cols = L.pc ? 4 : 2;
    const cw = (w - (cols - 1) * 14) / cols;
    cards.forEach(([label, n, color], i) => {
      const cx = x + (i % cols) * (cw + 14),
        cy = y + Math.floor(i / cols) * 134;
      P.add(kit.panel(s, cx, cy, cw, 120, 'card'));
      P.add(kit.text(s, cx + cw / 2, cy + 48, fmtNum(n), 'h1', color, { size: 42 }));
      P.add(kit.text(s, cx + cw / 2, cy + 94, t(label), 'label', '#aab3e8', { size: 16 }));
    });
    y += Math.ceil(cards.length / cols) * 134 + 10;
    panelButton(P, x + w / 2, y + 30, 240, 56, t('admin.refresh'), 'neutral', () => void this.load());
    return y + 70;
  }

  // ───────── Denuncias ─────────
  private buildReports(P: ScrollPanel, x: number, y: number, w: number): number {
    const s = this.scene;
    const list = data.reports;
    sectionHeader(s, x, y + 14, w, t('admin.secReports'), list ? t('admin.pending', { n: list.length }) : '').forEach(
      (o) => P.add(o),
    );
    y += 60;
    if (!list) return this.loading(P, x, y, w);
    if (!list.length) {
      P.add(kit.panel(s, x, y, w, 110, 'inset'));
      P.add(kit.text(s, x + w / 2, y + 55, t('admin.noReports'), 'body', '#7dff8a', { size: 20 }));
      return y + 120;
    }
    for (const g of list) {
      const text = kit.text(s, x + 24, y + 70, `"${g.text}"`, 'body', '#ffffff', {
        originX: 0,
        originY: 0,
        size: 18,
        wordWrap: { width: w - 48, useAdvancedWrap: true },
        align: 'left',
      });
      const h = 70 + text.height + 90;
      P.add(kit.panel(s, x, y, w, h, 'card'));
      P.add(kit.text(s, x + 24, y + 26, g.targetName, 'h3', '#ffffff', { originX: 0, size: 22 }));
      const reasons = Object.entries(g.reasons)
        .map(([r, n]) => `${t(`admin.reason.${r}`)} ×${n}`)
        .join('  ·  ');
      P.add(kit.text(s, x + 24, y + 52, reasons, 'small', '#ff9a9a', { originX: 0, size: 14 }));
      P.add(kit.text(s, x + w - 20, y + 26, msgTime(g.lastAt), 'small', '#7480c0', { originX: 1, size: 14 }));
      if (g.hidden)
        P.add(kit.text(s, x + w - 20, y + 52, t('admin.autoHidden'), 'small', '#ffd75a', { originX: 1, size: 14 }));
      P.add(text);
      const by = y + h - 42;
      const bw = Math.min(200, (w - 60) / 3);
      const act = (i: number, label: string, v: kit.ButtonVariant, fn: () => Promise<unknown>) =>
        panelButton(
          P,
          x + 20 + bw / 2 + i * (bw + 10),
          by,
          bw,
          52,
          label,
          v,
          () =>
            void runAction(s, `rep:${g.messageId}`, fn, () => {
              toast(s, t('admin.saved'), '#7dff8a');
              void this.load();
            }),
          { size: 17 },
        );
      act(0, t('admin.dismiss'), 'neutral', () => Admin.resolve(g.messageId, 'dismiss'));
      act(1, t('admin.punish', { t: muteLabel(24) }), 'danger', () => Admin.resolve(g.messageId, 'punish', 24));
      act(2, t('admin.punish', { t: muteLabel(168) }), 'danger', () => Admin.resolve(g.messageId, 'punish', 168));
      y += h + 12;
    }
    return y;
  }

  // ───────── Jugadores ─────────
  private buildPlayers(P: ScrollPanel, x: number, y: number, w: number): number {
    const s = this.scene;
    sectionHeader(s, x, y + 14, w, t('admin.secPlayers')).forEach((o) => P.add(o));
    y += 54;
    P.add(kit.panel(s, x, y, w - 200, 60, 'inset'));
    P.add(
      kit.text(s, x + 20, y + 30, data.query || t('admin.searchHint'), 'body', data.query ? '#ffd75a' : '#5a64a8', {
        originX: 0,
        size: 19,
      }),
    );
    P.addTap(x + (w - 200) / 2, y + 30, w - 200, 60, () => void this.search());
    panelButton(P, x + w - 92, y + 30, 184, 58, t('clan.search'), 'info', () => void this.search());
    y += 80;
    if (!data.query) return y;
    if (!data.players) return this.loading(P, x, y, w);
    if (!data.players.length) {
      P.add(kit.text(s, x + w / 2, y + 40, t('admin.noPlayers'), 'body', '#aab3e8', { size: 19 }));
      return y + 90;
    }
    for (const p of data.players) {
      const h = 96;
      P.add(kit.panel(s, x, y, w, h - 8, p.mutedUntil ? 'red' : 'card'));
      P.add(kit.text(s, x + 22, y + 28, p.name, 'h3', '#ffffff', { originX: 0, size: 21 }));
      const info = [
        `Lv ${p.kingLevel}`,
        `${fmtNum(p.trophies)} ${t('admin.trophies')}`,
        p.code ? `#${p.code}` : null,
        p.wallets[0] ? `${p.wallets[0].slice(0, 4)}…${p.wallets[0].slice(-4)}` : t('social.guest'),
        p.clan,
      ]
        .filter(Boolean)
        .join('  ·  ');
      P.add(kit.text(s, x + 22, y + 60, info, 'small', '#aab3e8', { originX: 0, size: 14 }));
      P.add(
        kit.text(
          s,
          x + w - 20,
          y + 28,
          t('admin.reportsN', { n: p.reports }),
          'label',
          p.reports ? '#ff9a9a' : '#7480c0',
          {
            originX: 1,
            size: 16,
          },
        ),
      );
      if (p.mutedUntil)
        P.add(
          kit.text(s, x + w - 20, y + 60, t('admin.mutedUntil', { t: msgTime(p.mutedUntil) }), 'small', '#ffd75a', {
            originX: 1,
            size: 14,
          }),
        );
      else
        P.add(
          kit.text(s, x + w - 20, y + 60, t('admin.seen', { t: msgTime(p.lastSeenAt) }), 'small', '#7480c0', {
            originX: 1,
            size: 14,
          }),
        );
      P.addTap(x + w / 2, y + h / 2, w, h - 8, () => this.playerModal(p));
      y += h;
    }
    return y;
  }

  private async search(): Promise<void> {
    const q = await textPrompt(t('admin.searchTitle'), {
      maxLength: 60,
      kind: 'text',
      value: data.query,
      placeholder: t('admin.searchHint'),
    });
    if (q === null) return;
    data.query = q.trim();
    data.players = null;
    this.rebuild();
    void this.load();
  }

  private playerModal(p: AdminPlayer): void {
    const s = this.scene;
    const done = () => {
      toast(s, t('admin.saved'), '#7dff8a');
      void this.load();
    };
    const actions: Array<[string, kit.ButtonVariant, () => void]> = MUTE_OPTIONS.map((h) => [
      t('admin.mute', { t: muteLabel(h) }),
      'danger',
      () => void runAction(s, `mute:${p.accountId}`, () => Admin.mute(p.accountId, h), done),
    ]);
    if (p.mutedUntil)
      actions.unshift([
        t('admin.unmute'),
        'success',
        () => void runAction(s, `mute:${p.accountId}`, () => Admin.mute(p.accountId, 0), done),
      ]);
    actions.push([
      t('admin.rename'),
      'neutral',
      () =>
        confirm(
          s,
          t('admin.rename'),
          t('admin.renameBody', { name: p.name }),
          t('common.yes'),
          () => void runAction(s, `ren:${p.accountId}`, () => Admin.rename(p.accountId), done),
        ),
    ]);
    const h = 230 + actions.length * 76;
    openModal(s, 580, h, p.name, (box, close) => {
      box.add(kit.text(s, 0, -h / 2 + 64, p.wallets[0] ?? t('social.guest'), 'small', '#aab3e8', { size: 14 }));
      box.add(kit.text(s, 0, -h / 2 + 90, t('admin.reportsN', { n: p.reports }), 'label', '#ff9a9a', { size: 16 }));
      actions.forEach(([label, v, fn], i) =>
        box.add(kit.button(s, 0, -h / 2 + 150 + i * 76, 420, 62, label, v, () => (close(), fn()), { size: 20 })),
      );
    });
  }

  // ───────── Registro ─────────
  private buildLog(P: ScrollPanel, x: number, y: number, w: number): number {
    const s = this.scene;
    sectionHeader(s, x, y + 14, w, t('admin.secLog')).forEach((o) => P.add(o));
    y += 54;
    if (!data.log) return this.loading(P, x, y, w);
    if (!data.log.length) {
      P.add(kit.text(s, x + w / 2, y + 40, t('admin.noLog'), 'body', '#aab3e8', { size: 19 }));
      return y + 90;
    }
    for (const e of data.log) {
      const d = e.details;
      const detail = String(
        d.title ?? d.text ?? d.from ?? (d.hours !== undefined ? muteLabel(Number(d.hours)) : '') ?? '',
      );
      P.add(kit.panel(s, x, y, w, 66, 'card'));
      P.add(
        kit.text(s, x + 20, y + 22, `${e.adminName}  →  ${t(`admin.act.${e.action}`)}`, 'label', '#ffd75a', {
          originX: 0,
          size: 16,
        }),
      );
      P.add(kit.text(s, x + 20, y + 46, detail.slice(0, L.pc ? 90 : 44), 'small', '#dfe4ff', { originX: 0, size: 14 }));
      P.add(kit.text(s, x + w - 18, y + 22, msgTime(e.createdAt), 'small', '#7480c0', { originX: 1, size: 13 }));
      y += 74;
    }
    return y;
  }

  override tick(): void {
    this.view?.tick();
  }

  override destroy(): void {
    this.view?.destroy();
    if (AdminTab.current === this) AdminTab.current = null;
    super.destroy();
  }
}
