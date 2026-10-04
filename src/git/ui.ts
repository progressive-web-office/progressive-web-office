/** Repository browser and commit dialogs (GIT-001..GIT-006). */
import { button, h } from '../app/dom';
import { ACCEPTED_EXTENSIONS } from '../core/format';
import { t } from '../i18n';
import { repoInfo } from './info';
import { addAccount, clientFor, commitMessage, defaultApiUrl, forgetAccount, isRemembered, loadAccounts, type GitAccount } from './accounts';
import type { GitClient, GitEntry, GitProvider, GitRepo } from './types';
import { apiUrlFor, hostOfApi, parseRepoAddress, providerName, tokenPage, type RepoAddress } from './url';
import { isDiffable, orderForGit, preferDiffable, withExtension } from './diffable';

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
export function browseRepository(host: HTMLElement, mode: 'open', suggestedName?: string, extensions?: string[], startAt?: string): Promise<RepoFile | RepoLocation | null>;
export function browseRepository(host: HTMLElement, mode: 'save', suggestedName?: string, extensions?: string[]): Promise<RepoLocation | null>;
/** FOLDER-007, GIT-008: a repository and a branch to open as a folder. */
export function browseRepository(host: HTMLElement, mode: 'folder'): Promise<RepoLocation | null>;
export function browseRepository(host: HTMLElement, mode: 'open' | 'save' | 'folder', suggestedName = '', extensions: string[] = [], startAt = ''): Promise<RepoFile | RepoLocation | null> {
  return new Promise((resolve) => {
    const { dialog, body, close } = modal(host, 'git-dialog', mode === 'open' ? t('git.dialogOpen') : mode === 'folder' ? t('git.dialogFolder') : t('git.dialogSave'));
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
    // GIT-013: who can see the repository, and who works on it.
    const info = h('div', { class: 'git-repo-info', hidden: true });
    const list = h('ul', { class: 'git-list', 'aria-label': t('git.folder') });
    // GIT-010: a text format, which Git can compare, is proposed first.
    const fileName = h('input', { type: 'text', value: preferDiffable(suggestedName, extensions), 'aria-label': t('git.fileName'), spellcheck: 'false' });
    const address = h('input', { type: 'url', placeholder: 'https://github.com/owner/repository', 'aria-label': t('git.address'), spellcheck: 'false', autocomplete: 'url' });
    /** An address waiting for its account to be added. */
    let pending: RepoAddress | undefined;
    /** GIT-008: what the address was understood as. */
    const understood = h('p', { class: 'git-understood', role: 'status', hidden: true });
    let lastAddress = '';

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
      accountSelect.replaceChildren(...accounts.map((a) => h('option', { value: a.id, selected: a.id === account?.id }, `${providerName(a.provider)} — ${a.label}${isRemembered(a.id) ? '' : ` (${t('git.sessionOnly')})`}`)));
      accountSelect.disabled = !accounts.length;
      if (!accounts.length) {
        account = undefined;
        client = undefined;
        repoSelect.replaceChildren();
        branchSelect.replaceChildren();
        list.replaceChildren();
        crumbs.replaceChildren();
        // GIT-008: the address comes first; a token only for a private repository or to save.
        setStatus(t('git.noAccountYet'));
      }
    };

    const selectAccount = async (id: string): Promise<void> => {
      account = loadAccounts().find((a) => a.id === id);
      if (!account) return;
      client = clientFor(account);
      clearRepo();
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

    /** Nothing of the repository shown before stays on screen while another loads (or fails to). */
    const clearRepo = (): void => {
      repo = undefined;
      folder = '';
      branchSelect.replaceChildren();
      crumbs.replaceChildren();
      list.replaceChildren();
      info.replaceChildren();
      info.hidden = true;
      if (asFolder) asFolder.hidden = true;
    };

    const selectRepo = async (r: GitRepo, at?: RepoAddress): Promise<void> => {
      if (!client) return;
      clearRepo();
      repo = r;
      info.hidden = false;
      info.replaceChildren(repoInfo(client, r, !!account?.token && !account.id.startsWith('public:')));
      if (asFolder) asFolder.hidden = false;
      const gen = ++generation;
      setStatus(t('git.loading'));
      try {
        const branches = await client.listBranches(r.id);
        if (gen !== generation) return;
        if (!branches.length) {
          // GIT-011: an empty repository (just created): nothing to open, a first file to save.
          branch = r.defaultBranch;
          branchSelect.replaceChildren(h('option', { value: branch, selected: true }, branch));
          folder = '';
          renderCrumbs();
          list.replaceChildren();
          setStatus(t(mode === 'open' ? 'git.emptyRepoOpen' : 'git.emptyRepoSave'));
          if (mode === 'save' && at?.isFile && at.inside) fileName.value = at.inside.slice(at.inside.lastIndexOf('/') + 1);
          return;
        }
        const wanted = at?.branch && branches.includes(at.branch) ? at.branch : r.defaultBranch;
        branch = branches.includes(wanted) ? wanted : (branches[0] ?? wanted);
        branchSelect.replaceChildren(...branches.map((b) => h('option', { value: b, selected: b === branch }, b)));
        const inside = at?.inside ?? '';
        if (at?.isFile) {
          const slash = inside.lastIndexOf('/');
          const name = inside.slice(slash + 1);
          if (mode === 'open') {
            if (supported(name)) return void (await openEntry({ name, path: inside, type: 'file' }));
          } else if (mode === 'save') fileName.value = name;
          await openFolder(slash < 0 ? '' : inside.slice(0, slash));
        } else await openFolder(inside);
      } catch (err) {
        if (gen === generation) clearRepo();
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
        } else if (mode === 'save') {
          items.push(h('li', {}, button(`📄 ${e.name}`, () => (fileName.value = e.name), { className: 'git-entry file' })));
        } else {
          items.push(h('li', { class: 'git-entry file' }, `📄 ${e.name}`));
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
    const provider = h('select', { 'aria-label': t('git.provider') }, h('option', { value: 'github' }, 'GitHub'), h('option', { value: 'gitlab' }, 'GitLab'), h('option', { value: 'gitea' }, providerName('gitea')));
    const apiUrl = h('input', { type: 'url', value: defaultApiUrl('github'), 'aria-label': t('git.apiUrl'), spellcheck: 'false' });
    const howTo = h('details', { class: 'git-token-help' });
    // GIT-009: how to make a token, for the service and the site chosen.
    const renderHowTo = (): void => fillTokenHelp(howTo, provider.value as GitProvider, apiUrl.value);
    const showAddForm = (): void => {
      addForm.hidden = false;
      renderHowTo();
      addForm.querySelector<HTMLInputElement>('input[type="password"]')?.focus();
    };
    {
      const token = h('input', { type: 'password', 'aria-label': t('git.token'), autocomplete: 'off', spellcheck: 'false' });
      // GIT-012: the token kept in this browser (the default), or until the application is closed.
      const remember = h('input', { type: 'checkbox', checked: true });
      provider.addEventListener('change', () => {
        apiUrl.value = defaultApiUrl(provider.value as GitProvider);
        renderHowTo();
      });
      apiUrl.addEventListener('change', renderHowTo);
      const connect = h('button', { type: 'submit', class: 'primary' }, t('git.connect'));
      addForm.append(
        h('label', {}, t('git.provider'), ' ', provider),
        h('label', {}, t('git.apiUrl'), ' ', apiUrl),
        h('label', {}, t('git.token'), ' ', token),
        h('label', { class: 'git-remember' }, remember, ` ${t('git.remember')}`),
        h('p', { class: 'hint' }, t('git.tokenHelp')),
        howTo,
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
            const created = addAccount({ ...input, label: new URL(input.apiUrl).host }, { remember: remember.checked });
            token.value = '';
            addForm.hidden = true;
            account = created;
            renderAccounts();
            accountSelect.value = created.id;
            const at = pending;
            pending = undefined;
            setStatus(t(remember.checked ? 'git.tokenRemembered' : 'git.tokenSession'));
            void (at ? openAddress(at) : selectAccount(created.id));
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

    /** GIT-008: open the repository of an address with the account of its site, or ask for one. */
    const openAddress = async (at: RepoAddress): Promise<void> => {
      clearRepo();
      const [owner, ...rest] = at.path.split('/');
      understood.hidden = false;
      understood.textContent = `✓ ${t('git.understood', { service: `${providerName(at.provider)} (${at.host})`, owner: owner ?? '', repo: rest.join('/') })}${at.branch ? ` · ${t('git.branch')} ${at.branch}` : ''}${at.inside ? ` · ${at.inside}` : ''}`;
      otherRepo.value = at.path;
      provider.value = at.provider;
      apiUrl.value = apiUrlFor(at.provider, at.host);
      const same = (a: GitAccount): boolean => a.provider === at.provider && (a.apiUrl.replace(/\/+$/, '') === at.apiUrl || hostOfApi(a.apiUrl) === at.host);
      const found = loadAccounts().find(same);
      if (found && found.id !== account?.id) {
        account = found;
        accountSelect.value = found.id;
        void selectAccount(found.id);
      }
      // Without an account of the site, a public repository opens anyway (read only, no token).
      const using: GitAccount = found ?? { id: `public:${at.host}`, provider: at.provider, apiUrl: at.apiUrl, token: '', label: t('git.publicAccess', { site: at.host }) };
      client = clientFor(using);
      setStatus(t('git.loading'));
      try {
        const r = await client.getRepo(at.path);
        account = using;
        await selectRepo(r, at);
        if (!found) {
          setStatus(t('git.openedPublic'));
          // GIT-012: a token for this site, to save here; the repository opens again with it.
          status.append(' ', button(`🔑 ${t('git.addToken')}`, () => {
            pending = at;
            showAddForm();
          }, { className: 'link' }));
        }
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (!found && (status === 404 || status === 401 || status === 403)) {
          // Private (or missing): an account of the site is needed, its form filled in.
          pending = at;
          client = undefined;
          setStatus(t('git.needAccountPrivate', { site: at.host, repo: at.path }));
          showAddForm();
          return;
        }
        if (found && status === 404) return setStatus(t('git.noAccess', { repo: at.path }), true);
        fail(err);
      }
    };
    const goAddress = (): void => {
      const text = address.value.trim();
      if (!text) return;
      const at = parseRepoAddress(text);
      if (at) return void openAddress(at);
      // `owner/name` alone: a repository of the account chosen.
      if (/^[^\s/]+(\/[^\s/]+)+$/.test(text) && client) {
        otherRepo.value = text;
        return goOther();
      }
      setStatus(t('git.badAddress'), true);
    };
    // Pasted or typed: understood and opened at once (no need to press Go).
    let typing: ReturnType<typeof setTimeout> | undefined;
    address.addEventListener('input', () => {
      clearTimeout(typing);
      typing = setTimeout(() => {
        const text = address.value.trim();
        if (text === lastAddress || !parseRepoAddress(text)) return;
        lastAddress = text;
        goAddress();
      }, 350);
    });
    address.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        goAddress();
      }
    });
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

    // GIT-013: the whole repository, as a folder with its tree.
    const asFolder = mode === 'open' ? button(t('git.openAsFolderButton'), () => {
      if (!account || !repo) return void address.focus();
      finish({ account, repo, branch, path: '' });
    }) : undefined;
    if (asFolder) {
      asFolder.hidden = true;
      actions.append(asFolder);
    }

    if (mode === 'folder') {
      actions.append(
        button(
          t('git.openAsFolder'),
          () => {
            if (!account || !repo) return void address.focus();
            finish({ account, repo, branch, path: '' });
          },
          { className: 'primary' },
        ),
      );
    }

    body.append(
      h('div', { class: 'git-row git-address' }, h('label', {}, t('git.address'), ' ', address), button(t('git.go'), goAddress, { className: 'primary' })),
      understood,
      h('p', { class: 'hint' }, t('git.addressHint')),
      h('div', { class: 'git-row' }, h('label', {}, t('git.account'), ' ', accountSelect), forget, button(t('git.addAccount'), showAddForm)),
      addForm,
      h('div', { class: 'git-row' }, h('label', {}, t('git.repository'), ' ', repoSelect), otherRepo, button(t('git.go'), goOther)),
      h('div', { class: 'git-row' }, h('label', {}, t('git.branch'), ' ', branchSelect)),
      info,
      crumbs,
      list,
    );
    if (mode === 'save') {
      body.append(h('label', { class: 'git-row' }, t('git.fileName'), ' ', fileName));
      const { text, binary } = orderForGit(extensions);
      if (text.length || binary.length) {
        // GIT-010: the format, text ones first; a binary one stays possible.
        const format = h(
          'select',
          { 'aria-label': t('git.format') },
          ...(text.length ? [h('optgroup', { label: t('git.formatText') }, ...text.map((e) => h('option', { value: e }, `.${e}`)))] : []),
          ...(binary.length ? [h('optgroup', { label: t('git.formatBinary') }, ...binary.map((e) => h('option', { value: e }, `.${e}`)))] : []),
        );
        const warn = h('p', { class: 'hint git-binary-hint' });
        const sync = (): void => {
          const ext = fileName.value.includes('.') ? fileName.value.slice(fileName.value.lastIndexOf('.') + 1).toLowerCase() : '';
          if ([...text, ...binary].includes(ext)) format.value = ext;
          warn.textContent = isDiffable(ext) ? t('git.formatTextHint') : text.length ? t('git.formatBinaryHint', { ext: `.${text.find((e) => e !== 'jl' && e !== 'py') ?? text[0]}` }) : t('git.formatNoText');
        };
        format.addEventListener('change', () => {
          fileName.value = withExtension(fileName.value.trim() || 'document', format.value);
          sync();
        });
        fileName.addEventListener('input', sync);
        sync();
        body.append(h('label', { class: 'git-row' }, t('git.format'), ' ', format), warn);
      }
    }
    body.append(status, actions);
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(null);
    });

    renderAccounts();
    const first = loadAccounts()[0];
    // FILE-028: a remembered repository opens at once, with the account of its site (or read only).
    const remembered = startAt ? parseRepoAddress(startAt) : undefined;
    if (remembered) {
      address.value = startAt;
      lastAddress = startAt;
      void openAddress(remembered);
    } else if (first) {
      account = first;
      accountSelect.value = first.id;
      void selectAccount(first.id);
    }
    address.focus();
  });
}

