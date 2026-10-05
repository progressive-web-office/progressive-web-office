import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

// CAL-001..CAL-005: the calendar of the events, kept as notes of the folder.

test.use({ viewport: { width: 1280, height: 900 } });

/** A file of the browser's storage (Documents), or undefined. */
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

test('creates, moves and changes events kept as notes, linked from their daily note (CAL-001, CAL-002, CAL-005)', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 9, 4, 10, 0));
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  const calendar = page.getByRole('application', { name: 'Calendar' });
  await expect(calendar.locator('.calendar-title')).toHaveText('October 2026');
  await expect(calendar.locator('.calendar-date.today')).toHaveText('4');

  // A click on a day: a new event, that day.
  await calendar.locator('.calendar-cell[data-day="2026-10-05"]').click({ position: { x: 60, y: 60 } });
  const dialog = page.getByRole('dialog', { name: 'New event' });
  await dialog.getByLabel('Title').fill('Kick-off');
  await dialog.getByLabel('Start time').fill('09:30');
  await expect(dialog.getByLabel('End time')).toHaveValue('10:30');
  await dialog.getByLabel('Location').fill('Room 12');
  await dialog.getByLabel('Attendees').fill('Ada Lovelace, charles@example.org');
  await dialog.getByLabel('Calendar').fill('Work');
  await dialog.getByLabel('Description').fill('The agenda.');
  await dialog.getByRole('button', { name: 'Save' }).click();
  const chip = calendar.locator('.calendar-cell[data-day="2026-10-05"] .calendar-event');
  await expect(chip).toContainText('Kick-off');
  await expect.poll(() => stored(page, 'Events/2026/10/05/2026-10-05 Kick-off.md')).toBe(
    '---\ntitle: Kick-off\ntype: "[[Event]]"\nstart: 2026-10-05T09:30\nend: 2026-10-05T10:30\nlocation: Room 12\nattendees:\n  - Ada Lovelace\n  - charles@example.org\ncalendar: Work\nuid: ' +
      (await stored(page, 'Events/2026/10/05/2026-10-05 Kick-off.md'))!.match(/uid: (.*)/)![1] +
      '\n---\n\nThe agenda.\n',
  );

  // Dragged to another day: the same note, moved.
  await chip.dragTo(calendar.locator('.calendar-cell[data-day="2026-10-07"]'), { targetPosition: { x: 50, y: 70 } });
  await expect(calendar.locator('.calendar-cell[data-day="2026-10-07"] .calendar-event')).toContainText('Kick-off');
  // Its note follows it to the folder of its new day, under the same name.
  await expect.poll(async () => (await stored(page, 'Events/2026/10/07/2026-10-05 Kick-off.md'))?.match(/start: (.*)/)?.[1]).toBe('2026-10-07T09:30');
  expect(await stored(page, 'Events/2026/10/05/2026-10-05 Kick-off.md')).toBeUndefined();

  // Changed in its window: its other properties and its text kept.
  await calendar.locator('.calendar-cell[data-day="2026-10-07"] .calendar-event').click();
  const edit = page.getByRole('dialog', { name: 'Event' });
  await expect(edit.getByLabel('Description')).toHaveValue('The agenda.');
  await edit.getByLabel('Title').fill('Kick-off meeting');
  await edit.getByLabel('Repeat').selectOption({ label: 'Every week' });
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(calendar.locator('.calendar-cell[data-day="2026-10-14"] .calendar-event')).toContainText('Kick-off meeting');
  const note = (await stored(page, 'Events/2026/10/07/2026-10-05 Kick-off.md'))!;
  expect(note).toContain('title: Kick-off meeting\n');
  expect(note).toContain('recurrence: FREQ=WEEKLY;BYDAY=WE\n');
  expect(note.endsWith('\nThe agenda.\n')).toBe(true);
  await page.screenshot({ path: 'test-results/calendar-month.png' });

  // Week and agenda.
  await calendar.getByRole('button', { name: 'Week', exact: true }).click();
  // Sunday the 4th ends its week (from Monday): the 7th is in the next one.
  await calendar.getByRole('button', { name: 'After' }).click();
  await expect(calendar.locator('.calendar-column[data-day="2026-10-07"] .calendar-event.timed')).toContainText('Kick-off meeting');
  await page.screenshot({ path: 'test-results/calendar-week.png' });
  await calendar.getByRole('button', { name: 'Agenda', exact: true }).click();
  await expect(calendar.locator('.calendar-agenda-day').first()).toContainText('Kick-off meeting');

  // The date of a day: its daily note, linking the events of the day.
  await calendar.getByRole('button', { name: 'Month', exact: true }).click();
  await calendar.locator('.calendar-cell[data-day="2026-10-14"] .calendar-date').click();
  await expect(page.locator('.doc-name')).toHaveText('2026-10-14.md');
  await expect.poll(() => stored(page, 'Daily notes/2026/10/2026-10-14.md')).toContain('events:\n  - "[[2026-10-05 Kick-off]]"\n');
  expect(errors).toEqual([]);
});

test('imports the events of a .ics file as notes and exports them (CAL-003)', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 9, 4, 10, 0));
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  const calendar = page.getByRole('application', { name: 'Calendar' });
  page.once('dialog', (d) => void d.accept());
  const chooser = page.waitForEvent('filechooser');
  await calendar.getByRole('button', { name: 'Import a calendar (.ics)…' }).click();
  await (await chooser).setFiles({
    name: 'holidays.ics',
    mimeType: 'text/calendar',
    buffer: Buffer.from('BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:h1\r\nDTSTART;VALUE=DATE:20261101\r\nDTEND;VALUE=DATE:20261102\r\nSUMMARY:All Saints\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:h2\r\nDTSTART;VALUE=DATE:20261011\r\nDTEND;VALUE=DATE:20261013\r\nSUMMARY:Long weekend\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n'),
  });
  await expect(calendar.locator('.calendar-cell[data-day="2026-10-12"] .calendar-event.all-day')).toContainText('Long weekend');
  await expect(calendar.locator('.calendar-cell[data-day="2026-10-13"] .calendar-event')).toHaveCount(0);
  await expect.poll(() => stored(page, 'Events/2026/11/01/2026-11-01 All Saints.md')).toContain('start: 2026-11-01\nend: 2026-11-02\nall day: true\n');
  const download = page.waitForEvent('download');
  await calendar.getByRole('button', { name: 'Export the events (.ics)' }).click();
  const ics = await (await download).createReadStream().then(async (s) => {
    const chunks: Buffer[] = [];
    for await (const c of s) chunks.push(c as Buffer);
    return Buffer.concat(chunks).toString();
  });
  expect(ics).toContain('SUMMARY:All Saints\r\n');
  expect(ics).toContain('DTSTART;VALUE=DATE:20261011\r\n');
  expect(errors).toEqual([]);
});
