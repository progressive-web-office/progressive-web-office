/** GIT-017: committing in a Git working copy opened from disk. */
import { button, h } from '../app/dom';
import { t } from '../i18n';

export interface LocalCommitChoice {
  message: string;
  paths: string[];
  /** Saving no longer asks to commit in this folder. */
  stopAsking: boolean;
}

/**
 * The message and the files of a commit; resolves to null for "Not now".
 * `askAgain`: shown after a save, with the choice to stop asking.
 */
export function localCommitDialog(host: HTMLElement, opts: { branch: string; message: string; files: { path: string; status: string }[]; afterSave?: boolean }): Promise<LocalCommitChoice | null> {
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'dialog commit-dialog', 'aria-labelledby': 'local-commit-title' });
    const message = h('textarea', { rows: 3, 'aria-label': t('git.message'), spellcheck: 'true' });
    message.value = opts.message;
    const boxes = opts.files.map((f) => {
      const box = h('input', { type: 'checkbox', checked: true, value: f.path });
      return { f, box, row: h('label', { class: 'git-row' }, box, ` ${f.path} `, h('small', { class: 'hint' }, t(`gitwc.status.${f.status}` as 'gitwc.status.new'))) };
    });
    const stop = h('input', { type: 'checkbox' });
    const finish = (value: LocalCommitChoice | null): void => {
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    const commit = (): void => {
      const msg = message.value.trim();
      const paths = boxes.filter((b) => b.box.checked).map((b) => b.f.path);
      if (!msg || !paths.length) return;
      finish({ message: msg, paths, stopAsking: stop.checked });
    };
    dialog.append(
      h('h2', { id: 'local-commit-title' }, t('gitwc.commitTitle', { branch: opts.branch })),
      h('p', { class: 'hint' }, t('gitwc.commitHint')),
      h('label', { class: 'git-field' }, t('git.message'), message),
      h('fieldset', { class: 'git-files' }, h('legend', {}, t('gitwc.files')), ...boxes.map((b) => b.row)),
      ...(opts.afterSave ? [h('label', { class: 'git-row' }, stop, ` ${t('gitwc.stopAsking')}`)] : []),
      h('div', { class: 'dialog-actions' }, button(t('gitwc.notNow'), () => finish(null)), button(t('git.commit'), commit, { className: 'primary' })),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(null);
    });
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    message.focus();
  });
}

const ASK_KEY = 'pwo.gitwc.noAsk';

/** Whether saving in this folder asks to commit (on by default). */
export function asksToCommit(folderId: string): boolean {
  try {
    return !(JSON.parse(localStorage.getItem(ASK_KEY) ?? '[]') as string[]).includes(folderId);
  } catch {
    return true;
  }
}

export function setAsksToCommit(folderId: string, ask: boolean): void {
  try {
    const list = (JSON.parse(localStorage.getItem(ASK_KEY) ?? '[]') as string[]).filter((id) => id !== folderId);
    if (!ask) list.push(folderId);
    localStorage.setItem(ASK_KEY, JSON.stringify(list));
  } catch {
    /* not kept */
  }
}
