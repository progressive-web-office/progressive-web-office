import { expect, test } from '@playwright/test';
import { unzipSync, strFromU8 } from 'fflate';
import { openApp, openFile, saveAs } from './helpers';

test('edits document properties and saves them in Markdown and MDZ (DOC-017)', async ({ page }) => {
  const errors = await openApp(page);
  await openFile(page, 'rapport.md', '# Rapport\n\nTexte.\n');
  await page.getByRole('button', { name: 'Document properties' }).click();
  const dialog = page.getByRole('dialog', { name: 'Document properties' });
  await expect(dialog.getByLabel('Title')).toHaveValue('Rapport');
  await dialog.getByLabel('Author').fill('Ada Lovelace');
  await dialog.getByLabel('Date', { exact: true }).fill('2026-09-30');
  await dialog.getByLabel('Keywords').fill('bilan, énergie');
  await dialog.getByLabel('Language').fill('fr');
  await dialog.getByLabel('Licence').fill('CC-BY-4.0');
  await dialog.getByRole('button', { name: 'OK' }).click();
  await expect(page.locator('.modified')).toBeVisible();

  const md = (await saveAs(page, 'Markdown (.md)')).data.toString('utf8');
  expect(md).toBe('---\ntitle: Rapport\nauthor: Ada Lovelace\ndate: 2026-09-30\nkeywords: [bilan, énergie]\nlang: fr\nlicense: CC-BY-4.0\n---\n\n# Rapport\n\nTexte.\n');

  const mdz = unzipSync(new Uint8Array((await saveAs(page, 'Markdown package (.mdz)')).data));
  expect(JSON.parse(strFromU8(mdz['manifest.json']!))).toMatchObject({ title: 'Rapport', author: 'Ada Lovelace', date: '2026-09-30', keywords: ['bilan', 'énergie'], language: 'fr', license: 'CC-BY-4.0' });

  // Reopen the Markdown: the properties come back.
  await openFile(page, 'rapport.md', md);
  await page.getByRole('button', { name: 'Document properties' }).click();
  await expect(page.getByRole('dialog', { name: 'Document properties' }).getByLabel('Keywords')).toHaveValue('bilan, énergie');
  expect(errors).toEqual([]);
});
