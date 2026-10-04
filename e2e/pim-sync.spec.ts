import { expect, test, type Route } from '@playwright/test';
import { openApp } from './helpers';

// CAL-006: the calendars of a CalDAV server (Nextcloud) kept in step with the event notes.

test.use({ viewport: { width: 1280, height: 900 } });

const ORIGIN = 'https://cloud.example.org';
const CAL = '/remote.php/dav/calendars/ada/personal/';

test('finds the calendars of an account and keeps their events and the notes in step (CAL-006)', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 9, 4, 10, 0));
  await page.addInitScript((origin) => {
    localStorage.setItem('pwo.webdav.accounts', JSON.stringify([{ id: 'nc', url: `${origin}/remote.php/dav/files/ada/`, username: 'ada', password: 'app-password' }]));
  }, ORIGIN);
  const items = new Map<string, { data: string; etag: string }>([
    [`${CAL}standup.ics`, { etag: '"1"', data: 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:standup@server\r\nDTSTART:20261005T090000\r\nDTEND:20261005T091500\r\nSUMMARY:Stand-up\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n' }],
  ]);
  const puts: string[] = [];
  const ms = (body: string) => ({ status: 207, contentType: 'application/xml', body: `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">${body}</d:multistatus>` });
  const r = (href: string, props: string) => `<d:response><d:href>${href}</d:href><d:propstat><d:prop>${props}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;
  await page.route(`${ORIGIN}/**`, async (route: Route) => {
    const req = route.request();
    const path = decodeURIComponent(new URL(req.url()).pathname);
    const method = req.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204 });
    if (method === 'PROPFIND') {
      if (path === '/remote.php/dav/') return route.fulfill(ms(r(path, '<d:current-user-principal><d:href>/remote.php/dav/principals/users/ada/</d:href></d:current-user-principal>')));
      if (path.startsWith('/remote.php/dav/principals/')) return route.fulfill(ms(r(path, '<c:calendar-home-set><d:href>/remote.php/dav/calendars/ada/</d:href></c:calendar-home-set>')));
      if (path === '/remote.php/dav/calendars/ada/') return route.fulfill(ms(r(path, '<d:resourcetype><d:collection/></d:resourcetype>') + r(CAL, '<d:resourcetype><d:collection/><c:calendar/></d:resourcetype><d:displayname>Personal</d:displayname><c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set>')));
      if (path === CAL) return route.fulfill(ms(r(CAL, '<d:resourcetype><d:collection/></d:resourcetype>') + [...items].map(([p, i]) => r(p, `<d:getetag>${i.etag}</d:getetag><d:resourcetype/>`)).join('')));
      // The version of one item: asked after a PUT, its ETag header not being readable across origins.
      if (items.has(path)) return route.fulfill(ms(r(path, `<d:getetag>${items.get(path)!.etag}</d:getetag>`)));
    }
    if (method === 'REPORT') {
      const hrefs = [...(req.postData() ?? '').matchAll(/<d:href>([^<]+)<\/d:href>/g)].map((m) => decodeURIComponent(m[1]!));
      return route.fulfill(ms(hrefs.filter((h) => items.has(h)).map((h) => r(h, `<d:getetag>${items.get(h)!.etag}</d:getetag><c:calendar-data>${items.get(h)!.data}</c:calendar-data>`)).join('')));
    }
    if (method === 'PUT') {
      puts.push(req.postData() ?? '');
      items.set(path, { data: req.postData() ?? '', etag: `"${items.size + 10}"` });
      return route.fulfill({ status: 201, headers: { ETag: items.get(path)!.etag } });
    }
    return route.fulfill({ status: 404 });
  });
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  const calendar = page.getByRole('application', { name: 'Calendar' });

  // A local event first, to be sent.
  await calendar.locator('.calendar-cell[data-day="2026-10-07"]').click({ position: { x: 60, y: 60 } });
  const dialog = page.getByRole('dialog', { name: 'New event' });
  await dialog.getByLabel('Title').fill('Review');
  await dialog.getByRole('button', { name: 'Save' }).click();

  // No calendar chosen yet: ⟳ asks which.
  await calendar.getByRole('button', { name: 'Synchronise with the servers' }).click();
  const servers = page.getByRole('dialog', { name: 'Calendars of servers' });
  await servers.getByRole('button', { name: 'Find' }).click();
  await servers.getByLabel('Personal').check();
  await servers.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Synchronised: 1 received, 1 sent, 0 removed.')).toBeVisible();
  await expect(calendar.locator('.calendar-cell[data-day="2026-10-05"] .calendar-event')).toContainText('Stand-up');
  expect(puts).toHaveLength(1);
  expect(puts[0]).toContain('SUMMARY:Review\r\n');
  await page.screenshot({ path: 'test-results/calendar-sync.png' });
  expect(errors).toEqual([]);
});
