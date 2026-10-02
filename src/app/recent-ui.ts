/** Recent files on the start screen (FILE-008, FILE-009). */
import { getLocale, t } from '../i18n';
import { formatLabel } from '../core/format';
import { addRecent, clearRecent, getRecent, listRecent, removeRecent, renameRecent, type RecentEntry } from '../storage/recent';
import type { App } from './app';
import { button, h } from './dom';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** When a recent file was last opened: date and time, in the interface language. */
export function formatOpenedAt(timestamp: number, locale: string = getLocale(), timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short', ...(timeZone ? { timeZone } : {}) }).format(timestamp);
}

async function render(app: App, container: HTMLElement): Promise<void> {
  let entries: RecentEntry[];
  try {
    entries = await listRecent();
  } catch {
    return; // storage unavailable (private mode...)
  }
  if (!container.isConnected) return;
  container.querySelector('.recent-list')?.remove();
  if (!entries.length) return;
  const list = h('ul');
  for (const e of entries) {
    const open = button(t('recent.open', { name: e.name }), async () => {
      const file = await getRecent(e.id);
      if (file) await app.openFile(file);
    }, { className: 'open-recent', text: '' });
    open.append(h('span', { class: 'name' }, e.name), h('span', { class: 'meta' }, `${formatLabel(e.format)} · ${formatSize(e.size)} · ${t('recent.opened', { when: formatOpenedAt(e.lastOpened) })}`));
    const remove = button(t('recent.remove', { name: e.name }), async () => {
      await removeRecent(e.id);
      await render(app, container);
    }, { text: '×', className: 'icon', title: t('recent.removeTitle') });
    list.append(h('li', {}, open, remove));
  }
  container.append(
    h(
      'div',
      { class: 'recent-list' },
      h('h2', {}, t('start.recent')),
      h('p', { class: 'hint' }, t('recent.hint')),
      list,
      button(t('recent.clear'), async () => {
        await clearRecent();
        await render(app, container);
      }, { className: 'link' }),
    ),
  );
}

export function installRecent(app: App): void {
  app.onFileOpened = (file, format) => void addRecent(file, format).catch(() => undefined);
  app.onFileSaved = (file, format) => void addRecent(file, format).catch(() => undefined);
  app.onFileRenamed = (oldName, newName) => renameRecent(oldName, newName).then(() => undefined, () => undefined);
  app.renderStart = (container) => void render(app, container);
}
