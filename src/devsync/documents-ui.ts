/**
 * DEVSYNC-011: the documents of this browser in one window — each with its
 * state among the paired devices (synchronised, only here, on another device
 * and not here yet), the trash, and the history of the synchronisations with
 * their time.
 */
import { button, h, setStatus } from '../app/dom';
import { t } from '../i18n';
import type { StorageProvider } from '../fs';
import { listTrash, scan } from './engine';
import { documentStatuses, type DocRow } from './overview';
import { loadSyncState, type SyncRecord } from './state';

export interface DocumentsOptions {
  files: StorageProvider;
  /** Open a document of the browser. */
  open(path: string): void;
  /** Look through them as a folder. */
  openFolder(): void;
  /** Synchronise now; undefined when not paired. */
  syncNow?(): Promise<string>;
  /** Told when a synchronisation ended, to show it; returns the function to stop. */
  listen?(done: () => void): () => void;
}

const when = (at: number): string => new Date(at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });

function statusText(row: DocRow): { icon: string; text: string } {
  const s = row.status;
  if (s.kind === 'synced') return { icon: '✅', text: t('docs.synced') };
  if (s.kind === 'remote') return { icon: '⬇️', text: t('docs.remote', { devices: s.on.join(', ') }) };
  const parts = [s.missing.length ? t('docs.missing', { devices: s.missing.join(', ') }) : '', s.different.length ? t('docs.different', { devices: s.different.join(', ') }) : ''].filter(Boolean);
  return { icon: '⬆️', text: parts.join(' · ') };
}

function recordText(r: SyncRecord): string {
  return t('docs.record', { name: r.name, fetched: r.fetched.length, trashed: r.trashed.length, conflicts: r.conflicts.length, failed: r.failed.length });
}

export function showBrowserDocuments(host: HTMLElement, opts: DocumentsOptions): Promise<void> {
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'dialog browser-docs-dialog', 'aria-labelledby': 'browser-docs-title' });
    const summary = h('p', { class: 'hint' });
    const table = h('table', { class: 'browser-docs' });
    const trashButton = button(t('devsync.trashOpen'), async () => {
      const { showTrash } = await import('./trash-ui');
      await showTrash(host, opts.files, () => void render());
      await render();
    }, { icon: '🗑' });
    const history = h('ol', { class: 'sync-history', reversed: true });
    const status = h('p', { class: 'hint', role: 'status', 'aria-live': 'polite' });
    let stop: (() => void) | undefined;
    const finish = (): void => {
      stop?.();
      dialog.close();
      dialog.remove();
      resolve();
    };
    const render = async (): Promise<void> => {
      const state = loadSyncState();
      const { hashes } = await scan(opts.files, state);
      const sizes = new Map<string, { size?: number; at?: number }>();
      const { walk } = await import('../fs');
      for await (const e of walk(opts.files, '', { maxDepth: 32, maxEntries: 50_000 })) sizes.set(e.path, { size: e.size, at: e.lastModified });
      const rows = documentStatuses(Object.fromEntries(hashes), state.remotes ?? {}, state.deleted);
      const remotes = Object.values(state.remotes ?? {});
      summary.textContent = [
        t('docs.count', { here: hashes.size, remote: rows.filter((r) => r.status.kind === 'remote').length }),
        remotes.length ? t('docs.asOf', { list: remotes.map((d) => `${d.name} (${when(d.at)})`).join(', ') }) : state.pairing ? t('docs.neverMet') : t('docs.notPaired'),
      ].join(' ');
      table.replaceChildren(
        h('thead', {}, h('tr', {}, h('th', {}, t('docs.name')), h('th', {}, t('docs.modified')), h('th', {}, t('docs.state')))),
        h(
          'tbody',
          {},
          ...(rows.length
            ? rows.map((row) => {
                const { icon, text } = statusText(row);
                const meta = sizes.get(row.path);
                const name = row.status.kind === 'remote' ? h('span', { class: 'remote-name' }, row.path) : button(row.path, () => (finish(), opts.open(row.path)), { className: 'link', title: t('docs.openTitle', { name: row.path }) });
                return h('tr', { class: `doc-${row.status.kind}` }, h('td', {}, name), h('td', {}, meta?.at ? when(meta.at) : ''), h('td', {}, h('span', { 'aria-hidden': 'true' }, `${icon} `), text));
              })
            : [h('tr', {}, h('td', { colspan: '3', class: 'hint' }, t('docs.none')))]),
        ),
      );
      const trash = await listTrash(opts.files);
      trashButton.textContent = t('docs.trash', { n: trash.length });
      const records = [...(state.history ?? [])].reverse();
      history.replaceChildren(
        ...(records.length
          ? records.map((r) =>
              h(
                'li',
                {},
                h('time', { datetime: new Date(r.at).toISOString() }, when(r.at)),
                ' ',
                recordText(r),
                r.fetched.length + r.trashed.length + r.conflicts.length + r.failed.length
                  ? h(
                      'details',
                      {},
                      h('summary', {}, t('docs.details')),
                      h(
                        'ul',
                        {},
                        ...r.fetched.map((p) => h('li', {}, `⬇️ ${p}`)),
                        ...r.trashed.map((p) => h('li', {}, `🗑 ${p}`)),
                        ...r.conflicts.map((p) => h('li', {}, `⚠️ ${p}`)),
                        ...r.failed.map((p) => h('li', {}, `❌ ${p}`)),
                      ),
                    )
                  : null,
              ),
            )
          : [h('li', { class: 'hint' }, t('docs.noHistory'))]),
      );
    };
    const sync = opts.syncNow
      ? button(t('devsync.now'), async () => {
          setStatus(status, t('devsync.connecting'));
          setStatus(status, await opts.syncNow!());
          await render();
        }, { icon: '🔁' })
      : null;
    dialog.append(
      h('h2', { id: 'browser-docs-title' }, `🗄️ ${t('docs.title')}`),
      summary,
      h('div', { class: 'dialog-actions start' }, sync, trashButton, button(t('docs.asFolder'), () => (finish(), opts.openFolder()), { icon: '📁' })),
      status,
      h('div', { class: 'browser-docs-scroll' }, table),
      h('h3', {}, t('docs.history')),
      history,
      h('div', { class: 'dialog-actions' }, button(t('common.close'), finish, { className: 'primary' })),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish();
    });
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    void render().catch((err: Error) => setStatus(status, err.message, true));
    stop = opts.listen?.(() => void render().catch(() => undefined));
  });
}
