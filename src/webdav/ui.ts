/** Nextcloud / WebDAV accounts and file browser (DAV-001..DAV-004). */
import { button, h } from '../app/dom';
import { ACCEPTED_EXTENSIONS } from '../core/format';
import { t } from '../i18n';
import { davRootUrl, WebDavClient, WebDavError, type DavEntry } from './client';

export interface DavAccount {
  id: string;
  /** WebDAV root of the files. */
  url: string;
  username: string;
  password: string;
}

export interface DavLocation {
  account: DavAccount;
  path: string;
}

export interface DavFile extends DavLocation {
  bytes: Uint8Array;
  etag?: string;
}

const KEY = 'pwo.webdav.accounts';

export function loadDavAccounts(): DavAccount[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? (raw as DavAccount[]).filter((a) => a && typeof a.url === 'string' && typeof a.password === 'string') : [];
  } catch {
    return [];
  }
}

function store(accounts: DavAccount[]): void {
  try {
    if (accounts.length) localStorage.setItem(KEY, JSON.stringify(accounts));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: the account lives for this session only */
  }
}

function addDavAccount(input: Omit<DavAccount, 'id'>): DavAccount {
  const account = { ...input, id: `dav-${Date.now().toString(36)}` };
  store([...loadDavAccounts(), account]);
  return account;
}

function forgetDavAccount(id: string): void {
  store(loadDavAccounts().filter((a) => a.id !== id));
}

export const davClient = (account: DavAccount): WebDavClient => new WebDavClient(account);

export function davLabel(account: DavAccount): string {
  try {
    return `${account.username ? `${account.username}@` : ''}${new URL(account.url).host}`;
  } catch {
    return account.url;
  }
}

/** A readable explanation of a failed WebDAV request. */
export function davErrorMessage(err: unknown): string {
  if (err instanceof WebDavError) {
    if (err.status === 0) return t('dav.unreachable');
    if (err.status === 401 || err.status === 403) return t('dav.denied');
    if (err.status === 404) return t('dav.notFound');
    if (err.status === 507) return t('dav.full');
  }
  return t('dav.failed', { message: (err as Error).message });
}

const supported = (name: string): boolean => ACCEPTED_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));
const parentOf = (path: string): string => path.split('/').slice(0, -1).join('/');

/**
 * Browse the cloud. In "open" mode resolves with the chosen file; in "save"
 * mode with the chosen folder + file name.
 */