/** GIT-009: how to make a token, for the service and the site of an API address. */
function fillTokenHelp(howTo: HTMLElement, kind: GitProvider, api: string): void {
  let site: string;
  try {
    site = hostOfApi(api.trim());
  } catch {
    site = kind === 'github' ? 'github.com' : kind === 'gitea' ? 'codeberg.org' : 'gitlab.com';
  }
  const page = tokenPage(kind, site);
  const steps =
    kind === 'github'
      ? (['git.howGithub1', 'git.howGithub2', 'git.howGithub3', 'git.howGithub4', 'git.howGithub5'] as const)
      : kind === 'gitea'
        ? (['git.howGitea1', 'git.howGitea2', 'git.howGitea3', 'git.howGitea4'] as const)
        : (['git.howGitlab1', 'git.howGitlab2', 'git.howGitlab3', 'git.howGitlab4'] as const);
  howTo.replaceChildren(
    h('summary', {}, t('git.howTitle')),
    h('ol', {}, ...steps.map((k, i) => h('li', {}, ...(i === 0 ? [t(k), ' ', h('a', { href: page, target: '_blank', rel: 'noopener noreferrer' }, page)] : [t(k)])))),
    h('p', { class: 'hint' }, t('git.howSafety')),
    // The full guide: classic tokens, organisations, self-managed sites, what goes wrong.
    h('p', {}, h('a', { href: new URL('docs/guide/git.html#creating-a-personal-access-token-pat-forge-by-forge', document.baseURI).href, target: '_blank', rel: 'noopener' }, t('git.howMore'))),
  );
}

