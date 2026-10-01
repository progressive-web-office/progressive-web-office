/** Repository browser and commit dialogs (GIT-001..GIT-006). */
import { button, h } from '../app/dom';
import { ACCEPTED_EXTENSIONS } from '../core/format';
import { t } from '../i18n';
import { addAccount, clientFor, commitMessage, defaultApiUrl, forgetAccount, loadAccounts, type GitAccount } from './accounts';
import type { GitClient, GitEntry, GitProvider, GitRepo } from './types';

export interface RepoLocation {
  account: GitAccount;
  repo: GitRepo;
  branch: string;
  path: string;
}

export interface RepoFile extends RepoLocation {
  bytes: Uint8Array;
  version: string;
}

const supported = (name: string): boolean => ACCEPTED_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));

function modal(host: HTMLElement, className: string, title: string): { dialog: HTMLDialogElement; body: HTMLElement; close: () => void } {
  const dialog = h('dialog', { class: `dialog ${className}`, 'aria-labelledby': `${className}-title` });
  const body = h('div', { class: 'git-body' });
  dialog.append(h('h2', { id: `${className}-title` }, title), body);
  host.append(dialog);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  return {
    dialog,
    body,
    close: () => {
      dialog.close();
      dialog.remove();
    },
  };
}

/**
 * Browse repositories. In "open" mode resolves with the chosen file; in
 * "save" mode with the chosen location (folder + file name).
 */