export function browseCloud(host: HTMLElement, mode: 'open', suggestedName?: string): Promise<DavFile | null>;
export function browseCloud(host: HTMLElement, mode: 'save', suggestedName?: string): Promise<DavLocation | null>;
export function browseCloud(host: HTMLElement, mode: 'open' | 'save', suggestedName = ''): Promise<DavFile | DavLocation | null> {
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'dialog dav-dialog', 'aria-labelledby': 'dav-title' });
    const status = h('p', { class: 'git-status', role: 'status', 'aria-live': 'polite' });
    const body = h('div', { class: 'git-body' });
    dialog.append(h('h2', { id: 'dav-title' }, mode === 'open' ? t('dav.openTitle') : t('dav.saveTitle')), body, status);
    let generation = 0;
    let done = false;
    const finish = (value: DavFile | DavLocation | null): void => {
      if (done) return;
      done = true;
      generation++;
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(null);
    });
    const setStatus = (text: string, error = false): void => {
      status.textContent = text;
      status.classList.toggle('error', error);
    };
    const cancel = (): HTMLElement => button(t('common.cancel'), () => finish(null));

    const showAddForm = (): void => {
      const server = h('input', { type: 'url', placeholder: 'https://cloud.example.org', autocomplete: 'url', spellcheck: 'false' });
      const user = h('input', { type: 'text', autocomplete: 'username', spellcheck: 'false' });
      const password = h('input', { type: 'password', autocomplete: 'off' });
      const form = h(
        'form',
        { class: 'grist-form' },
        h('label', {}, t('dav.server'), server),
        h('label', {}, t('dav.username'), user),
        h('label', {}, t('dav.password'), password),
        h('p', { class: 'hint' }, t('dav.passwordHelp')),
        h('p', { class: 'hint' }, t('dav.corsHelp'), ' ', h('a', { href: new URL('docs/guide/cloud', document.baseURI).href, target: '_blank', rel: 'noopener' }, t('dav.setupGuide'))),
        h('div', { class: 'dialog-actions' }, ...(loadDavAccounts().length ? [button(t('common.back'), () => showBrowser(loadDavAccounts()[0]!))] : []), cancel(), h('button', { type: 'submit', class: 'primary' }, t('dav.connect'))),
      );
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!/^https:\/\//i.test(server.value.trim()) || !password.value) {
          setStatus(t('dav.invalid'), true);
          return;
        }
        const input = { url: davRootUrl(server.value, user.value), username: user.value.trim(), password: password.value };
        setStatus(t('dav.checking'));
        void new WebDavClient(input)
          .list('')
          .then(() => {
            setStatus('');
            showBrowser(addDavAccount(input));
          })
          .catch((err: unknown) => setStatus(davErrorMessage(err), true));
      });
      body.replaceChildren(form);
      setTimeout(() => server.focus(), 0);
    };

    const showBrowser = (account: DavAccount): void => {
      const client = davClient(account);
      const accounts = loadDavAccounts();
      const accountSelect = h('select', { 'aria-label': t('dav.account') }, ...accounts.map((a) => h('option', { value: a.id, selected: a.id === account.id }, davLabel(a))));
      accountSelect.addEventListener('change', () => showBrowser(accounts.find((a) => a.id === accountSelect.value) ?? account));
      const crumbs = h('div', { class: 'git-crumbs', 'aria-label': t('dav.folder') });
      const list = h('ul', { class: 'git-list', 'aria-label': t('dav.folder') });
      const fileName = h('input', { type: 'text', value: suggestedName, 'aria-label': t('dav.fileName'), spellcheck: 'false' });
      let folder = '';

      const openFolder = async (path: string): Promise<void> => {
        const gen = ++generation;
        setStatus(t('dav.loading'));
        try {
          const entries = await client.list(path);
          if (gen !== generation) return;
          folder = path;
          renderCrumbs();
          renderEntries(entries);
          setStatus(entries.length ? '' : t('dav.empty'));
        } catch (err) {
          if (gen === generation) setStatus(davErrorMessage(err), true);
        }
      };
      const renderCrumbs = (): void => {
        const parts = folder ? folder.split('/') : [];
        crumbs.replaceChildren(
          button(davLabel(account), () => void openFolder(''), { className: 'link' }),
          ...parts.flatMap((part, i) => [h('span', { 'aria-hidden': 'true' }, ' / '), button(part, () => void openFolder(parts.slice(0, i + 1).join('/')), { className: 'link' })]),
        );
      };
      const renderEntries = (entries: DavEntry[]): void => {
        const items: HTMLElement[] = [];
        if (folder) items.push(h('li', {}, button(`⬑ ${t('git.up')}`, () => void openFolder(parentOf(folder)), { className: 'git-entry dir' })));
        for (const e of entries) {
          if (e.type === 'dir') {
            items.push(h('li', {}, button(`📁 ${e.name}`, () => void openFolder(e.path), { className: 'git-entry dir' })));
          } else if (mode === 'open') {
            const ok = supported(e.name);
            const b = button(`📄 ${e.name}`, () => void openEntry(e), { className: 'git-entry file', title: ok ? e.path : t('git.unsupported') });
            b.disabled = !ok;
            items.push(h('li', {}, b));
          } else {
            items.push(h('li', {}, button(`📄 ${e.name}`, () => (fileName.value = e.name), { className: 'git-entry file' })));
          }
        }
        list.replaceChildren(...items);
      };
      const openEntry = async (e: DavEntry): Promise<void> => {
        setStatus(t('dav.loading'));
        try {
          const file = await client.read(e.path);
          finish({ account, path: e.path, bytes: file.bytes, ...(file.etag ? { etag: file.etag } : {}) });
        } catch (err) {
          setStatus(davErrorMessage(err), true);
        }
      };
      const forget = button(t('git.forget'), () => {
        if (!window.confirm(t('dav.forgetConfirm'))) return;
        forgetDavAccount(account.id);
        const rest = loadDavAccounts();
        if (rest.length) showBrowser(rest[0]!);
        else showAddForm();
      });
      const actions = h('div', { class: 'dialog-actions' }, cancel());
      if (mode === 'save') {
        actions.append(
          button(
            t('dav.saveHere'),
            () => {
              const name = fileName.value.trim().replace(/[/\\]/g, '_');
              if (name) finish({ account, path: folder ? `${folder}/${name}` : name });
            },
            { className: 'primary' },
          ),
        );
      }
      body.replaceChildren(
        h('div', { class: 'grist-row' }, accountSelect, button(t('dav.addAccount'), showAddForm), forget),
        crumbs,
        list,
        ...(mode === 'save' ? [h('label', { class: 'git-row' }, t('dav.fileName'), ' ', fileName)] : []),
        actions,
      );
      void openFolder('');
    };

    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    const accounts = loadDavAccounts();
    if (accounts.length) showBrowser(accounts[0]!);
    else showAddForm();
  });
}
