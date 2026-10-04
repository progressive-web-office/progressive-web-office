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
import { loadContacts, loadEvents, loadPimSettings, saveContact, type Stored, type StoredContact } from './store';
import { calendarColour } from './calendar-view';

export interface ContactsHost {
  provider: StorageProvider;
  open(path: string): void;
  noteNames(): string[];
  /** The notes linking to a note, with the words around the link. */
  backlinks(path: string): Promise<{ from: string; context: string }[]>;
  changed(paths: string[]): void;
  error(message: string): void;
  download(name: string, text: string, type: string): void;
  statusChanged?(): void;
}

const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
const noteNameOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1).replace(/\.(md|markdown)$/i, '');

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
        button(t('people.import'), () => this.importVcf(), { text: '⇪', className: 'icon' }),
        button(t('people.export'), () => this.host.download(`${t('people.title')}.vcf`, writeContacts(this.contacts.map((c) => c.item)), 'text/vcard'), { text: '⇩', className: 'icon' }),
      ),
      h('div', { class: 'contacts-body' }, this.list, this.card),
    );
  }

  mounted(): void {
    void this.reload();
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
    const linked = h('section', { class: 'contact-linked' }, h('h3', {}, t('people.linked')), h('p', { class: 'hint' }, t('cal.loading')));
    const events = h('section', { class: 'contact-events' });
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
        button(t('people.edit'), () => this.edit(stored), { icon: '✎' }),
        button(t('cal.openNote'), () => this.host.open(stored.path), { icon: '📝' }),
        button(t('people.delete'), () => void this.remove(stored), { className: 'danger', icon: '🗑' }),
      ),
      h('dl', { class: 'contact-fields' }, ...rows),
      events,
      linked,
    );
    // The notes linking to it, and the events it attends (CONTACT-001).
    const [backlinks, allEvents] = await Promise.all([this.host.backlinks(stored.path).catch(() => []), loadEvents(this.host.provider).catch(() => [])]);
    if (this.selected !== stored.path) return;
    const name = noteNameOf(stored.path).toLowerCase();
    const attending = allEvents.filter((e) => (e.item.attendees ?? []).some((a) => a.toLowerCase() === name || a.toLowerCase() === c.name.toLowerCase())).sort((a, b) => b.item.start.localeCompare(a.item.start));
    const eventPaths = new Set(attending.map((e) => e.path));
    const others = backlinks.filter((b) => !eventPaths.has(b.from));
    events.replaceChildren(
      ...(attending.length
        ? [
            h('h3', {}, t('people.events', { n: attending.length })),
            h('ul', { role: 'list' }, ...attending.slice(0, 20).map((e) => h('li', {}, h('span', { class: 'hint' }, `${e.item.start.slice(0, 10)} `), button(e.item.title, () => this.host.open(e.path), { className: 'link' })))),
          ]
        : []),
    );
    linked.replaceChildren(
      h('h3', {}, t('people.linkedCount', { n: others.length })),
      others.length
        ? h('ul', { role: 'list' }, ...others.map((b) => h('li', {}, button(noteNameOf(b.from), () => this.host.open(b.from), { className: 'link' }), h('p', { class: 'folder-snippet' }, b.context))))
        : h('p', { class: 'hint' }, t('people.noLinks', { name: c.name })),
    );
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
