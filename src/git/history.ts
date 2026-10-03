/**
 * VER-002, VER-003: the history of a file of a repository — its commits,
 * newest first, each compared with the one before or with the document as it
 * is now, opened, or restored (a new commit putting it back, the history
 * kept as it is).
 */
import { button, h } from '../app/dom';
import { t } from '../i18n';
import type { GitClient, GitCommit } from './types';

export type HistoryChoice = { action: 'open' | 'restore'; commit: GitCommit; bytes: Uint8Array } | null;

export interface HistorySource {
  client: GitClient;
  repo: string;
  branch: string;
  path: string;
  /** The document as it is now (unsaved changes included). */
  current(): Promise<Uint8Array>;
}

const when = (iso: string): string => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');

export function historyDialog(host: HTMLElement, src: HistorySource): Promise<HistoryChoice> {
  return new Promise((resolve) => {
    const name = src.path.slice(src.path.lastIndexOf('/') + 1);
    const dialog = h('dialog', { class: 'dialog history-dialog', 'aria-labelledby': 'history-title' });
    const status = h('p', { class: 'git-status', role: 'status', 'aria-live': 'polite' }, t('git.loading'));
    const list = h('ol', { class: 'history-list' });
    const finish = (choice: HistoryChoice): void => {
      dialog.close();
      dialog.remove();
      resolve(choice);
    };
    const read = (c: GitCommit): Promise<Uint8Array> => src.client.readFile(src.repo, c.id, src.path).then((f) => f.bytes);
    const fail = (err: unknown): void => {
      status.textContent = t('error.git', { message: (err as Error).message });
      status.classList.add('error');
    };
    const compare = async (before: { label: string; bytes: () => Promise<Uint8Array> }, after: { label: string; bytes: () => Promise<Uint8Array> }): Promise<void> => {
      status.textContent = t('git.loading');
      status.classList.remove('error');
      try {
        const [{ versionView }, { showDiff }] = await Promise.all([import('../diff/views'), import('../diff/ui')]);
        const [a, b] = await Promise.all([before.bytes().then((x) => versionView(name, x)), after.bytes().then((x) => versionView(name, x))]);
        status.textContent = '';
        await showDiff(host, t('diff.title', { name }), [before.label, after.label], a, b);
      } catch (err) {
        fail(err);
      }
    };
    const label = (c: GitCommit): string => `${c.id.slice(0, 7)} · ${when(c.date)}`;
    src.client
      .listCommits(src.repo, src.branch, src.path)
      .then((commits) => {
        status.textContent = commits.length ? t('history.count', { n: commits.length, branch: src.branch }) : t('history.none');
        list.replaceChildren(
          ...commits.map((c, i) => {
            const previous = commits[i + 1];
            return h(
              'li',
              {},
              h('div', { class: 'history-what' }, h('strong', {}, c.message || '—'), h('span', { class: 'hint' }, ` — ${c.author}, ${when(c.date)} · `, h('code', {}, c.id.slice(0, 7)))),
              h(
                'div',
                { class: 'history-actions' },
                previous ? button(t('history.compareBefore'), () => void compare({ label: label(previous), bytes: () => read(previous) }, { label: label(c), bytes: () => read(c) })) : h('span', { class: 'hint' }, t('history.first')),
                button(t('history.compareNow'), () => void compare({ label: label(c), bytes: () => read(c) }, { label: t('history.now'), bytes: () => src.current() })),
                button(t('history.open'), () => void read(c).then((bytes) => finish({ action: 'open', commit: c, bytes }), fail)),
                i > 0
                  ? button(t('history.restore'), () => {
                      if (!window.confirm(t('history.restoreConfirm', { name, when: when(c.date) }))) return;
                      void read(c).then((bytes) => finish({ action: 'restore', commit: c, bytes }), fail);
                    })
                  : h('span', { class: 'hint' }, t('history.latest')),
              ),
            );
          }),
        );
      })
      .catch(fail);
    dialog.append(
      h('h2', { id: 'history-title' }, t('history.title', { name })),
      h('p', { class: 'hint' }, t('history.hint')),
      status,
      list,
      h('div', { class: 'dialog-actions' }, button(t('common.close'), () => finish(null))),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(null);
    });
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  });
}
