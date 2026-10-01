import { expect, test } from '@playwright/test';
import { openApp, openFile, saveAs } from './helpers';

const TEX = String.raw`\documentclass{article}
\title{Paper}
\begin{document}
\maketitle
\section{Intro}
Energy is $E=mc^2$ and \textbf{bold}.
\begin{itemize}
  \item one
\end{itemize}
\end{document}
`;

test('opens a .tex file and exports it back to LaTeX (TEX-001, TEX-003)', async ({ page }) => {
  const errors = await openApp(page);
  await openFile(page, 'paper.tex', TEX);
  await expect(page.locator('.doc-page h1')).toHaveText('Intro');
  await expect(page.locator('.doc-page span.math')).toHaveAttribute('data-latex', 'E=mc^2');
  await expect(page.locator('.doc-page .list-item')).toHaveText('one');
  const tex = await saveAs(page, 'LaTeX (.tex)');
  expect(tex.name).toBe('paper.tex');
  const text = tex.data.toString('utf8');
  expect(text).toContain('\\section{Intro}');
  expect(text).toContain('$E=mc^2$');
  const zip = await saveAs(page, 'LaTeX project (.zip)');
  expect(zip.name).toBe('paper.zip');
  expect(zip.data.subarray(0, 2).toString()).toBe('PK');
  expect(errors).toEqual([]);
});

test('typing $…$ creates an equation (TEX-005)', async ({ page }) => {
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'New document' }).click();
  await page.getByRole('textbox', { name: 'Document' }).click();
  await page.keyboard.type('Area $\\pi r^2$ done');
  const eq = page.locator('.doc-page span.math');
  await expect(eq).toHaveAttribute('data-latex', '\\pi r^2');
  await expect(eq).toHaveAttribute('data-rendered', '\\pi r^2');
  const md = await saveAs(page, 'Markdown (.md)');
  expect(md.data.toString('utf8')).toBe('Area $\\pi r^2$ done\n');
  expect(errors).toEqual([]);
});

test('renders $…$ in spreadsheet cells (TEX-006)', async ({ page }) => {
  const errors = await openApp(page);
  await openFile(page, 'm.csv', 'formula,value\n$x^2$,4\n');
  const cell = page.locator('td[data-r="1"][data-c="0"] span.math');
  await expect(cell).toHaveAttribute('data-rendered', 'x^2');
  expect(errors).toEqual([]);
});
