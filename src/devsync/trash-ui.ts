/** DEVSYNC-009: the trash of the synchronised documents, in a window: restore a file, or remove it for good. */
import { button, h, setStatus } from '../app/dom';
import { t } from '../i18n';
import type { StorageProvider } from '../fs';
import { deleteFromTrash, listTrash, restoreFromTrash, type TrashItem } from './engine';
import { TOMBSTONE_DAYS } from './state';

const size = (n: number | undefined): string => (n === undefined ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);

/** Show the trash; `changed` is called after a file was restored (to synchronise it). */
export function showTrash(host: HTMLElement, files: StorageProvider, changed: () => void = () => {}): Promise<void> {
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'dialog devsync-trash', 'aria-labelledby': 'devsync-trash-title' });
    const list = h('ul', { class: 'devsync-trash-list' });
    const status = h('p', { class: 'hint', role: 'status' });
    const finish = (): void => {
      dialog.close();
      dialog.remove();
      resolve();
    };
    const render = async (): Promise<void> => {
      const items = await listTrash(files);
      if (!items.length) {
        list.replaceChildren(h('li', { class: 'empty' }, t('devsync.trashEmpty')));
        return;
      }
      let day = '';
      list.replaceChildren(
        ...items.flatMap((item: TrashItem) => {
          const out: HTMLElement[] = [];
          if (item.day !== day) {
            day = item.day;
            out.push(h('li', { class: 'day' }, t('devsync.trashDay', { day: new Date(`${item.day}T12:00:00`).toLocaleDateString() })));
          }
          const restore = button(t('devsync.trashRestore'), async () => {
            try {
              const to = await restoreFromTrash(files, item.path);
              setStatus(status, t('devsync.trashRestored', { name: to }));
              changed();
            } catch (err) {
              setStatus(status, (err as Error).message, true);
            }
            await render();
          }, { icon: '↩' });
          const remove = button(t('devsync.trashDelete'), async () => {
            if (!window.confirm(t('devsync.trashDeleteConfirm', { name: item.original }))) return;
            try {
              await deleteFromTrash(files, item.path);
              setStatus(status, t('devsync.trashDeleted', { name: item.original }));
            } catch (err) {
              setStatus(status, (err as Error).message, true);
            }
            await render();
          }, { icon: '🗑' });
          out.push(h('li', { class: 'file' }, h('span', { class: 'name', title: item.original }, item.original), h('span', { class: 'size' }, size(item.size)), restore, remove));
          return out;
        }),
      );
    };
    dialog.append(
      h('h2', { id: 'devsync-trash-title' }, t('devsync.trashTitle')),
      h('p', { class: 'hint' }, t('devsync.trashIntro', { days: TOMBSTONE_DAYS })),
      list,
      status,
      h('div', { class: 'dialog-actions' }, button(t('common.close'), finish, { className: 'primary' })),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish();
    });
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    void render();
  });
}
