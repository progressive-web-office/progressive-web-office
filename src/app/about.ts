/** About window: version, build, QR code of the app, documentation and source links (UI-012). */
import { generate } from 'lean-qr';
import { toSvgDataURL } from 'lean-qr/extras/svg';
import { t } from '../i18n';
import { button, h } from './dom';

declare const __APP_VERSION__: string;
declare const __GIT_COMMIT__: string;
declare const __BUILD_DATE__: string;

export const BUILD = {
  version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0',
  commit: typeof __GIT_COMMIT__ === 'string' && __GIT_COMMIT__ ? __GIT_COMMIT__ : 'unknown',
  date: typeof __BUILD_DATE__ === 'string' ? __BUILD_DATE__ : new Date(0).toISOString(),
};

export const SOURCE_URL = 'https://github.com/s-celles/progressive-web-office';
const LICENSE_URL = 'https://www.gnu.org/licenses/agpl-3.0.html';

const shortCommit = (): string => (BUILD.commit === 'unknown' ? BUILD.commit : BUILD.commit.slice(0, 7));

/** Whether the app runs installed (standalone window) rather than in a browser tab. */
function installed(): boolean {
  try {
    return matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

const offlineReady = (): boolean => !!navigator.serviceWorker?.controller;

/** Plain-text details to paste into a bug report. */
export function debugReport(): string {
  return [
    `${t('app.name')} ${BUILD.version} (${shortCommit()}, ${BUILD.date.slice(0, 10)})`,
    `${location.origin}${location.pathname}`,
    navigator.userAgent,
    `${t('about.language')}: ${document.documentElement.lang || navigator.language}`,
    `${t('about.installed')}: ${installed() ? t('about.yes') : t('about.no')} · ${t('about.offline')}: ${offlineReady() ? t('about.yes') : t('about.no')}`,
  ].join('\n');
}

const link = (href: string, text: string): HTMLAnchorElement => h('a', { href, target: '_blank', rel: 'noopener' }, text);

/** The content of the About window for the app published at `appUrl`. */
export function aboutContent(appUrl: string): HTMLElement {
  const qr = h('img', {
    class: 'about-qr',
    src: toSvgDataURL(generate(appUrl), { on: 'black', off: 'white', padX: 2, padY: 2 }),
    alt: t('about.qrAlt', { url: appUrl }),
    width: '160',
    height: '160',
  });
  const date = new Date(BUILD.date);
  const commit = BUILD.commit === 'unknown' ? h('span', {}, shortCommit()) : link(`${SOURCE_URL}/commit/${BUILD.commit}`, shortCommit());
  commit.classList.add('mono');
  const rows: [string, Node | string][] = [
    [t('about.version'), link(`${SOURCE_URL}/blob/main/CHANGELOG.md`, BUILD.version)],
    [t('about.commit'), commit],
    [t('about.built'), Number.isNaN(date.getTime()) ? BUILD.date : date.toLocaleString()],
    [t('about.license'), link(LICENSE_URL, 'GNU AGPL-3.0-or-later')],
    [t('about.installed'), installed() ? t('about.yes') : t('about.no')],
    [t('about.offline'), offlineReady() ? t('about.yes') : t('about.no')],
  ];
  const docs = new URL('docs/', appUrl).href;
  return h(
    'div',
    { class: 'about' },
    h(
      'div',
      { class: 'about-head' },
      h('img', { class: 'about-logo', src: new URL('icon.svg', appUrl).href, alt: '', width: '56', height: '56' }),
      h('div', {}, h('p', { class: 'about-name' }, t('app.name')), h('p', { class: 'hint' }, t('app.tagline'))),
    ),
    h(
      'div',
      { class: 'about-body' },
      h('dl', { class: 'about-facts' }, ...rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
      h('figure', { class: 'about-qr-figure' }, qr, h('figcaption', { class: 'hint' }, t('about.qrCaption'), h('br'), h('span', { class: 'mono' }, appUrl))),
    ),
    h(
      'ul',
      { class: 'about-links' },
      h('li', {}, link(docs, t('app.docs'))),
      h('li', {}, link(`${docs}guide/getting-started`, t('about.gettingStarted'))),
      h('li', {}, link(SOURCE_URL, t('about.source'))),
      h('li', {}, link(`${SOURCE_URL}/blob/main/CHANGELOG.md`, t('about.changelog'))),
      h('li', {}, link(`${SOURCE_URL}/issues/new`, t('about.report'))),
      h('li', {}, link(`${docs}requirements`, t('about.requirements'))),
    ),
    h('p', { class: 'hint' }, t('about.privacy')),
    h('p', { class: 'hint' }, t('about.credits')),
  );
}

/** Open the About window. */
export function showAbout(host: HTMLElement): void {
  const appUrl = new URL('./', document.baseURI).href;
  const dialog = h('dialog', { class: 'dialog about-dialog', 'aria-labelledby': 'about-title' });
  const status = h('span', { class: 'hint', role: 'status' });
  const closeButton = button(t('common.close'), () => close(), { className: 'primary' });
  closeButton.autofocus = true;
  const close = (): void => {
    dialog.close();
    dialog.remove();
  };
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  dialog.append(
    h('h2', { id: 'about-title' }, t('about.title')),
    aboutContent(appUrl),
    h(
      'div',
      { class: 'dialog-actions' },
      status,
      button(t('about.copyDetails'), () => {
        void navigator.clipboard?.writeText(debugReport()).then(
          () => (status.textContent = t('collab.copied')),
          () => (status.textContent = ''),
        );
      }, { title: t('about.copyDetailsTitle') }),
      closeButton,
    ),
  );
  host.append(dialog);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}
