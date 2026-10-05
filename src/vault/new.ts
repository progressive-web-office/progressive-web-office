/** VAULT-001: the name and master password of a new vault, the password typed twice. */
import { button, h } from '../app/dom';
import { t } from '../i18n';
import { entropyBits } from './generator';

export function askMasterPassword(host: HTMLElement): Promise<{ name: string; password: string } | null> {
  return new Promise((resolve) => {
    const name = h('input', { type: 'text', value: t('pw.defaultName'), 'aria-label': t('pw.name') });
    const first = h('input', { type: 'password', autocomplete: 'new-password', 'aria-label': t('pw.master') });
    const again = h('input', { type: 'password', autocomplete: 'new-password', 'aria-label': t('pw.masterAgain') });
    const error = h('p', { class: 'vault-error', role: 'alert' });
    const strength = h('p', { class: 'hint' });
    first.addEventListener('input', () => (strength.textContent = first.value ? t('pw.strength', { n: entropyBits(first.value) }) : ''));
    const dialog = h('dialog', { class: 'dialog', 'aria-labelledby': 'vault-new-title' });
    const close = (value: { name: string; password: string } | null): void => {
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    const ok = (): void => {
      if (first.value.length < 10) return void (error.textContent = t('pw.shortMaster'));
      if (first.value !== again.value) return void (error.textContent = t('pw.mismatch'));
      close({ name: name.value.trim().replace(/[\\/:*?"<>|]/g, '-') || t('pw.defaultName'), password: first.value });
    };
    const field = (label: string, el: HTMLElement): HTMLElement => h('label', { class: 'vault-field' }, h('span', {}, label), el);
    dialog.append(
      h('h2', { id: 'vault-new-title' }, t('pw.newTitle')),
      h('p', { class: 'hint' }, t('pw.newHint')),
      field(t('pw.name'), name),
      field(t('pw.master'), first),
      strength,
      field(t('pw.masterAgain'), again),
      error,
      h('div', { class: 'dialog-actions' }, button(t('common.cancel'), () => close(null)), button(t('pw.create'), ok, { className: 'primary' })),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      close(null);
    });
    host.append(dialog);
    dialog.showModal();
    first.focus();
  });
}