/**
 * GIT-012: a token for the site of a repository opened without one, asked
 * when saving there; it is checked on the repository, then remembered in this
 * browser (or kept until the application is closed).
 */
export function askToken(host: HTMLElement, base: Pick<GitAccount, 'provider' | 'apiUrl'>, repo: string, purpose: 'save' | 'read' = 'save'): Promise<GitAccount | null> {
  return new Promise((resolve) => {
    const site = (() => {
      try {
        return hostOfApi(base.apiUrl);
      } catch {
        return base.apiUrl;
      }
    })();
    const { dialog, body, close } = modal(host, 'git-token-dialog', t(purpose === 'read' ? 'git.tokenReadTitle' : 'git.tokenTitle'));
    const token = h('input', { type: 'password', 'aria-label': t('git.token'), autocomplete: 'off', spellcheck: 'false' });
    const remember = h('input', { type: 'checkbox', checked: true });
    const howTo = h('details', { class: 'git-token-help', open: true });
    fillTokenHelp(howTo, base.provider, base.apiUrl);
    const status = h('p', { class: 'git-status', role: 'status', 'aria-live': 'polite' });
    const done = (value: GitAccount | null): void => {
      close();
      resolve(value);
    };
    const save = async (): Promise<void> => {
      const value = token.value.trim();
      if (!value) return void token.focus();
      status.textContent = t('git.loading');
      status.classList.remove('error');
      try {
        // The token must reach this repository.
        await clientFor({ ...base, token: value }).getRepo(repo);
      } catch (err) {
        status.textContent = t('error.git', { message: (err as Error).message });
        status.classList.add('error');
        return;
      }
      done(addAccount({ ...base, token: value, label: site }, { remember: remember.checked }));
    };
    token.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void save();
      }
    });
    body.append(
      h('p', {}, t(purpose === 'read' ? 'git.tokenReadWhy' : 'git.tokenWhy', { repo, site })),
      h('label', { class: 'git-row' }, t('git.token'), ' ', token),
      h('label', { class: 'git-remember' }, remember, ` ${t('git.remember')}`),
      howTo,
      status,
      h('div', { class: 'dialog-actions' }, button(t('common.cancel'), () => done(null)), button(t('git.connect'), () => void save(), { className: 'primary' })),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      done(null);
    });
    token.focus();
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
