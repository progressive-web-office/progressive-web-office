import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

// CONTACT-001..CONTACT-004: contacts kept as notes, linked from the notes and the events.

test.use({ viewport: { width: 1280, height: 900 } });

const stored = (page: Page, path: string) =>
  page.evaluate(async (p) => {
    let dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('Documents');
    const parts = p.split('/');
    try {
      for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
      return await (await (await dir.getFileHandle(parts.at(-1)!)).getFile()).text();
    } catch {
      return undefined;
    }
  }, path);

/** Run a command of the palette by its name. */
async function command(page: Page, name: string): Promise<void> {
  await page.keyboard.press('Control+Shift+P');
  const input = page.getByRole('combobox', { name: 'Commands' });
  await input.fill(name);
  await page.getByRole('option', { name: new RegExp(`^${name}`) }).first().click();
}

test('creates contacts as notes, shows their events and birthdays, imports and exports vCards (CONTACT-001..CONTACT-004)', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 9, 4, 10, 0));
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'Contacts', exact: true }).click();
  const contacts = page.getByRole('application', { name: 'Contacts' });
  await expect(contacts.locator('.contacts-list')).toContainText('No contact yet');

  await contacts.getByRole('button', { name: 'New contact' }).click();
  const dialog = page.getByRole('dialog', { name: 'New contact' });
  await dialog.getByLabel('First name').fill('Ada');
  await dialog.getByLabel('Last name').fill('Lovelace');
  await expect(dialog.getByLabel('Name shown')).toHaveValue('Ada Lovelace');
  await dialog.getByLabel('E-mails').fill('ada@example.org');
  await dialog.getByLabel('Phones').fill('+33 6 12 34 56 78');
  await dialog.getByLabel('Organisation').fill('Analytical Engines');
  await dialog.getByLabel('Birthday').fill('1815-10-10');
  await dialog.getByRole('button', { name: 'Save' }).click();
  const card = contacts.locator('.contact-card');
  await expect(card.getByRole('heading', { name: 'Ada Lovelace' })).toBeVisible();
  await expect(card.getByRole('link', { name: 'ada@example.org' })).toHaveAttribute('href', 'mailto:ada@example.org');
  await expect(card.getByRole('link', { name: '+33 6 12 34 56 78' })).toHaveAttribute('href', 'tel:+33612345678');
  await expect(card).toContainText('211 this year');
  const note = (await stored(page, 'People/Ada Lovelace.md'))!;
  expect(note).toMatch(/^---\ntitle: Ada Lovelace\ntype: "\[\[Person\]\]"\nfirst name: Ada\nlast name: Lovelace\nemails:\n {2}- ada@example\.org\nphones:\n {2}- "\+33 6 12 34 56 78"\norganization: Analytical Engines\nbirthday: 1815-10-10\ntags:\n {2}- person\nuid: .+\n---\n/);

  // An event she attends: on her card; her birthday: in the calendar.
  await command(page, 'Calendar');
  const calendar = page.getByRole('application', { name: 'Calendar' });
  await expect(calendar.locator('.calendar-cell[data-day="2026-10-10"] .calendar-event.birthday')).toContainText('Ada Lovelace');
  await calendar.locator('.calendar-cell[data-day="2026-10-06"]').click({ position: { x: 60, y: 60 } });
  const event = page.getByRole('dialog', { name: 'New event' });
  await event.getByLabel('Title').fill('Engine review');
  await event.getByLabel('Attendees').fill('Ada Lovelace');
  await event.getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => stored(page, 'Events/2026-10-06 Engine review.md')).toContain('attendees:\n  - "[[Ada Lovelace]]"\n');
  await command(page, 'Contacts');
  await expect(contacts.locator('.contact-interactions')).toContainText('Engine review');

  // An interaction: a line of the daily note of its day, linked; the card follows (CONTACT-006).
  await card.getByRole('button', { name: 'Note an interaction' }).click();
  const log = page.getByRole('dialog', { name: 'An interaction with Ada Lovelace' });
  await log.getByLabel('Kind').selectOption({ label: '📞 Call' });
  await log.getByLabel('When').fill('2026-10-02T14:05');
  await log.getByLabel('About').fill('Agreed on the review.');
  await log.getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => stored(page, 'Daily notes/2026-10-02.md')).toContain('\n- 14:05 📞 Call — [[Ada Lovelace]]: Agreed on the review.\n');
  await expect(contacts.locator('.contact-facts')).toContainText('First met');
  await expect(contacts.locator('.contact-facts')).toContainText('Last contact');
  await expect(contacts.locator('.contact-facts')).toContainText('October 2, 2026 (2 days ago)');
  await expect(contacts.locator('.contact-timeline li').first()).toContainText('Engine review');
  await expect(contacts.locator('.contact-timeline')).toContainText('Agreed on the review.');
  expect(await stored(page, 'People/Ada Lovelace.md')).toContain('first met: 2026-10-02\nlast contact: 2026-10-02\n');
  await page.screenshot({ path: 'test-results/contact-interactions.png' });

  // A vCard file: its contacts as notes; then the search; then the export.
  page.once('dialog', (d) => void d.accept());
  const chooser = page.waitForEvent('filechooser');
  await contacts.getByRole('button', { name: 'Import contacts (.vcf)…' }).click();
  await (await chooser).setFiles({ name: 'team.vcf', mimeType: 'text/vcard', buffer: Buffer.from('BEGIN:VCARD\r\nVERSION:3.0\r\nUID:cb\r\nFN:Charles Babbage\r\nORG:Analytical Engines\r\nEMAIL:charles@example.org\r\nEND:VCARD\r\nBEGIN:VCARD\r\nVERSION:4.0\r\nUID:mf\r\nFN:Mary Fairfax\r\nEND:VCARD\r\n') });
  await expect(contacts.locator('.contacts-list li[role="option"]')).toHaveCount(3);
  await contacts.getByLabel('Search by name, e-mail, organisation or #tag').fill('analytical');
  await expect(contacts.locator('.contacts-list li[role="option"] .contact-name')).toHaveText(['Ada Lovelace', 'Charles Babbage']);
  await expect(card.getByRole('heading', { name: 'Ada Lovelace' })).toBeVisible();
  await page.screenshot({ path: 'test-results/contacts.png' });
  const download = page.waitForEvent('download');
  await contacts.getByRole('button', { name: 'Export the contacts (.vcf)' }).click();
  const chunks: Buffer[] = [];
  for await (const c of await (await download).createReadStream()) chunks.push(c as Buffer);
  const vcf = Buffer.concat(chunks).toString();
  expect(vcf.match(/BEGIN:VCARD/g)).toHaveLength(3);
  expect(vcf).toContain('FN:Ada Lovelace\r\n');
  expect(vcf).toContain('BDAY:18151010\r\n');
  expect(errors).toEqual([]);
});
