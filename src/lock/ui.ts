/**
 * LOCK-001..LOCK-005: the screen that opens the lock when the application
 * starts, and the settings that set it, add passkeys, and remove it.
 */
import { button, busyText, h } from '../app/dom';
import { t } from '../i18n';
import { addPasskey, lockNow, removeLock, removePasskey, setIdleMinutes, setLock, unlockWithPasskey, unlockWithPassphrase, unlockWithRecovery } from './manager';
import { NoPrfError, passkeysAvailable } from './passkey';
import { loadLock } from './session';

const IDLE_CHOICES = [0, 5, 15, 30, 60, 240];

const idleLabel = (m: number): string => (m ? t('lock.idleMinutes', { n: m }) : t('lock.idleNever'));

/** The lock screen: resolves once the lock is open. */
export function unlockScreen(root: HTMLElement): Promise<void> {
  const record = loadLock()!;
  return new Promise((resolve) => {
    const status = h('p', { class: 'lock-status', role: 'alert' });
    const done = (): void => {
      screen.remove();
      resolve();
    };
    const fail = (message: string): void => {
      status.textContent = message;
    };
    const tryPasskey = async (): Promise<void> => {
      status.replaceChildren(...busyText(t('lock.asking')));
      try {
        await unlockWithPasskey();
        done();
      } catch (err) {
        fail(err instanceof NoPrfError ? t('lock.noPrf') : t('lock.passkeyFailed'));
      }
    };
    const phrase = h('input', { type: 'password', autocomplete: 'current-password', 'aria-label': t('lock.passphrase') });
    const recovery = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', 'aria-label': t('lock.recoveryKey'), placeholder: 'XXXX-XXXX-…' });
    const byPhrase = async (): Promise<void> => {
      status.replaceChildren(...busyText(t('lock.opening')));
      if (await unlockWithPassphrase(phrase.value)) done();
      else fail(t('lock.wrongPassphrase'));
    };
    const byRecovery = async (): Promise<void> => {
      status.replaceChildren(...busyText(t('lock.opening')));
      if (await unlockWithRecovery(recovery.value)) done();
      else fail(t('lock.wrongRecovery'));
    };
    const onEnter = (input: HTMLInputElement, go: () => Promise<void>): void =>
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') void go();
      });
    onEnter(phrase, byPhrase);
    onEnter(recovery, byRecovery);
    const recoveryBox = h('details', { class: 'lock-recovery' }, h('summary', {}, t('lock.useRecovery')), h('div', { class: 'lock-row' }, recovery, button(t('lock.unlock'), () => void byRecovery())));
    const passkeyButton = record.passkeys.length ? button(t('lock.unlockPasskey'), () => void tryPasskey(), { className: 'primary lock-main', icon: '🔑' }) : null;
    const screen = h(
      'section',
      { class: 'lock-screen', 'aria-labelledby': 'lock-title' },
      h(
        'div',
        { class: 'lock-card' },
        h('img', { src: 'icon.svg', alt: '', 'aria-hidden': 'true', width: '64', height: '64' }),
        h('h1', { id: 'lock-title' }, t('lock.locked')),
        h('p', { class: 'hint' }, t('lock.lockedHint')),
        passkeyButton,
        record.passphrase ? h('div', { class: 'lock-row' }, phrase, button(t('lock.unlock'), () => void byPhrase(), { className: record.passkeys.length ? '' : 'primary' })) : null,
        status,
        recoveryBox,
      ),
    );
    root.before(screen);
    (passkeyButton ?? phrase).focus();
  });
}

/** A dialog of the settings (on top of the window of the settings). */
function dialogOf(host: HTMLElement, title: string, ...body: (HTMLElement | null)[]): { dialog: HTMLDialogElement; close(): void } {
  const dialog = h('dialog', { class: 'dialog lock-dialog', 'aria-labelledby': 'lock-dialog-title' }, h('h2', { id: 'lock-dialog-title' }, title), ...body);
  const close = (): void => {
    dialog.close();
    dialog.remove();
  };
  dialog.addEventListener('cancel', (e) => e.preventDefault());
  host.append(dialog);
  dialog.showModal();
  return { dialog, close };
}

