/**
 * BIB-010: the user's Zotero library, read through Zotero's Web API with a
 * key the user creates (read-only), kept in this browser and sent only to
 * api.zotero.org. Sources come as BibTeX, with Zotero's citation keys.
 */
import { button, h, setStatus } from '../app/dom';
import { t } from '../i18n';
import { entrySummary, parseBibtex, type BibEntry } from './bibliography';
import { readSecret, writeSecret } from '../lock/session';

export const ZOTERO_API = 'https://api.zotero.org';
export const ZOTERO_KEY_PAGE = 'https://www.zotero.org/settings/keys/new';
const KEY = 'pwo.zotero';

export interface ZoteroAccount {
  apiKey: string;
  userId: number;
  username?: string;
}

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export function loadZotero(): ZoteroAccount | undefined {
  try {
    const v = JSON.parse(readSecret(KEY) ?? 'null') as ZoteroAccount | null;
    return v && typeof v.apiKey === 'string' && typeof v.userId === 'number' ? v : undefined;
  } catch {
    return undefined;
  }
}

export function saveZotero(account: ZoteroAccount | undefined): void {
  try {
    if (account) writeSecret(KEY, JSON.stringify(account));
    else writeSecret(KEY, null);
  } catch {
    /* storage unavailable: kept for this session only */
  }
}

export class ZoteroError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface ZoteroCollection {
  key: string;
  name: string;
  items: number;
}

export class ZoteroClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: FetchFn = (i, init) => fetch(i, init),
  ) {}

  private async get(path: string): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetchFn(`${ZOTERO_API}${path}`, { headers: { 'Zotero-API-Key': this.apiKey, 'Zotero-API-Version': '3' } });
    } catch (err) {
      throw new ZoteroError((err as Error).message || 'Network error', 0);
    }
    if (!res.ok) throw new ZoteroError(`HTTP ${res.status}`, res.status);
    return res;
  }

  /** The account of the key (its user id), checking it. */
  async account(): Promise<ZoteroAccount> {
    const info = (await (await this.get('/keys/current')).json()) as { userID?: number; username?: string };
    if (typeof info.userID !== 'number') throw new ZoteroError('Unknown key', 403);
    return { apiKey: this.apiKey, userId: info.userID, ...(info.username ? { username: info.username } : {}) };
  }

  /** Sources of the library matching `query` (title, creators, year), as BibTeX entries. */
  async search(userId: number, query: string, limit = 25): Promise<BibEntry[]> {
    const q = new URLSearchParams({ q: query, qmode: 'titleCreatorYear', format: 'bibtex', limit: String(limit), itemType: '-note' });
    return parseBibtex(await (await this.get(`/users/${userId}/items/top?${q}`)).text());
  }

  async collections(userId: number): Promise<ZoteroCollection[]> {
    const list = (await (await this.get(`/users/${userId}/collections?limit=100`)).json()) as { key: string; data: { name: string }; meta?: { numItems?: number } }[];
    return list.map((c) => ({ key: c.key, name: c.data.name, items: c.meta?.numItems ?? 0 })).sort((a, b) => a.name.localeCompare(b.name));
  }

  /** The sources of a collection (100 at most). */
  async collection(userId: number, key: string): Promise<BibEntry[]> {
    return parseBibtex(await (await this.get(`/users/${userId}/collections/${encodeURIComponent(key)}/items/top?format=bibtex&limit=100`)).text());
  }
}