export function browseRepository(host: HTMLElement, mode: 'open', suggestedName?: string): Promise<RepoFile | null>;
export function browseRepository(host: HTMLElement, mode: 'save', suggestedName?: string): Promise<RepoLocation | null>;
export function browseRepository(host: HTMLElement, mode: 'open' | 'save', suggestedName = ''): Promise<RepoFile | RepoLocation | null> {
  return new Promise((resolve) => {
    const { dialog, body, close } = modal(host, 'git-dialog', mode === 'open' ? t('git.dialogOpen') : t('git.dialogSave'));
    let account: GitAccount | undefined;
    let client: GitClient | undefined;
    let repo: GitRepo | undefined;
    let branch = '';
    let folder = '';
    let generation = 0;

    const status = h('p', { class: 'git-status', role: 'status', 'aria-live': 'polite' });
    const accountSelect = h('select', { 'aria-label': t('git.account') });
    const repoSelect = h('select', { 'aria-label': t('git.repository') });
    const otherRepo = h('input', { type: 'text', placeholder: t('git.otherRepo'), 'aria-label': t('git.otherRepo'), spellcheck: 'false' });
    const branchSelect = h('select', { 'aria-label': t('git.branch') });
    const crumbs = h('div', { class: 'git-crumbs', 'aria-label': t('git.folder') });
    const list = h('ul', { class: 'git-list', 'aria-label': t('git.folder') });
    const fileName = h('input', { type: 'text', value: suggestedName, 'aria-label': t('git.fileName'), spellcheck: 'false' });

    const finish = (value: RepoFile | RepoLocation | null): void => {
      generation++;
      close();
      resolve(value);
    };
    const setStatus = (text: string, error = false): void => {
      status.textContent = text;
      status.classList.toggle('error', error);
    };
    const fail = (err: unknown): void => setStatus(t('error.git', { message: (err as Error).message }), true);

    const renderAccounts = (): void => {
      const accounts = loadAccounts();
      accountSelect.replaceChildren(...accounts.map((a) => h('option', { value: a.id, selected: a.id === account?.id }, `${a.provider === 'github' ? 'GitHub' : 'GitLab'} — ${a.label}`)));
      accountSelect.disabled = !accounts.length;
      if (!accounts.length) {
        account = undefined;
        client = undefined;
        repoSelect.replaceChildren();
        branchSelect.replaceChildren();
        list.replaceChildren();
        crumbs.replaceChildren();
        setStatus(t('git.noAccount'));
        showAddForm();
      }
    };

    const selectAccount = async (id: string): Promise<void> => {
      account = loadAccounts().find((a) => a.id === id);
      if (!account) return;
      client = clientFor(account);
      const gen = ++generation;
      setStatus(t('git.loading'));
      try {
        const repos = await client.listRepos();
        if (gen !== generation) return;
        repoSelect.replaceChildren(h('option', { value: '' }, '—'), ...repos.map((r) => h('option', { value: r.id }, r.name)));
        repoSelect.dataset.repos = JSON.stringify(repos);
        setStatus('');
      } catch (err) {
        fail(err);
      }
    };

    const selectRepo = async (r: GitRepo): Promise<void> => {
      if (!client) return;
      repo = r;
      const gen = ++generation;
      setStatus(t('git.loading'));
      try {
        const branches = await client.listBranches(r.id);
        if (gen !== generation) return;
        branch = branches.includes(r.defaultBranch) ? r.defaultBranch : (branches[0] ?? r.defaultBranch);
        branchSelect.replaceChildren(...branches.map((b) => h('option', { value: b, selected: b === branch }, b)));
        await openFolder('');
      } catch (err) {
        fail(err);
      }
    };

    const openFolder = async (path: string): Promise<void> => {
      if (!client || !repo) return;
      const gen = ++generation;
      setStatus(t('git.loading'));
      try {
        const entries = await client.listDir(repo.id, branch, path);
        if (gen !== generation) return;
        folder = path;
        renderCrumbs();
        renderEntries(entries);
        setStatus(entries.length ? '' : t('git.empty'));
      } catch (err) {
        fail(err);
      }
    };

    const renderCrumbs = (): void => {
      const parts = folder ? folder.split('/') : [];
      crumbs.replaceChildren(
        button(repo?.name ?? '/', () => void openFolder(''), { className: 'link' }),
        ...parts.flatMap((part, i) => [h('span', { 'aria-hidden': 'true' }, ' / '), button(part, () => void openFolder(parts.slice(0, i + 1).join('/')), { className: 'link' })]),
      );
    };

    const renderEntries = (entries: GitEntry[]): void => {
      const items: HTMLElement[] = [];
      if (folder) items.push(h('li', {}, button(`⬑ ${t('git.up')}`, () => void openFolder(folder.split('/').slice(0, -1).join('/')), { className: 'git-entry dir' })));
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

    const openEntry = async (e: GitEntry): Promise<void> => {
      if (!client || !repo || !account) return;
      setStatus(t('git.loading'));
      try {
        const file = await client.readFile(repo.id, branch, e.path);
        finish({ account, repo, branch, path: e.path, bytes: file.bytes, version: file.version });
      } catch (err) {
        fail(err);
      }
    };

    // --- add account form ---------------------------------------------------------
    const addForm = h('form', { class: 'git-add', hidden: true });
    const showAddForm = (): void => {
      addForm.hidden = false;
      addForm.querySelector<HTMLInputElement>('input[type="password"]')?.focus();
    };
    {
      const provider = h('select', { 'aria-label': t('git.provider') }, h('option', { value: 'github' }, 'GitHub'), h('option', { value: 'gitlab' }, 'GitLab'));
      const apiUrl = h('input', { type: 'url', value: defaultApiUrl('github'), 'aria-label': t('git.apiUrl'), spellcheck: 'false' });
      const token = h('input', { type: 'password', 'aria-label': t('git.token'), autocomplete: 'off', spellcheck: 'false' });
      provider.addEventListener('change', () => {
        apiUrl.value = defaultApiUrl(provider.value as GitProvider);
      });
      const connect = h('button', { type: 'submit', class: 'primary' }, t('git.connect'));
      addForm.append(
        h('label', {}, t('git.provider'), ' ', provider),
        h('label', {}, t('git.apiUrl'), ' ', apiUrl),
        h('label', {}, t('git.token'), ' ', token),
        h('p', { class: 'hint' }, t('git.tokenHelp')),
        h('div', { class: 'dialog-actions' }, connect),
      );
      addForm.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const input = { provider: provider.value as GitProvider, apiUrl: apiUrl.value.trim(), token: token.value.trim() };
        if (!/^https:\/\//i.test(input.apiUrl) || !input.token) {
          setStatus(t('git.invalidAccount'), true);
          return;
        }
        setStatus(t('git.loading'));
        void clientFor(input)
          .listRepos()
          .then(() => {
            const created = addAccount({ ...input, label: new URL(input.apiUrl).host });
            token.value = '';
            addForm.hidden = true;
            account = created;
            renderAccounts();
            accountSelect.value = created.id;
            void selectAccount(created.id);
          })
          .catch(fail);
      });
    }

    accountSelect.addEventListener('change', () => void selectAccount(accountSelect.value));
    repoSelect.addEventListener('change', () => {
      const repos = JSON.parse(repoSelect.dataset.repos ?? '[]') as GitRepo[];
      const r = repos.find((x) => x.id === repoSelect.value);
      if (r) void selectRepo(r);
    });
    const goOther = (): void => {
      const name = otherRepo.value.trim().replace(/^https?:\/\/[^/]+\//, '').replace(/\.git$/, '');
      if (!client || !name) return;
      setStatus(t('git.loading'));
      client
        .getRepo(name)
        .then((r) => selectRepo(r))
        .catch(fail);
    };
    otherRepo.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        goOther();
      }
    });
    branchSelect.addEventListener('change', () => {
      branch = branchSelect.value;
      void openFolder(folder);
    });

    const forget = button(t('git.forget'), () => {
      if (!account || !window.confirm(t('git.forgetConfirm'))) return;
      forgetAccount(account.id);
      account = undefined;
      renderAccounts();
      const first = loadAccounts()[0];
      if (first) void selectAccount(first.id);
    });

    const actions = h('div', { class: 'dialog-actions' }, button(t('common.cancel'), () => finish(null)));
    if (mode === 'save') {
      actions.append(
        button(
          t('git.saveHere'),
          () => {
            const name = fileName.value.trim();
            if (!account || !repo || !name || name.includes('/')) {
              fileName.focus();
              return;
            }
            finish({ account, repo, branch, path: folder ? `${folder}/${name}` : name });
          },
          { className: 'primary' },
        ),
      );
    }

    body.append(
      h('div', { class: 'git-row' }, h('label', {}, t('git.account'), ' ', accountSelect), forget, button(t('git.addAccount'), showAddForm)),
      addForm,
      h('div', { class: 'git-row' }, h('label', {}, t('git.repository'), ' ', repoSelect), otherRepo, button(t('git.go'), goOther)),
      h('div', { class: 'git-row' }, h('label', {}, t('git.branch'), ' ', branchSelect)),
      crumbs,
      list,
    );
    if (mode === 'save') body.append(h('label', { class: 'git-row' }, t('git.fileName'), ' ', fileName));
    body.append(status, actions);
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(null);
    });

    renderAccounts();
    const first = loadAccounts()[0];
    if (first) {
      account = first;
      accountSelect.value = first.id;
      void selectAccount(first.id);
    }
  });
}

