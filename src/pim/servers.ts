/**
 * CAL-006, CONTACT-005: the calendars and address books of servers kept in
 * step with the event and contact notes — chosen among those of the
 * Nextcloud / WebDAV accounts of the user, synchronised when asked and when
 * the calendar or the contacts open.
 */
import { button, h } from '../app/dom';
import { t } from '../i18n';
import type { StorageProvider } from '../fs';
import { loadDavAccounts, davLabel, type DavAccount } from '../webdav/ui';
import { DavSyncClient, DavSyncError, type Collection, type CollectionKind } from './dav';
import { contactKind, eventKind, loadState, saveState, synchronise, type SyncReport } from './sync';

export interface ChosenCollection extends Collection {
  accountId: string;
}

const KEY = 'pwo.pim.servers';

export function loadChosen(): ChosenCollection[] {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '[]') as ChosenCollection[];
    return Array.isArray(saved) ? saved.filter((c) => c && typeof c.url === 'string' && (c.kind === 'calendar' || c.kind === 'addressbook')) : [];
  } catch {
    return [];
  }
}

export function saveChosen(list: ChosenCollection[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* not kept */
  }
}

/** Why a server could not be reached, in words. */
export function syncErrorMessage(err: unknown): string {
  if (err instanceof DavSyncError) {
    if (err.status === 0) return t('dav.unreachable');
    if (err.status === 401 || err.status === 403) return t('dav.denied');
    if (err.status === 404) return t('dav.notFound');
  }
  return t('dav.failed', { message: (err as Error).message });
}

const clientOf = (account: DavAccount): DavSyncClient => new DavSyncClient({ url: account.url, username: account.username, password: account.password });

/**
 * Synchronise the chosen collections of a kind with the notes of the
 * folder; `isNote` makes attendees and organisations links.
 */
export async function synchroniseKind(provider: StorageProvider, kind: CollectionKind, isNote?: (name: string) => boolean): Promise<SyncReport | undefined> {
  const chosen = loadChosen().filter((c) => c.kind === kind);
  if (!chosen.length) return undefined;
  const accounts = new Map(loadDavAccounts().map((a) => [a.id, a]));
  const state = await loadState(provider);
  const total: SyncReport = { received: 0, sent: 0, removedHere: 0, removedThere: 0, conflicts: [], errors: [] };
  for (const accountId of new Set(chosen.map((c) => c.accountId))) {
    const account = accounts.get(accountId);
    const collections = chosen.filter((c) => c.accountId === accountId);
    if (!account) {
      total.errors.push(t('pimsync.noAccount', { names: collections.map((c) => c.name).join(', ') }));
      continue;
    }
    const client = clientOf(account);
    const remove = (p: string): Promise<void> => provider.remove(p);
    const r = kind === 'calendar' ? await synchronise(client, collections, eventKind(provider, isNote), state, remove) : await synchronise(client, collections, contactKind(provider, isNote), state, remove);
    total.received += r.received;
    total.sent += r.sent;
    total.removedHere += r.removedHere;
    total.removedThere += r.removedThere;
    total.conflicts.push(...r.conflicts);
    total.errors.push(...r.errors);
  }
  await saveState(provider, state);
  return total;
}

/** The result of a synchronisation, in a sentence. */
export function reportText(r: SyncReport): string {
  const parts = [t('pimsync.done', { received: r.received, sent: r.sent, removed: r.removedHere + r.removedThere })];
  if (r.conflicts.length) parts.push(t('pimsync.conflicts', { names: r.conflicts.join(', ') }));
  if (r.errors.length) parts.push(r.errors.join(' '));
  return parts.join(' ');
}

/** The window choosing the calendars (or address books) of the accounts to keep in step. */
export function chooseCollections(host: HTMLElement, kind: CollectionKind, addAccount: () => Promise<void>): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'dialog pim-servers', 'aria-labelledby': 'pim-servers-title' });
    const chosen = new Map(loadChosen().map((c) => [c.url, c]));
    const body = h('div', { class: 'pim-servers-body' });
    const close = (saved: boolean): void => {
      dialog.close();
      dialog.remove();
      resolve(saved);
    };
    const draw = (): void => {
      const accounts = loadDavAccounts();
      body.replaceChildren(
        ...(accounts.length
          ? accounts.map((account) => {
              const list = h('div', { class: 'pim-collections' }, ...[...chosen.values()].filter((c) => c.accountId === account.id && c.kind === kind).map((c) => line(c)));
              const find = button(t('pimsync.find'), async () => {
                find.disabled = true;
                list.replaceChildren(h('p', { class: 'hint' }, t('pimsync.finding')));
                try {
                  const found = await clientOf(account).discover(kind);
                  list.replaceChildren(...(found.length ? found.map((c) => line({ ...c, accountId: account.id })) : [h('p', { class: 'hint' }, t(kind === 'calendar' ? 'pimsync.noCalendar' : 'pimsync.noBook'))]));
                } catch (err) {
                  list.replaceChildren(h('p', { class: 'error-text' }, syncErrorMessage(err)));
                } finally {
                  find.disabled = false;
                }
              });
              return h('section', { class: 'pim-account' }, h('h3', {}, `☁ ${davLabel(account)}`, ' ', find), list);
            })
          : [h('p', { class: 'hint' }, t('pimsync.noAccounts'))]),
        button(t('pimsync.addAccount'), () => void addAccount().then(draw), { icon: '＋' }),
      );
    };
    const line = (c: ChosenCollection): HTMLElement => {
      const box = h('input', { type: 'checkbox', checked: chosen.has(c.url) });
      box.addEventListener('change', () => (box.checked ? chosen.set(c.url, c) : chosen.delete(c.url)));
      return h('label', { class: 'pim-collection' }, box, h('span', { class: 'pim-colour', style: `background: ${c.colour ?? 'var(--accent)'}`, 'aria-hidden': 'true' }), ` ${c.name}`);
    };
    draw();
    dialog.append(
      h('h2', { id: 'pim-servers-title' }, t(kind === 'calendar' ? 'pimsync.calendarsTitle' : 'pimsync.booksTitle')),
      h('p', { class: 'hint' }, t(kind === 'calendar' ? 'pimsync.calendarsHint' : 'pimsync.booksHint')),
      body,
      h(
        'div',
        { class: 'dialog-actions' },
        button(t('common.cancel'), () => close(false)),
        button(t('cal.save'), () => {
          saveChosen([...loadChosen().filter((c) => c.kind !== kind), ...[...chosen.values()].filter((c) => c.kind === kind)]);
          close(true);
        }, { className: 'primary' }),
      ),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      close(false);
    });
    host.append(dialog);
    dialog.showModal();
  });
}
