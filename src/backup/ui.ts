/**
 * BACKUP-001..BACKUP-005: the backup window — the last backup always told,
 * where backups go, how often to be reminded, a password — and restoring a
 * backup, all of it or file by file.
 */
import { busyText, button, h } from '../app/dom';
import { t } from '../i18n';
import { formatSize } from '../fs';
import { backupName, buildArchive, BackupError, isEncryptedBackup, openArchive, type Backup } from './archive';
import { browserSources, collectBackup, restoreBackup, type RestoreResult } from './browser';
import { lastBackupText } from './text';
import { backupDue, daysSinceBackup, loadBackupSettings, saveBackupSettings, type BackupSettings, type BackupTarget } from './settings';
import { downloadBackup, listBackups, readBackup, storeBackup, targetPlace } from './targets';

/** A password typed this session, so that scheduled backups need it once. */
let sessionPassword: string | undefined;

/** An hour, in days (BACKUP-006: backups made by themselves can be that frequent). */
const HOUR = 1 / 24;

function targets(): { value: BackupTarget; label: string }[] {
  const out: { value: BackupTarget; label: string }[] = [{ value: 'download', label: t('backup.toDownload') }];
  if (typeof (globalThis as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function') out.push({ value: 'folder', label: t('backup.toFolder') });
  return out;
}

async function davTargets(): Promise<{ value: BackupTarget; label: string }[]> {
  const { loadDavAccounts, davLabel } = await import('../webdav/ui');
  return loadDavAccounts().map((a) => ({ value: `webdav:${a.id}` as BackupTarget, label: `☁ ${davLabel(a)}` }));
}

/** Make a backup now, where the settings say; the settings with the new last backup. */
export async function backUpNow(s: BackupSettings, password: string | undefined, progress: (text: string) => void = () => undefined, ask = true): Promise<BackupSettings> {
  const place = s.target === 'download' ? null : await targetPlace(s.target, ask);
  if (s.target !== 'download' && !place) throw new Error(t('backup.noPlace'));
  progress(t('backup.collecting'));
  const sources = await browserSources();
  const collected = await collectBackup(sources.files, sources.records);
  progress(t('backup.packing', { n: collected.files.length }));
  const now = new Date();
  const bytes = await buildArchive({ ...collected, ...(s.encrypt && password ? { password } : {}), createdAt: now });
  const name = backupName(now);
  if (place) await storeBackup(place, name, bytes, now);
  else downloadBackup(name, bytes);
  const next: BackupSettings = { ...s, last: { at: now.getTime(), target: s.target, name, size: bytes.length, files: collected.files.length } };
  saveBackupSettings(next);
  return next;
}

/**
 * BACKUP-006: a backup made by itself, when one is due, to a folder or a
 * cloud reachable without asking (and, encrypted, once the password was
 * typed this session). The new settings, or why none was made.
 */
export async function autoBackup(now = Date.now()): Promise<BackupSettings | 'not-due' | 'off' | 'password' | 'unreachable'> {
  const s = loadBackupSettings();
  if (!s.auto || s.target === 'download') return 'off';
  if (!backupDue(s, now)) return 'not-due';
  if (s.encrypt && !sessionPassword) return 'password';
  try {
    return await backUpNow(s, s.encrypt ? sessionPassword : undefined, () => undefined, false);
  } catch {
    return 'unreachable';
  }
}

/** The backup window; resolves when it is closed. */
export function backupDialog(host: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    let settings = loadBackupSettings();
    const last = h('p', { class: 'backup-last', role: 'status' });
    const status = h('p', { class: 'hint', role: 'status', 'aria-live': 'polite' });
    const error = h('p', { class: 'error', role: 'alert', hidden: true });
    const where = h('select', { 'aria-label': t('backup.where') });
    const every = h(
      'select',
      { 'aria-label': t('backup.every') },
      ...([0, HOUR, 1, 7, 30] as const).map((n) => h('option', { value: String(n), selected: Math.abs(n - settings.every) < 1e-9 }, n === HOUR ? t('backup.everyHour') : t(`backup.every${n}` as 'backup.every0'))),
    );
    // BACKUP-006: by itself, to a folder or a cloud.
    const auto = h('input', { type: 'checkbox', checked: !!settings.auto });
    const autoRow = h('div', {}, h('label', {}, auto, ` ${t('backup.auto')}`), h('p', { class: 'hint' }, t('backup.autoHint')));
    const encrypt = h('input', { type: 'checkbox', checked: settings.encrypt });
    const password = h('input', { type: 'password', autocomplete: 'new-password', 'aria-label': t('backup.password'), value: sessionPassword ?? '' });
    const confirm = h('input', { type: 'password', autocomplete: 'new-password', 'aria-label': t('backup.confirm'), value: sessionPassword ?? '' });
    const remember = h('input', { type: 'checkbox', checked: !!sessionPassword });
    const passwordBox = h(
      'div',
      { class: 'backup-password' },
      h('label', { class: 'git-row' }, t('backup.password'), ' ', password),
      h('label', { class: 'git-row' }, t('backup.confirm'), ' ', confirm),
      h('label', {}, remember, ` ${t('backup.rememberSession')}`),
      h('p', { class: 'hint' }, t('backup.passwordHint')),
    );
    const show = (): void => {
      last.textContent = lastBackupText(settings);
      last.classList.toggle('due', !settings.last || (settings.every > 0 && (daysSinceBackup(settings) ?? 0) >= settings.every));
      passwordBox.hidden = !encrypt.checked;
      autoRow.hidden = (where.value || settings.target) === 'download';
    };
    void davTargets().then((dav) => {
      where.replaceChildren(...[...targets(), ...dav].map((o) => h('option', { value: o.value, selected: o.value === settings.target }, o.label)));
    });
    const persist = (): void => {
      settings = { ...settings, target: (where.value || 'download') as BackupTarget, every: Number(every.value), encrypt: encrypt.checked, ...(auto.checked ? { auto: true } : { auto: false }) };
      saveBackupSettings(settings);
      show();
    };
    for (const el of [where, every, encrypt, auto]) el.addEventListener('change', persist);
    const fail = (message: string): void => {
      error.textContent = message;
      error.hidden = false;
    };
    const now = button(t('backup.now'), async () => {
      error.hidden = true;
      persist();
      if (encrypt.checked) {
        if (password.value.length < 8) return fail(t('backup.shortPassword'));
        if (password.value !== confirm.value) return fail(t('backup.mismatch'));
      }
      sessionPassword = remember.checked && encrypt.checked ? password.value : undefined;
      now.disabled = true;
      try {
        // UI-019: each step with a spinner, until done.
        status.replaceChildren(...busyText(t('app.working')));
        settings = await backUpNow(settings, encrypt.checked ? password.value : undefined, (text) => status.replaceChildren(...busyText(text)));
        status.textContent = t('backup.done', { name: settings.last!.name, size: formatSize(settings.last!.size), n: settings.last!.files });
      } catch (err) {
        status.textContent = '';
        fail((err as Error).message);
      } finally {
        now.disabled = false;
        show();
      }
    }, { className: 'primary' });
    const restore = button(t('backup.restore'), () => void restoreDialog(host, settings));
    const form = h(
      'form',
      { method: 'dialog' },
      h('h2', { id: 'backup-title' }, t('backup.title')),
      last,
      h('p', { class: 'hint' }, t('backup.intro')),
      h('details', {}, h('summary', {}, t('backup.why')), h('p', {}, t('backup.notSync')), h('p', {}, t('backup.rule321'))),
      h('label', { class: 'git-row' }, t('backup.where'), ' ', where),
      h('label', { class: 'git-row' }, t('backup.every'), ' ', every),
      autoRow,
      h('label', {}, encrypt, ` ${t('backup.encrypt')}`),
      passwordBox,
      error,
      status,
      h('div', { class: 'dialog-actions' }, restore, button(t('common.close'), () => finish()), now),
    );
    const dialog = h('dialog', { class: 'dialog backup-dialog', 'aria-labelledby': 'backup-title' }, form);
    const finish = (): void => {
      dialog.close();
      dialog.remove();
      resolve();
    };
    form.addEventListener('submit', (e) => e.preventDefault());
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish();
    });
    show();
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    now.focus();
  });
}