export interface CommitChoice {
  message: string;
  branch: string;
  /** True when `branch` must be created from the current one. */
  createBranch: boolean;
}

/** Ask for the commit message and branch (GIT-003, GIT-005). */
export function commitDialog(host: HTMLElement, path: string, branch: string, exists: boolean): Promise<CommitChoice | null> {
  return new Promise((resolve) => {
    const { dialog, body, close } = modal(host, 'commit-dialog', t('git.commitDialog'));
    const message = h('textarea', { rows: 3, 'aria-label': t('git.message'), spellcheck: 'true' });
    message.value = commitMessage(path, exists);
    const branchInput = h('input', { type: 'text', value: branch, 'aria-label': t('git.branch'), spellcheck: 'false' });
    const create = h('input', { type: 'checkbox' });
    branchInput.addEventListener('input', () => (create.checked = branchInput.value.trim() !== branch));
    const finish = (value: CommitChoice | null): void => {
      close();
      resolve(value);
    };
    body.append(
      h('p', { class: 'git-path' }, path),
      h('label', { class: 'git-field' }, t('git.message'), message),
      h('label', { class: 'git-row' }, t('git.branch'), ' ', branchInput),
      h('label', { class: 'git-row' }, create, ' ', t('git.newBranch')),
      h(
        'div',
        { class: 'dialog-actions' },
        button(t('common.cancel'), () => finish(null)),
        button(
          t('git.commit'),
          () => {
            const msg = message.value.trim();
            const b = branchInput.value.trim();
            if (!msg || !b) return;
            finish({ message: msg, branch: b, createBranch: create.checked && b !== branch });
          },
          { className: 'primary' },
        ),
      ),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(null);
    });
    message.focus();
  });
}
