/**
 * CONTACT-002: the contacts of the folder — person notes of `People` — as a
 * list searched by name, e-mail, organisation or tag, and the card of a
 * contact: its fields with what to do with them (write, call), the notes
 * and the events linking to it. Imports and exports vCard files
 * (CONTACT-003).
 */
import { button, h } from '../app/dom';
import { t } from '../i18n';
import type { StorageProvider } from '../fs';
import type { EditorView } from '../app/views';
import { readContacts, writeContacts } from './vcard';
import { loadContacts, loadPimSettings, saveContact, type Stored, type StoredContact } from './store';
import { calendarColour } from './calendar-view';
import type { MessageKey } from '../i18n';
import type { AgentTool } from '../ai/tools';
import { INTERACTION_KINDS, KIND_ICON, type InteractionKind } from './interactions';
import { contactTimeline, logInteraction } from './people';
import { pimAgentTools } from './agent-tools';

export interface ContactsHost {
  /** CONTACT-006: add a line to the daily note of a day (written first if needed); its path. */
  appendToDaily?(date: Date, line: string): Promise<string>;
  provider: StorageProvider;
  open(path: string): void;
  noteNames(): string[];
  /** The notes linking to a note, with the words around the link. */
  backlinks(path: string): Promise<{ from: string; context: string }[]>;
  changed(paths: string[]): void;
  error(message: string): void;
  download(name: string, text: string, type: string): void;
  statusChanged?(): void;
  /** A message for the user (the result of a synchronisation). */
  notify?(message: string): void;
  /** Add a Nextcloud / WebDAV account. */
  addAccount?(): Promise<void>;
}

const KIND = 'addressbook';

const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

/** A birthday as words, with the age it brings this year. */
function birthdayText(b: string): string {
  const d = new Date(`${b.startsWith('--') ? `2000${b.slice(1)}` : b}T00:00`);
  if (Number.isNaN(d.getTime())) return b;
  const day = new Intl.DateTimeFormat(document.documentElement.lang || undefined, { day: 'numeric', month: 'long', ...(b.startsWith('--') ? {} : { year: 'numeric' }) }).format(d);
  return b.startsWith('--') ? day : `${day} (${t('people.age', { n: new Date().getFullYear() - d.getFullYear() })})`;
}

export class ContactsView implements EditorView {
  readonly element = h('div', { class: 'contacts-view', role: 'application', 'aria-label': t('people.title') });
  private contacts: Stored<StoredContact>[] = [];
  private loaded = false;
  private selected: string | undefined;
  private query = '';
  private readonly search = h('input', { type: 'search', class: 'contacts-search', placeholder: t('people.search'), 'aria-label': t('people.search') });
  private readonly list = h('ul', { class: 'contacts-list', role: 'listbox', 'aria-label': t('people.title') });
  private readonly card = h('section', { class: 'contact-card', 'aria-live': 'polite' });

  constructor(private readonly host: ContactsHost) {
    this.search.addEventListener('input', () => {
      this.query = this.search.value;
      this.renderList();
    });
    this.element.append(
      h(
        'div',
        { class: 'contacts-bar' },
        this.search,
        button(t('people.new'), () => this.edit(), { icon: '＋', className: 'primary' }),
        button(t('pimsync.sync'), () => void this.syncServers(), { text: '⟳', className: 'icon contacts-sync' }),
        button(t('pimsync.servers'), () => void import('./servers').then(({ chooseCollections }) => chooseCollections(this.element, KIND, () => this.host.addAccount?.() ?? Promise.resolve())).then((saved) => (saved ? this.syncServers() : undefined)), { text: '☁', className: 'icon' }),
        button(t('people.import'), () => this.importVcf(), { text: '⇪', className: 'icon' }),
        button(t('people.export'), () => this.host.download(`${t('people.title')}.vcf`, writeContacts(this.contacts.map((c) => c.item)), 'text/vcard'), { text: '⇩', className: 'icon' }),
      ),
      h('div', { class: 'contacts-body' }, this.list, this.card),
    );
  }

  mounted(): void {
    void this.reload().then(() => this.syncServers(true));
  }

  status(): string {
    return this.loaded ? t('people.count', { n: this.contacts.length }) : t('cal.loading');
  }

  formatLabel(): string {
    return t('people.title');
  }

  focus(): void {
    this.search.focus();
  }