/** Restore a backup: from a file, or from where backups go; then which files. */
export function restoreDialog(host: HTMLElement, settings: BackupSettings): Promise<RestoreResult | null> {
  return new Promise((resolve) => {
    const status = h('p', { class: 'hint', role: 'status', 'aria-live': 'polite' });
    const error = h('p', { class: 'error', role: 'alert', hidden: true });
    const password = h('input', { type: 'password', autocomplete: 'current-password', 'aria-label': t('backup.password') });
    const passwordRow = h('label', { class: 'git-row', hidden: true }, t('backup.password'), ' ', password);
    const list = h('div', { class: 'backup-files' });
    const replace = h('input', { type: 'checkbox' });
    const records = h('input', { type: 'checkbox', checked: true });
    const options = h('div', { hidden: true }, h('label', {}, replace, ` ${t('backup.replace')}`), h('label', {}, records, ` ${t('backup.restoreRecords')}`));
    const places = h('select', { 'aria-label': t('backup.from'), hidden: true });
    let bytes: Uint8Array | undefined;
    let backup: Backup | undefined;
    const fail = (message: string): void => {
      error.textContent = message;
      error.hidden = false;
    };
    const open = async (): Promise<void> => {
      error.hidden = true;
      if (!bytes) return;
      status.replaceChildren(...busyText(t('app.working')));
      try {
        backup = await openArchive(bytes, password.value || undefined);
      } catch (err) {
        status.textContent = '';
        passwordRow.hidden = !isEncryptedBackup(bytes);
        if (err instanceof BackupError && err.code === 'password') {
          if (password.value) fail(t('backup.wrongPassword'));
          password.focus();
        } else fail(t('backup.invalid'));
        return;
      }
      const when = new Date(backup.manifest.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
      status.textContent = t('backup.contains', { when, n: backup.files.length });
      list.replaceChildren(
        ...backup.files.map((f) => h('label', { class: 'backup-file' }, h('input', { type: 'checkbox', checked: true, value: f.path }), ` ${f.path} `, h('span', { class: 'hint' }, formatSize(f.data.length)))),
      );
      options.hidden = false;
      go.hidden = false;
    };
    const fromFile = button(t('backup.fromFile'), async () => {
      const { pickFile } = await import('../storage/file-io');
      const file = await pickFile('.pwobackup,application/octet-stream');
      if (!file) return;
      bytes = new Uint8Array(await file.arrayBuffer());
      passwordRow.hidden = !isEncryptedBackup(bytes);
      await open();
    });
    const fromPlace = button(t('backup.fromPlace'), async () => {
      const place = await targetPlace(settings.target, true);
      if (!place) return fail(t('backup.noPlace'));
      status.replaceChildren(...busyText(t('app.working')));
      const names = await listBackups(place).finally(() => (status.textContent = ''));
      if (!names.length) return fail(t('backup.none'));
      places.replaceChildren(...names.map((n) => h('option', { value: n }, n)));
      places.hidden = false;
      const load = async (): Promise<void> => {
        status.replaceChildren(...busyText(t('app.working')));
        bytes = await readBackup(place, places.value);
        passwordRow.hidden = !isEncryptedBackup(bytes);
        await open();
      };
      places.onchange = () => void load();
      await load();
    });
    fromPlace.hidden = settings.target === 'download';
    password.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void open();
      }
    });
    const unlock = button(t('backup.unlock'), () => void open());
    passwordRow.append(' ', unlock);
    const go = button(t('backup.restoreSelected'), async () => {
      if (!backup) return;
      const paths = new Set([...list.querySelectorAll<HTMLInputElement>('input:checked')].map((i) => i.value));
      go.disabled = true;
      status.replaceChildren(...busyText(t('app.working')));
      try {
        const sources = await browserSources();
        const result = await restoreBackup(backup, sources, { paths, replace: replace.checked, records: records.checked });
        status.textContent = t('backup.restored', { n: result.restored.length, m: result.renamed.length, s: result.same.length, r: result.records });
        done = result;
      } catch (err) {
        status.textContent = '';
        fail((err as Error).message);
      } finally {
        go.disabled = false;
      }
    }, { className: 'primary' });
    go.hidden = true;
    let done: RestoreResult | null = null;
    const form = h(
      'form',
      { method: 'dialog' },
      h('h2', { id: 'restore-title' }, t('backup.restoreTitle')),
      h('p', { class: 'hint' }, t('backup.restoreIntro')),
      h('div', { class: 'dialog-actions start' }, fromFile, fromPlace),
      places,
      passwordRow,
      error,
      status,
      list,
      options,
      h('div', { class: 'dialog-actions' }, button(t('common.close'), () => finish()), go),
    );
    const dialog = h('dialog', { class: 'dialog backup-dialog', 'aria-labelledby': 'restore-title' }, form);
    const finish = (): void => {
      dialog.close();
      dialog.remove();
      resolve(done);
    };
    form.addEventListener('submit', (e) => e.preventDefault());
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish();
    });
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    fromFile.focus();
  });
}

/** The password of this session, for a reminder's one-click backup. */
export const rememberedPassword = (): string | undefined => sessionPassword;
