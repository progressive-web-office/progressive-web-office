/**
 * BACKUP-006: the application moves from the personal GitHub Pages site to
 * the organisation's. The browser keeps documents per site, so the old site
 * asks to back them up and restore the backup at the new address.
 */
export const OLD_HOME = 'https://s-celles.github.io/progressive-web-office/';
export const NEW_HOME = 'https://progressive-web-office.github.io/progressive-web-office/';

/** Whether `href` is a page of the old site. */
export function movedFrom(href: string): boolean {
  try {
    const url = new URL(href);
    const old = new URL(OLD_HOME);
    return url.origin === old.origin && url.pathname.startsWith(old.pathname);
  } catch {
    return false;
  }
}