/** Ask the key, check it, keep it: the account, or null when cancelled. */
function connect(host: HTMLElement): Promise<ZoteroAccount | null> {
  return new Promise((resolve) => {
    const key = h('input', { type: 'password', autocomplete: 'off', spellcheck: 'false', 'aria-label': t('zotero.key') });
    const error = h('p', { class: 'error', role: 'alert', hidden: true });
    const form = h(
      'form',
      { method: 'dialog' },
      h('h2', { id: 'zotero-connect-title' }, t('zotero.connectTitle')),
      h('ol', { class: 'zotero-steps' }, h('li', {}, t('zotero.step1'), ' ', h('a', { href: ZOTERO_KEY_PAGE, target: '_blank', rel: 'noopener noreferrer' }, ZOTERO_KEY_PAGE)), h('li', {}, t('zotero.step2')), h('li', {}, t('zotero.step3'))),
      h('label', { class: 'field' }, t('zotero.key'), key),
      h('p', { class: 'hint' }, t('zotero.keyHint')),
      error,
      h('div', { class: 'dialog-actions' }, button(t('common.cancel'), () => finish(null)), h('button', { type: 'submit', class: 'primary' }, t('git.connect'))),
    );
    const dialog = h('dialog', { class: 'dialog zotero-dialog', 'aria-labelledby': 'zotero-connect-title' }, form);
    const finish = (value: ZoteroAccount | null): void => {
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const apiKey = key.value.trim();
      if (!apiKey) return key.focus();
      new ZoteroClient(apiKey)
        .account()
        .then((account) => {
          saveZotero(account);
          finish(account);
        })
        .catch((err: ZoteroError) => {
          error.textContent = err.status === 403 || err.status === 401 ? t('zotero.badKey') : t('zotero.unreachable', { message: err.message });
          error.hidden = false;
        });
    });
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(null);
    });
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    key.focus();
  });
}

/**
 * Search the Zotero library and choose sources, or a whole collection
 * (`collections`): the sources chosen, or null when cancelled.
 */
export async function pickFromZotero(host: HTMLElement, mode: 'search' | 'collection' = 'search'): Promise<BibEntry[] | null> {
  const account = loadZotero() ?? (await connect(host));
  if (!account) return null;
  const client = new ZoteroClient(account.apiKey);
  return new Promise((resolve) => {
    const chosen = new Map<string, BibEntry>();
    const status = h('p', { class: 'hint', role: 'status' });
    const list = h('ul', { class: 'bib-choices', 'aria-label': t('zotero.results') });
    const search = h('input', { type: 'search', 'aria-label': t('zotero.search'), placeholder: t('zotero.searchPlaceholder') });
    const collections = h('select', { 'aria-label': t('zotero.collection') });
    const show = (entries: BibEntry[], all: boolean): void => {
      list.replaceChildren(
        ...entries.map((e) => {
          const box = h('input', { type: 'checkbox', value: e.key });
          if (all) chosen.set(e.key, e);
          box.checked = chosen.has(e.key);
          box.addEventListener('change', () => (box.checked ? chosen.set(e.key, e) : chosen.delete(e.key)));
          return h('li', {}, h('label', { class: 'check' }, box, ` ${entrySummary(e)}`));
        }),
      );
      status.textContent = entries.length ? '' : t('zotero.none');
    };
    const fail = (err: unknown): void => {
      status.textContent = t('zotero.unreachable', { message: (err as Error).message });
    };
    let round = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const q = search.value.trim();
        if (!q) return;
        const n = ++round;
        setStatus(status, t('git.loading'));
        client.search(account.userId, q).then((entries) => n === round && show(entries, false), fail);
      }, 300);
    });
    collections.addEventListener('change', () => {
      if (!collections.value) return;
      chosen.clear();
      setStatus(status, t('git.loading'));
      client.collection(account.userId, collections.value).then((entries) => show(entries, true), fail);
    });
    if (mode === 'collection') {
      setStatus(status, t('git.loading'));
      client.collections(account.userId).then((list) => {
        collections.replaceChildren(h('option', { value: '' }, '—'), ...list.map((c) => h('option', { value: c.key }, `${c.name} (${c.items})`)));
        status.textContent = '';
      }, fail);
    }
    const dialog = h('dialog', { class: 'dialog zotero-dialog cite-dialog', 'aria-labelledby': 'zotero-title' });
    const finish = (value: BibEntry[] | null): void => {
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    const forget = button(t('zotero.forget'), () => {
      saveZotero(undefined);
      finish(null);
    });
    dialog.append(
      h('h2', { id: 'zotero-title' }, mode === 'search' ? t('zotero.searchTitle') : t('zotero.collectionTitle')),
      h('p', { class: 'hint' }, t('zotero.library', { user: account.username ?? String(account.userId) })),
      mode === 'search' ? search : h('label', { class: 'git-row' }, t('zotero.collection'), ' ', collections),
      list,
      status,
      h('div', { class: 'dialog-actions' }, forget, button(t('common.cancel'), () => finish(null)), button(mode === 'search' ? t('zotero.addCite') : t('zotero.import'), () => finish([...chosen.values()]), { className: 'primary' })),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(null);
    });
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    (mode === 'search' ? search : collections).focus();
  });
}
