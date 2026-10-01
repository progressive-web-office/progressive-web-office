/** Service worker registration, update prompt (PLT-005) and file handling (PLT-006). */
import { t } from '../i18n';
import type { App } from './app';

interface LaunchParams {
  files: { getFile(): Promise<File> }[];
}
interface LaunchQueue {
  setConsumer(consumer: (params: LaunchParams) => void): void;
}

export function installPwa(app: App): void {
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    void import('virtual:pwa-register').then(({ registerSW }) => {
      const updateSW = registerSW({
        onNeedRefresh() {
          showUpdateBanner(() => void updateSW(true));
        },
      });
    });
  }
  void openSharedFile(app);
  const queue = (window as unknown as { launchQueue?: LaunchQueue }).launchQueue;
  queue?.setConsumer(async (params) => {
    const handle = params.files[0];
    if (handle) await app.openFile(await handle.getFile());
  });
}

/** Pick up a file received through the Web Share Target (SHARE-003, see public/share-target.js). */
async function openSharedFile(app: App): Promise<void> {
  const params = new URLSearchParams(location.search);
  if (params.get('shared') !== '1' || !('caches' in window)) return;
  params.delete('shared');
  const query = params.toString();
  history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
  const cache = await caches.open('pwo-share-target');
  const key = new URL('shared-file', document.baseURI).href;
  const res = await cache.match(key);
  if (!res) return;
  await cache.delete(key);
  const name = decodeURIComponent(res.headers.get('x-file-name') ?? 'shared');
  const blob = await res.blob();
  await app.openFile(new File([blob], name, { type: blob.type }));
}

function showUpdateBanner(reload: () => void): void {
  const banner = document.createElement('div');
  banner.className = 'update-banner';
  banner.setAttribute('role', 'status');
  const text = document.createElement('span');
  text.textContent = t('pwa.update');
  const ok = document.createElement('button');
  ok.type = 'button';
  ok.textContent = t('common.reload');
  ok.addEventListener('click', reload);
  const later = document.createElement('button');
  later.type = 'button';
  later.textContent = t('common.later');
  later.addEventListener('click', () => banner.remove());
  banner.append(text, ok, later);
  document.body.append(banner);
}
