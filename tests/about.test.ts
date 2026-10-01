import { describe, expect, it } from 'vitest';
import { aboutContent, BUILD, debugReport } from '../src/app/about';
import pkg from '../package.json';

describe('UI-012 About window', () => {
  it('knows the version, commit and build date', () => {
    expect(BUILD.version).toBe(pkg.version);
    expect(BUILD.commit).toMatch(/^([0-9a-f]{7,40}|unknown)$/);
    expect(Number.isNaN(Date.parse(BUILD.date))).toBe(false);
  });

  it('shows the version, a QR code of the app address and the useful links', () => {
    const root = aboutContent('https://example.org/pwo/');
    expect(root.textContent).toContain(pkg.version);
    const qr = root.querySelector('img.about-qr')!;
    expect(qr.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    expect(qr.getAttribute('alt')).toContain('https://example.org/pwo/');
    const links = Object.fromEntries(Array.from(root.querySelectorAll('a')).map((a) => [a.textContent, a.getAttribute('href')]));
    expect(links['Documentation']).toBe('https://example.org/pwo/docs/');
    expect(links['Source code']).toBe('https://github.com/s-celles/progressive-web-office');
    expect(links['Report a problem']).toBe('https://github.com/s-celles/progressive-web-office/issues/new');
    expect(Object.values(links)).toContain('https://www.gnu.org/licenses/agpl-3.0.html');
    if (BUILD.commit !== 'unknown') expect(Object.values(links)).toContain(`https://github.com/s-celles/progressive-web-office/commit/${BUILD.commit}`);
  });

  it('builds a report to paste into a bug report', () => {
    const report = debugReport();
    expect(report).toContain(`Progressive Web Office ${pkg.version}`);
    expect(report).toContain(BUILD.commit.slice(0, 7));
    expect(report).toContain(navigator.userAgent);
  });
});

describe('UI-013 version in the interface', async () => {
  const { App } = await import('../src/app/app');
  it('shows the version and commit in the toolbar and on the start screen', async () => {
    const { versionLabel } = await import('../src/app/build-info');
    expect(versionLabel()).toMatch(new RegExp(`^v${pkg.version.replace(/\./g, '\\.')} \\(([0-9a-f]{7}|unknown)\\)$`));
    const root = document.createElement('div');
    new App(root);
    expect(root.querySelector('button.app-version')?.textContent).toBe(versionLabel());
    expect(root.querySelector('h1')?.textContent).toContain(versionLabel());
  });
});
