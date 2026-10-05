import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

// NOTIF-001: the reminders of events, notified while the application is open.

test('reminds of an event at the time asked, once (NOTIF-001)', async ({ page, context }) => {
  await context.grantPermissions(['notifications']);
  await page.clock.install({ time: new Date(2026, 9, 6, 13, 30) });
  const errors = await openApp(page);
  await page.evaluate(async () => {
    let dir = await navigator.storage.getDirectory();
    for (const d of ['Documents', 'Events', '2026', '10', '06']) dir = await dir.getDirectoryHandle(d, { create: true });
    const w = await (await dir.getFileHandle('2026-10-06 Review.md', { create: true })).createWritable();
    await w.write('---\ntitle: Review\ntype: "[[Event]]"\nstart: 2026-10-06T14:00\nend: 2026-10-06T15:00\nlocation: Room 12\nreminders:\n  - "10"\nuid: r@pwo\n---\n');
    await w.close();
  });
  // The reminder shown in the event, and the reminders turned on.
  await page.getByRole('button', { name: 'Settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByLabel('Reminder of new events').selectOption({ label: '15 minutes before' });
  await settings.getByLabel('Notify the reminders of events').check();
  await expect(settings.getByRole('status').filter({ hasText: 'Notifications allowed.' })).toBeVisible();
  await settings.getByRole('button', { name: 'Close' }).click();

  // 13:50: told once, in the application (and by the system).
  await page.clock.runFor(19 * 60_000);
  await expect(page.getByText(/🔔 Review — .*Room 12/)).toHaveCount(0);
  await page.clock.runFor(2 * 60_000);
  await expect(page.getByText(/🔔 Review — .*Room 12/)).toBeVisible();
  await page.clock.runFor(5 * 60_000);
  await expect(page.getByText(/🔔 Review/)).toHaveCount(1);

  // A new event takes the reminder of the settings; the event's own is shown in its dialog.
  await page.keyboard.press('Control+Shift+P');
  await page.getByRole('combobox', { name: 'Commands' }).fill('Calendar');
  await page.getByRole('option', { name: /^Calendar/ }).first().click();
  const calendar = page.getByRole('application', { name: 'Calendar' });
  await calendar.getByText('Review').first().click();
  await expect(page.getByRole('dialog', { name: 'Event' }).getByLabel('Reminder')).toHaveValue('10');
  expect(errors).toEqual([]);
});
