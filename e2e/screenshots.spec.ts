/**
 * README and documentation screenshots: `SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts`
 * writes them to docs/public/screenshots/. Skipped in normal test runs.
 */
import { test, type Page } from '@playwright/test';
import { PDFDocument, StandardFonts } from '@pdfme/pdf-lib';
import { openApp, openFile } from './helpers';

test.skip(!process.env.SCREENSHOTS, 'only when SCREENSHOTS=1');
// The settings of a first visit (compact toolbars), not those of the tests.
test.use({ viewport: { width: 1280, height: 800 }, colorScheme: 'light', storageState: { cookies: [], origins: [] } });

const OUT = 'docs/public/screenshots';

const REPORT = `# Lab report: speed control

The motor follows a first-order model, with gain $K$ and time constant $\\tau$:

$$
G(s) = \\frac{K}{1 + \\tau s}
$$

| Test | Gain K | τ (s) | Overshoot |
| --- | --- | --- | --- |
| P controller | 2.1 | 0.40 | 18 % |
| PI controller | 2.1 | 0.40 | 6 % |

The PI controller removes the static error[^1].

[^1]: Measured over ten runs.
`;

async function shot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

test('start screen', async ({ page }) => {
  await openApp(page);
  await shot(page, 'start');
});

test('text document', async ({ page }) => {
  await openApp(page);
  await openFile(page, 'lab-report.md', REPORT);
  await page.locator('.doc-page h1').waitFor();
  await shot(page, 'document');
});

test('spreadsheet', async ({ page }) => {
  await openApp(page);
  await openFile(page, 'measures.csv', 'Time (s),Speed (rpm),Set point (rpm)\n0,0,1000\n0.2,420,1000\n0.4,690,1000\n0.6,850,1000\n0.8,930,1000\n1.0,968,1000\n1.2,985,1000\n1.4,993,1000\n');
  await page.getByRole('button', { name: 'Insert chart' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Chart type').selectOption('line');
  await dialog.getByLabel('Title', { exact: true }).fill('Step response');
  await dialog.getByLabel('Data range').fill('A1:C9');
  await dialog.getByRole('button', { name: 'Insert' }).click();
  await shot(page, 'spreadsheet');
});

test('phone', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 393, height: 851 }, isMobile: true, hasTouch: true, colorScheme: 'light' });
  const page = await context.newPage();
  await openApp(page);
  await openFile(page, 'lab-report.md', REPORT);
  await page.locator('.doc-page h1').waitFor();
  await shot(page, 'phone');
  await context.close();
});

test('letter (template, fields and springs)', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light', locale: 'fr-FR' });
  const page = await context.newPage();
  await openApp(page);
  await page.getByRole('button', { name: /Modèles et exemples/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Lettre', exact: true }).click();
  await page.locator('.doc-page p').first().waitFor();
  await shot(page, 'letter');
  await context.close();
});

test('command palette', async ({ page }) => {
  await openApp(page);
  await openFile(page, 'lab-report.md', REPORT);
  await page.locator('.doc-page h1').waitFor();
  await page.getByRole('button', { name: 'Commands', exact: true }).click();
  await page.getByRole('dialog', { name: 'Commands' }).getByRole('combobox').fill('insert');
  await shot(page, 'palette');
});

test('context menu', async ({ page }) => {
  await openApp(page);
  await openFile(page, 'lab-report.md', REPORT);
  await page.locator('.doc-page td').first().click({ button: 'right' });
  await shot(page, 'context-menu');
});

test('designing a PDF form', async ({ page }) => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pdfPage = doc.addPage([595, 842]);
  pdfPage.drawText('Registration form', { x: 72, y: 760, size: 22, font: bold });
  ['Name', 'E-mail', 'Level', 'Newsletter'].forEach((label, i) => pdfPage.drawText(label, { x: 72, y: 700 - i * 40, size: 12, font }));
  const form = doc.getForm();
  form.createTextField('Name').addToPage(pdfPage, { x: 170, y: 694, width: 250, height: 20 });
  form.createTextField('E-mail').addToPage(pdfPage, { x: 170, y: 654, width: 250, height: 20 });
  await openApp(page);
  await openFile(page, 'registration.pdf', Buffer.from(await doc.save()), 'application/pdf');
  await page.locator('.pdf-page canvas').first().waitFor();
  await page.getByRole('button', { name: 'Design the form' }).click();
  await page.waitForTimeout(800);
  await shot(page, 'form-design');
});
