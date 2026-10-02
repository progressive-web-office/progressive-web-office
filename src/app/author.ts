/**
 * The user's name (SET-003), set once in the settings or asked the first time
 * it is needed: it signs comments, annotations and tracked changes (REV-001,
 * PDF-018) and shows the user in a collaboration (COLLAB-003).
 */

import { t } from '../i18n';

const AUTHOR_KEY = 'pwo.comments.author';

/** The name chosen once, else ''. */
export function commentAuthor(): string {
  try {
    return localStorage.getItem(AUTHOR_KEY) ?? '';
  } catch {
    return '';
  }
}

/** Event sent on `window` when the name changes (a running collaboration shows it at once). */
export const NAME_CHANGED = 'pwo:name-changed';

/**
 * The name, asked once with `question` when there is none — in a window of
 * the page, not the browser's prompt, which would freeze the page (and stop
 * a collaboration from talking to the others) while it is open.
 */
export async function askAuthor(question: string): Promise<string> {
  const known = commentAuthor();
  if (known) return known;
  const name = await askName(question);
  if (name) saveAuthor(name);
  return name;
}

function askName(question: string): Promise<string> {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'dialog name-dialog';
    dialog.setAttribute('aria-label', question);
    const form = document.createElement('form');
    form.method = 'dialog';
    const label = document.createElement('label');
    label.textContent = question;
    const input = document.createElement('input');
    input.type = 'text';
    input.autocomplete = 'name';
    input.maxLength = 60;
    label.append(input);
    const actions = document.createElement('div');
    actions.className = 'dialog-actions';
    const skip = document.createElement('button');
    skip.type = 'button';
    skip.textContent = t('common.cancel');
    const ok = document.createElement('button');
    ok.type = 'submit';
    ok.className = 'primary';
    ok.textContent = t('common.ok');
    actions.append(skip, ok);
    form.append(label, actions);
    dialog.append(form);
    let value = '';
    form.addEventListener('submit', () => (value = input.value.trim()));
    skip.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(value);
    });
    document.body.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    input.focus();
  });
}

/** Set the name (the settings window); an empty name is asked again when needed. */
export function saveAuthor(name: string): void {
  const value = name.trim();
  try {
    if (value) localStorage.setItem(AUTHOR_KEY, value);
    else localStorage.removeItem(AUTHOR_KEY);
  } catch {
    /* storage unavailable */
  }
  if (value) window.dispatchEvent(new CustomEvent(NAME_CHANGED, { detail: value }));
}
