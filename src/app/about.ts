/** About window: version, build, QR code of the app, documentation and source links (UI-012). */
import { t } from '../i18n';
import { button, h } from './dom';
import { zoomableQr } from './qr';
import { BUILD, fullVersion, shortCommit } from './build-info';

export { BUILD };

export const SOURCE_URL = 'https://github.com/progressive-web-office/progressive-web-office.github.io';
const LICENSE_URL = 'https://www.gnu.org/licenses/agpl-3.0.html';


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
    `${t('app.name')} ${fullVersion()} (${shortCommit()}, ${BUILD.date.slice(0, 10)})`,
    `${location.origin}${location.pathname}`,
    navigator.userAgent,
    `${t('about.language')}: ${document.documentElement.lang || navigator.language}`,
    `${t('about.installed')}: ${installed() ? t('about.yes') : t('about.no')} · ${t('about.offline')}: ${offlineReady() ? t('about.yes') : t('about.no')}`,
    `${t('about.dependencies')}: ${BUILD.dependencies.map((d) => `${d.name}@${d.version}`).join(', ')}`,
  ].join('\n');
}

const link = (href: string, text: string): HTMLAnchorElement => h('a', { href, target: '_blank', rel: 'noopener' }, text);

/** The open-source components of this build, with their versions and licences (UI-017). */
function dependencyList(): HTMLElement {
  const deps = BUILD.dependencies;
  return h(
    'details',
    { class: 'about-deps' },
    h('summary', {}, t('about.dependenciesCount', { n: deps.length })),
    h(
      'table',
      {},
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, t('about.component')), h('th', { scope: 'col' }, t('about.version')), h('th', { scope: 'col' }, t('about.license')))),
      h('tbody', {}, ...deps.map((d) => h('tr', {}, h('td', {}, d.url ? link(d.url, d.name) : d.name), h('td', { class: 'mono' }, d.version), h('td', {}, d.license)))),
    ),
  );
}

/** UI-012: the author of the application. */
export const AUTHOR = 'Sébastien Celles';
const AUTHOR_URL = 'https://github.com/s-celles';

/** The content of the About window for the app published at `appUrl`. */
export function aboutContent(appUrl: string): HTMLElement {
  const figure = h('figure', { class: 'about-qr-figure' });
  // A click enlarges it, to scan from a distance or with a poor camera.
  figure.append(
    zoomableQr(() => (figure.closest('dialog') as HTMLElement | null) ?? document.body, appUrl, t('about.qrAlt', { url: appUrl }), 160, 'about-qr'),
    h('figcaption', { class: 'hint' }, t('about.qrCaption'), h('br'), h('span', { class: 'mono' }, appUrl)),
  );
  const date = new Date(BUILD.date);
  const commit = BUILD.commit === 'unknown' ? h('span', {}, shortCommit()) : link(`${SOURCE_URL}/commit/${BUILD.commit}`, shortCommit());
  commit.classList.add('mono');
  const rows: [string, Node | string][] = [
    [t('about.author'), link(AUTHOR_URL, AUTHOR)],
    [t('about.version'), link(`${SOURCE_URL}/blob/main/CHANGELOG.md`, fullVersion())],
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
      figure,
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
    dependencyList(),
    h('p', { class: 'hint' }, t('about.privacy')),
    h('p', { class: 'hint' }, t('about.credits')),
    h('p', { class: 'hint' }, link(`${SOURCE_URL}/blob/main/TRADEMARKS.md`, t('about.trademark'))),
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