  destroy(): void {
    this.element.replaceChildren();
  }

  async reload(): Promise<void> {
    this.contacts = (await loadContacts(this.host.provider).catch(() => [])).sort((a, b) => a.item.name.localeCompare(b.item.name));
    this.loaded = true;
    this.selected ??= this.contacts[0]?.path;
    this.renderList();
    void this.renderCard();
  }

  private matches(c: StoredContact): boolean {
    const q = fold(this.query.trim());
    if (!q) return true;
    return [c.name, c.organization, c.role, ...(c.emails ?? []), ...(c.phones ?? []), ...(c.categories ?? []).map((x) => `#${x}`)].some((v) => v && fold(v).includes(q));
  }

  private renderList(): void {
    this.host.statusChanged?.();
    const shown = this.contacts.filter((c) => this.matches(c.item));
    // The contact shown is one of the list.
    if (shown.length && !shown.some((c) => c.path === this.selected)) {
      this.selected = shown[0]!.path;
      void this.renderCard();
    }
    const items: HTMLElement[] = [];
    let letter = '';
    for (const c of shown) {
      const first = fold(c.item.name)[0]?.toUpperCase() ?? '#';
      if (first !== letter) {
        letter = first;
        items.push(h('li', { class: 'contacts-letter', role: 'presentation' }, letter));
      }
      const li = h(
        'li',
        { role: 'option', 'aria-selected': String(c.path === this.selected), class: c.path === this.selected ? 'selected' : '', tabindex: '0' },
        h('span', { class: 'contact-avatar', style: `--avatar: ${calendarColour(c.item.name)}`, 'aria-hidden': 'true' }, initials(c.item.name)),
        h('span', { class: 'contact-line' }, h('span', { class: 'contact-name' }, c.item.name), h('small', {}, c.item.organization ?? c.item.emails?.[0] ?? c.item.phones?.[0] ?? '')),
      );
      const pick = (): void => {
        this.selected = c.path;
        this.renderList();
        void this.renderCard();
      };
      li.addEventListener('click', pick);
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          pick();
        }
      });
      items.push(li);
    }
    this.list.replaceChildren(...(items.length ? items : [h('li', { class: 'hint', role: 'presentation' }, this.loaded ? (this.contacts.length ? t('people.none') : t('people.empty', { folder: loadPimSettings().people })) : t('cal.loading'))]));
  }

  private async renderCard(): Promise<void> {
    const stored = this.contacts.find((c) => c.path === this.selected);
    if (!stored) return void this.card.replaceChildren();
    const c = stored.item;
    const notes = new Set(this.host.noteNames().map((n) => n.toLowerCase()));
    const row = (label: string, ...value: (HTMLElement | string)[]): HTMLElement => h('div', { class: 'contact-row' }, h('dt', {}, label), h('dd', {}, ...value));
    const link = (href: string, text: string): HTMLElement => h('a', { href, rel: 'noopener noreferrer', target: href.startsWith('http') ? '_blank' : '_self' }, text);
    const rows: HTMLElement[] = [];
    if (c.emails?.length) rows.push(row(t('people.emails'), ...c.emails.flatMap((e, i) => [i ? ', ' : '', link(`mailto:${e}`, e)])));
    if (c.phones?.length) rows.push(row(t('people.phones'), ...c.phones.flatMap((p, i) => [i ? ', ' : '', link(`tel:${p.replace(/\s+/g, '')}`, p)])));
    if (c.organization) rows.push(row(t('people.organization'), notes.has(c.organization.toLowerCase()) ? button(c.organization, () => this.host.open(this.pathOf(c.organization!)), { className: 'link' }) : c.organization));
    if (c.role) rows.push(row(t('people.role'), c.role));
    if (c.birthday) rows.push(row(t('people.birthday'), birthdayText(c.birthday)));
    if (c.address) rows.push(row(t('people.address'), c.address));
    if (c.website) rows.push(row(t('people.website'), link(c.website, c.website.replace(/^https?:\/\//, ''))));
    if (c.categories?.length) rows.push(row(t('people.tags'), c.categories.map((x) => `#${x}`).join(' ')));
    const linked = h('section', { class: 'contact-interactions' }, h('h3', {}, t('people.interactionsTitle')), h('p', { class: 'hint' }, t('cal.loading')));
    const facts = h('dl', { class: 'contact-fields contact-facts' });
    this.card.replaceChildren(
      h(
        'header',
        { class: 'contact-head' },
        h('span', { class: 'contact-avatar large', style: `--avatar: ${calendarColour(c.name)}`, 'aria-hidden': 'true' }, initials(c.name)),
        h('div', {}, h('h2', {}, c.name), c.role || c.organization ? h('p', { class: 'hint' }, [c.role, c.organization].filter(Boolean).join(' · ')) : ''),
      ),
      h(
        'div',
        { class: 'contact-actions' },
        this.host.appendToDaily ? button(t('people.log'), () => this.logDialog(stored), { icon: '🗒', className: 'primary' }) : '',
        button(t('people.edit'), () => this.edit(stored), { icon: '✎' }),
        button(t('cal.openNote'), () => this.host.open(stored.path), { icon: '📝' }),
        button(t('people.delete'), () => void this.remove(stored), { className: 'danger', icon: '🗑' }),
      ),
      h('dl', { class: 'contact-fields' }, ...rows),
      facts,
      linked,
    );
    // CONTACT-006: the interactions — events, daily notes, other notes — the latest first.
    const { items, first, last } = await contactTimeline(this.host, stored);
    if (this.selected !== stored.path) return;
    const day = (iso: string): string => new Intl.DateTimeFormat(document.documentElement.lang || undefined, { dateStyle: 'long' }).format(new Date(`${iso.slice(0, 10)}T00:00`));
    const ago = (iso: string): string => {
      const days = Math.round((new Date(new Date().toDateString()).getTime() - new Date(`${iso}T00:00`).getTime()) / 86_400_000);
      return new Intl.RelativeTimeFormat(document.documentElement.lang || undefined, { numeric: 'auto' }).format(-days, 'day');
    };
    facts.replaceChildren(
      ...(first ? [h('div', { class: 'contact-row' }, h('dt', {}, t('people.firstMet')), h('dd', {}, day(first)))] : []),
      ...(last ? [h('div', { class: 'contact-row' }, h('dt', {}, t('people.lastContact')), h('dd', {}, `${day(last)} (${ago(last)})`))] : []),
    );
    const icon = { event: '📅', daily: '🗓', note: '📝' } as const;
    linked.replaceChildren(
      h('h3', {}, t('people.interactions', { n: items.length })),
      items.length
        ? h(
            'ul',
            { role: 'list', class: 'contact-timeline' },
            ...items.slice(0, 100).map((i) =>
              h(
                'li',
                { class: `contact-${i.kind}` },
                h('span', { class: 'contact-when' }, i.when ? day(i.when) + (i.when.length > 10 ? ` ${i.when.slice(11, 16)}` : '') : '—'),
                h('span', { 'aria-hidden': 'true' }, icon[i.kind]),
                h('span', {}, button(i.label, () => this.host.open(i.path), { className: 'link' }), i.context && i.kind !== 'event' ? h('p', { class: 'folder-snippet' }, i.context) : ''),
              ),
            ),
          )
        : h('p', { class: 'hint' }, t('people.noLinks', { name: c.name })),
    );
  }

  /** CONTACT-006: tell an interaction, written to the daily note of its day. */
  private logDialog(stored: Stored<StoredContact>): void {
    const now = new Date();
    const pad = (n: number): string => String(n).padStart(2, '0');
    const kind = h('select', { 'aria-label': t('people.kind') }, ...INTERACTION_KINDS.map((k) => h('option', { value: k }, `${KIND_ICON[k]} ${t(`people.kind.${k}` as MessageKey)}`)));
    const when = h('input', { type: 'datetime-local', value: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`, 'aria-label': t('people.when') });
    const summary = h('textarea', { rows: '3', 'aria-label': t('people.summary'), placeholder: t('people.summaryHint') });
    const dialog = h('dialog', { class: 'dialog calendar-dialog', 'aria-labelledby': 'contact-log-title' });
    const close = (): void => {
      dialog.close();
      dialog.remove();
    };
    const save = async (): Promise<void> => {
      close();
      try {
        await logInteraction(this.host, stored, kind.value as InteractionKind, when.value ? new Date(when.value) : new Date(), summary.value);
        await this.reload();
      } catch (err) {
        this.host.error((err as Error).message);
      }
    };
    const field = (label: string, el: HTMLElement): HTMLElement => h('label', { class: 'calendar-field' }, h('span', {}, label), h('span', { class: 'calendar-inputs' }, el));
    dialog.append(
      h('h2', { id: 'contact-log-title' }, t('people.logTitle', { name: stored.item.name })),
      field(t('people.kind'), kind),
      field(t('people.when'), when),
      field(t('people.summary'), summary),
      h('p', { class: 'hint' }, t('people.logHint')),
      h('div', { class: 'dialog-actions' }, button(t('common.cancel'), close), button(t('cal.save'), () => void save(), { className: 'primary' })),
    );
    dialog.addEventListener('cancel', (ev) => {
      ev.preventDefault();
      close();
    });
    this.element.append(dialog);
    dialog.showModal();
    summary.focus();
  }

  /** CONTACT-007: the contacts and the calendar, for AI agents. */
  agentTools(): AgentTool[] {
    return pimAgentTools({ ...this.host, changed: (paths) => {
      this.host.changed(paths);
      void this.reload();
    } });
  }

  private pathOf(name: string): string {
    return this.host.noteNames().find((n) => n.toLowerCase() === name.toLowerCase()) ?? name;
  }

  private async remove(stored: Stored<StoredContact>): Promise<void> {
    if (!window.confirm(t('people.deleteConfirm', { name: stored.item.name }))) return;
    try {
      await this.host.provider.remove(stored.path);
      this.contacts = this.contacts.filter((c) => c !== stored);
      this.selected = this.contacts[0]?.path;
      this.renderList();
      void this.renderCard();
      this.host.changed([stored.path]);
    } catch (err) {
      this.host.error((err as Error).message);
    }
  }

  private async store(contact: StoredContact, at?: Stored<StoredContact>): Promise<void> {
    try {
      const names = new Set(this.host.noteNames().map((n) => n.toLowerCase()));
      const saved = await saveContact(this.host.provider, contact, at, (name) => names.has(name.toLowerCase()));
      this.contacts = [...this.contacts.filter((c) => c.path !== saved.path), saved].sort((a, b) => a.item.name.localeCompare(b.item.name));
      this.selected = saved.path;
      this.renderList();
      void this.renderCard();
      this.host.changed([saved.path]);
    } catch (err) {
      this.host.error((err as Error).message);
    }
  }

  /** The window of a contact: a new one, or one of the folder. */
  edit(stored?: Stored<StoredContact>): void {
    const c: Partial<StoredContact> = stored?.item ?? {};
    const input = (label: string, value = '', type = 'text', extra: Record<string, string> = {}): HTMLInputElement => h('input', { type, value, 'aria-label': label, ...extra });
    const name = input(t('people.name'), c.name ?? '');
    const given = input(t('people.givenName'), c.givenName ?? '');
    const family = input(t('people.familyName'), c.familyName ?? '');
    // The full name follows the first and last names until written by hand.
    let nameTyped = !!c.name;
    name.addEventListener('input', () => (nameTyped = true));
    const follow = (): void => {
      if (!nameTyped) name.value = [given.value.trim(), family.value.trim()].filter(Boolean).join(' ');
    };
    given.addEventListener('input', follow);
    family.addEventListener('input', follow);
    const emails = input(t('people.emails'), (c.emails ?? []).join(', '), 'text', { placeholder: t('people.several') });
    const phones = input(t('people.phones'), (c.phones ?? []).join(', '), 'text', { placeholder: t('people.several') });
    const orgs = h('datalist', { id: 'contact-orgs' }, ...this.host.noteNames().slice(0, 500).map((n) => h('option', { value: n })));
    const organization = input(t('people.organization'), c.organization ?? '', 'text', { list: 'contact-orgs' });
    const role = input(t('people.role'), c.role ?? '');
    const birthday = input(t('people.birthday'), c.birthday && !c.birthday.startsWith('--') ? c.birthday : '', 'date');
    const address = input(t('people.address'), c.address ?? '');
    const website = input(t('people.website'), c.website ?? '', 'url');
    const tags = input(t('people.tags'), (c.categories ?? []).join(', '), 'text', { placeholder: t('people.several') });
    const dialog = h('dialog', { class: 'dialog calendar-dialog contact-dialog', 'aria-labelledby': 'contact-dialog-title' });
    const close = (): void => {
      dialog.close();
      dialog.remove();
    };
    const split = (v: string): string[] => v.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
    const save = (): void => {
      const full = name.value.trim() || [given.value.trim(), family.value.trim()].filter(Boolean).join(' ');
      if (!full) {
        name.setCustomValidity(t('people.nameNeeded'));
        name.reportValidity();
        return;
      }
      const contact: StoredContact = {
        uid: c.uid ?? '',
        name: full,
        ...(given.value.trim() ? { givenName: given.value.trim() } : {}),
        ...(family.value.trim() ? { familyName: family.value.trim() } : {}),
        ...(split(emails.value).length ? { emails: split(emails.value) } : {}),
        ...(split(phones.value).length ? { phones: split(phones.value) } : {}),
        ...(organization.value.trim() ? { organization: organization.value.trim() } : {}),
        ...(role.value.trim() ? { role: role.value.trim() } : {}),
        ...(birthday.value ? { birthday: birthday.value } : c.birthday?.startsWith('--') ? { birthday: c.birthday } : {}),
        ...(address.value.trim() ? { address: address.value.trim() } : {}),
        ...(website.value.trim() ? { website: website.value.trim() } : {}),
        ...(split(tags.value).length ? { categories: split(tags.value).map((x) => x.replace(/^#/, '')) } : {}),
        ...(c.remote ? { remote: c.remote } : {}),
      };
      close();
      void this.store(contact, stored);
    };
    const field = (label: string, el: HTMLElement): HTMLElement => h('label', { class: 'calendar-field' }, h('span', {}, label), h('span', { class: 'calendar-inputs' }, el));
    dialog.append(
      h('h2', { id: 'contact-dialog-title' }, stored ? t('people.editTitle') : t('people.newTitle')),
      field(t('people.givenName'), given),
      field(t('people.familyName'), family),
      field(t('people.name'), name),
      field(t('people.emails'), emails),
      field(t('people.phones'), phones),
      field(t('people.organization'), h('span', { class: 'calendar-inputs' }, organization, orgs)),
      field(t('people.role'), role),
      field(t('people.birthday'), birthday),
      field(t('people.address'), address),
      field(t('people.website'), website),
      field(t('people.tags'), tags),
      h('div', { class: 'dialog-actions' }, button(t('common.cancel'), close), button(t('cal.save'), save, { className: 'primary' })),
    );
    dialog.addEventListener('cancel', (ev) => {
      ev.preventDefault();
      close();
    });
    dialog.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && (ev.target as HTMLElement).tagName === 'INPUT') {
        ev.preventDefault();
        save();
      }
    });
    this.element.append(dialog);
    dialog.showModal();
    (stored ? name : given).focus();
  }

  /** CAL-006, CONTACT-005: the chosen collections of the servers synchronised with the notes; none chosen: choose them. */
  private async syncServers(auto = false): Promise<void> {
    if (this.syncing) return;
    const { loadChosen, synchroniseKind, chooseCollections, reportText, syncErrorMessage } = await import('./servers');
    if (!loadChosen().some((c) => c.kind === KIND)) {
      if (auto) return;
      if (await chooseCollections(this.element, KIND, () => this.host.addAccount?.() ?? Promise.resolve())) await this.syncServers();
      return;
    }
    this.syncing = true;
    this.element.classList.add('syncing');
    try {
      const names = new Set(this.host.noteNames().map((n) => n.toLowerCase()));
      const report = await synchroniseKind(this.host.provider, KIND, (name) => names.has(name.toLowerCase()));
      if (report) {
        if (!auto || report.received || report.sent || report.conflicts.length || report.errors.length) this.host.notify?.(reportText(report));
        if (report.received || report.removedHere || report.sent) {
          await this.reload();
          this.host.changed([]);
        }
      }
    } catch (err) {
      this.host.notify?.(syncErrorMessage(err));
    } finally {
      this.syncing = false;
      this.element.classList.remove('syncing');
    }
  }

  private syncing = false;

  /** CONTACT-003: the contacts of a .vcf file as person notes. */
  private importVcf(): void {
    const input = h('input', { type: 'file', accept: '.vcf,text/vcard,text/x-vcard' });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      const contacts = readContacts(await file.text());
      const known = new Map(this.contacts.map((c) => [c.item.uid, c]));
      for (const c of contacts) await this.store(c, known.get(c.uid));
      window.alert(t('people.imported', { n: contacts.length, folder: loadPimSettings().people }));
    });
    input.click();
  }
}
