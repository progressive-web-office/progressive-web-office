/** Grist accounts and document picker (GRIST-001, GRIST-002). */
import { button, h, setStatus } from '../app/dom';
import { t } from '../i18n';
import { GristClient, GristError, type GristDoc } from './client';

export interface GristAccount {
  id: string;
  serverUrl: string;
  apiKey: string;
}

const KEY = 'pwo.grist.accounts';

export function loadGristAccounts(): GristAccount[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? (raw as GristAccount[]).filter((a) => a && typeof a.serverUrl === 'string' && typeof a.apiKey === 'string') : [];
  } catch {
    return [];
  }
}

function storeAccounts(accounts: GristAccount[]): void {
  try {
    if (accounts.length) localStorage.setItem(KEY, JSON.stringify(accounts));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: the account lives for this session only */
  }
}

export function addGristAccount(serverUrl: string, apiKey: string): GristAccount {
  const account = { id: `grist-${Date.now().toString(36)}`, serverUrl: serverUrl.trim().replace(/\/+$/, ''), apiKey: apiKey.trim() };
  storeAccounts([...loadGristAccounts(), account]);
  return account;
}

export function forgetGristAccount(id: string): void {
  storeAccounts(loadGristAccounts().filter((a) => a.id !== id));
}

export const gristClient = (account: GristAccount): GristClient => new GristClient({ serverUrl: account.serverUrl, apiKey: account.apiKey });

/** A readable explanation of a failed Grist request. */
export function gristErrorMessage(err: unknown): string {
  if (err instanceof GristError) {
    if (err.status === 0) return t('grist.unreachable');
    if (err.status === 401 || err.status === 403) return t('grist.denied');
    return t('grist.failed', { message: err.message });
  }
  return t('grist.failed', { message: (err as Error).message });
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

export interface GristChoice {
  account: GristAccount;
  doc: GristDoc;
}

/** Pick a Grist document; adds an account first when there is none. */
export function pickGristDocument(host: HTMLElement): Promise<GristChoice | null> {
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'dialog grist-dialog', 'aria-labelledby': 'grist-title' });
    const body = h('div', { class: 'grist-body' });
    const status = h('p', { class: 'grist-status', role: 'status', 'aria-live': 'polite' });
    dialog.append(h('h2', { id: 'grist-title' }, t('grist.title')), body, status);
    let finished = false;
    const finish = (choice: GristChoice | null): void => {
      if (finished) return;
      finished = true;
      dialog.close();
      dialog.remove();
      resolve(choice);
    };
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(null);
    });
    const actions = (...extra: HTMLElement[]): HTMLElement => h('div', { class: 'dialog-actions' }, ...extra, button(t('common.cancel'), () => finish(null)));

    const showAddForm = (): void => {
      const server = h('input', { type: 'url', placeholder: 'https://grist.example.org', autocomplete: 'url', spellcheck: 'false' });
      const key = h('input', { type: 'password', autocomplete: 'off', spellcheck: 'false' });
      const form = h(
        'form',
        { class: 'grist-form' },
        h('label', {}, t('grist.server'), server),
        h('label', {}, t('grist.apiKey'), key),
        h('p', { class: 'hint' }, t('grist.apiKeyHelp')),
        h('p', { class: 'hint' }, t('grist.corsHelp'), ' ', h('a', { href: new URL('docs/guide/grist', document.baseURI).href, target: '_blank', rel: 'noopener' }, t('grist.setupGuide'))),
      );
      const add = async (): Promise<void> => {
        if (!server.value.trim() || !key.value.trim()) return;
        setStatus(status, t('grist.checking'));
        try {
          await new GristClient({ serverUrl: server.value, apiKey: key.value }).listOrgs();
        } catch (err) {
          status.textContent = gristErrorMessage(err);
          return;
        }
        status.textContent = '';
        showDocuments(addGristAccount(server.value, key.value));
      };
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        void add();
      });
      body.replaceChildren(form, actions(button(t('grist.addAccount'), () => void add(), { className: 'primary' })));
      setTimeout(() => server.focus(), 0);
    };

    const showDocuments = (account: GristAccount): void => {
      const accounts = loadGristAccounts();
      const accountSelect = h('select', { 'aria-label': t('grist.account') }, ...accounts.map((a) => h('option', { value: a.id, selected: a.id === account.id }, hostOf(a.serverUrl))));
      accountSelect.addEventListener('change', () => showDocuments(accounts.find((a) => a.id === accountSelect.value) ?? account));
      const orgSelect = h('select', { 'aria-label': t('grist.team') });
      const list = h('ul', { class: 'grist-docs', 'aria-label': t('grist.documents') });
      const forget = button(t('git.forget'), () => {
        if (!window.confirm(t('grist.forgetConfirm'))) return;
        forgetGristAccount(account.id);
        const rest = loadGristAccounts();
        if (rest.length) showDocuments(rest[0]!);
        else showAddForm();
      });
      body.replaceChildren(
        h('div', { class: 'grist-row' }, accountSelect, button(t('grist.addAccount'), showAddForm), forget),
        h('div', { class: 'grist-row' }, orgSelect),
        list,
        actions(),
      );
      const client = gristClient(account);
      const loadDocs = async (orgId: number): Promise<void> => {
        list.replaceChildren();
        setStatus(status, t('grist.loading'));
        try {
          const docs = await client.listDocs(orgId);
          status.textContent = docs.length ? '' : t('grist.noDocuments');
          list.replaceChildren(
            ...docs.map((doc) => h('li', {}, button(doc.name, () => finish({ account, doc }), { text: doc.name, title: `${doc.workspace} / ${doc.name}` }), h('span', { class: 'grist-workspace' }, doc.workspace))),
          );
        } catch (err) {
          status.textContent = gristErrorMessage(err);
        }
      };
      orgSelect.addEventListener('change', () => void loadDocs(Number(orgSelect.value)));
      setStatus(status, t('grist.loading'));
      void client
        .listOrgs()
        .then((orgs) => {
          orgSelect.replaceChildren(...orgs.map((o) => h('option', { value: String(o.id) }, o.name)));
          if (orgs[0]) void loadDocs(orgs[0].id);
          else status.textContent = t('grist.noDocuments');
        })
        .catch((err: unknown) => (status.textContent = gristErrorMessage(err)));
    };

    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    const accounts = loadGristAccounts();
    if (accounts.length) showDocuments(accounts[0]!);
    else showAddForm();
  });
}