/** The recovery key, shown once: kept by the user before going on. */
function showRecovery(host: HTMLElement, key: string): Promise<void> {
  return new Promise((resolve) => {
    const kept = h('input', { type: 'checkbox', id: 'lock-kept' });
    const ok = button(t('common.continue'), () => {
      d.close();
      resolve();
    }, { className: 'primary' });
    ok.disabled = true;
    kept.addEventListener('change', () => (ok.disabled = !kept.checked));
    const download = button(t('lock.downloadRecovery'), () => {
      const url = URL.createObjectURL(new Blob([`${t('lock.recoveryFileText')}\n\n${key}\n`], { type: 'text/plain' }));
      const a = h('a', { href: url, download: 'recovery-key.txt' });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, { icon: '⇩' });
    const copy = button(t('lock.copyRecovery'), () => void navigator.clipboard?.writeText(key).catch(() => undefined), { icon: '⧉' });
    const d = dialogOf(
      host,
      t('lock.recoveryTitle'),
      h('p', {}, t('lock.recoveryHint')),
      h('p', { class: 'lock-recovery-key', tabindex: '0', 'aria-label': t('lock.recoveryKey') }, key),
      h('div', { class: 'dialog-actions' }, copy, download),
      h('div', { class: 'settings-field check' }, kept, h('label', { for: 'lock-kept' }, t('lock.recoveryKept'))),
      h('div', { class: 'dialog-actions' }, ok),
    );
  });
}

/** The settings of the lock (LOCK-001..LOCK-005), drawn again after each change. */
export function lockSettings(): HTMLElement[] {
  const box = h('div', { class: 'lock-settings' });
  const render = (): void => {
    const record = loadLock();
    const status = h('p', { class: 'hint', role: 'status' });
    const busy = (text: string): void => status.replaceChildren(...busyText(text));
    const run = async (task: () => Promise<void>, message: string): Promise<void> => {
      busy(message);
      try {
        await task();
        render();
      } catch (err) {
        status.textContent = err instanceof NoPrfError ? t('lock.noPrf') : (err as Error).message;
      }
    };
    const idle = h('select', { id: 'lock-idle' }, ...IDLE_CHOICES.map((m) => h('option', { value: String(m), selected: m === (record?.idleMinutes ?? 15) }, idleLabel(m))));
    if (!record) {
      const phrase = h('input', { type: 'password', autocomplete: 'new-password', 'aria-label': t('lock.passphrase'), placeholder: t('lock.passphraseHint') });
      const set = async (choice: { passkey?: string; passphrase?: string }): Promise<void> => {
        if (!window.confirm(t('lock.confirmSet'))) return;
        const recovery = await setLock({ ...choice, idleMinutes: Number(idle.value) }, (n) => busy(t('lock.sealing', { n })));
        await showRecovery(document.body, recovery);
      };
      box.replaceChildren(
        h('p', {}, t('lock.intro')),
        h('div', { class: 'settings-field' }, h('label', { for: 'lock-idle' }, t('lock.idle')), idle),
        passkeysAvailable()
          ? h('div', { class: 'settings-field' }, button(t('lock.setPasskey'), () => void run(() => set({ passkey: t('lock.passkeyName') }), t('lock.asking')), { className: 'primary', icon: '🔑' }), h('p', { class: 'hint' }, t('lock.setPasskeyHint')))
          : h('p', { class: 'hint' }, t('lock.noPasskeys')),
        h('div', { class: 'settings-field' }, h('div', { class: 'lock-row' }, phrase, button(t('lock.setPassphrase'), () => {
          if (phrase.value.length < 12) {
            status.textContent = t('lock.shortPassphrase');
            return;
          }
          void run(() => set({ passphrase: phrase.value }), t('lock.sealing', { n: 0 }));
        })), h('p', { class: 'hint' }, t('lock.setPassphraseHint'))),
        status,
      );
      return;
    }
    idle.addEventListener('change', () => {
      setIdleMinutes(Number(idle.value));
      status.textContent = t('lock.idleSaved');
    });
    box.replaceChildren(
      h('p', {}, record.passkeys.length ? t('lock.setWithPasskeys', { n: record.passkeys.length }) : t('lock.setWithPassphrase')),
      record.passkeys.length
        ? h(
            'ul',
            { class: 'lock-passkeys' },
            ...record.passkeys.map((p) =>
              h(
                'li',
                {},
                h('span', {}, `🔑 ${p.name}`),
                h('span', { class: 'hint' }, new Date(p.created).toLocaleDateString(document.documentElement.lang || undefined)),
                record.passkeys.length > 1 || record.passphrase ? button(t('lock.removePasskey', { name: p.name }), () => void run(async () => removePasskey(p.id), ''), { text: '🗑' }) : '',
              ),
            ),
          )
        : '',
      passkeysAvailable() ? button(t('lock.addPasskey'), () => void run(() => addPasskey(t('lock.passkeyName')), t('lock.asking')), { icon: '＋' }) : '',
      h('div', { class: 'settings-field' }, h('label', { for: 'lock-idle' }, t('lock.idle')), idle),
      h('div', { class: 'dialog-actions lock-actions' }, button(t('lock.lockNow'), () => lockNow(), { icon: '🔒' }), button(t('lock.remove'), () => {
        if (window.confirm(t('lock.confirmRemove'))) void run(() => removeLock(() => busy(t('lock.opening'))), t('lock.opening'));
      }, { className: 'danger' })),
      status,
    );
  };
  render();
  return [box];
}
