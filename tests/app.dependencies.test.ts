import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { projectUrl, runtimeDependencies } from '../src/app/dependencies';
import { BUILD } from '../src/app/build-info';
import { aboutContent, debugReport } from '../src/app/about';
import pkg from '../package.json';

describe('UI-017 dependencies in the About window', () => {
  it('turns package repository fields into web addresses', () => {
    expect(projectUrl({ repository: 'github:anthropics/anthropic-sdk-typescript' })).toBe('https://github.com/anthropics/anthropic-sdk-typescript');
    expect(projectUrl({ repository: 'markdown-it/markdown-it' })).toBe('https://github.com/markdown-it/markdown-it');
    expect(projectUrl({ repository: { url: 'git+https://github.com/arnog/mathlive.git' } })).toBe('https://github.com/arnog/mathlive');
    expect(projectUrl({ repository: { url: 'git://github.com/prosemirror/prosemirror-state.git' } })).toBe('https://github.com/prosemirror/prosemirror-state');
    expect(projectUrl({ repository: { url: 'git@github.com:pdfme/pdfme.git' }, homepage: 'https://pdfme.com' })).toBe('https://pdfme.com');
    expect(projectUrl({}, 'github:s-celles/QRShare#collab-dist-v0.2.0')).toBe('https://github.com/s-celles/QRShare');
    expect(projectUrl({ homepage: 'javascript:alert(1)' })).toBeUndefined();
  });

  it('lists the runtime dependencies with their installed versions', () => {
    const deps = runtimeDependencies(process.cwd());
    const names = deps.map((d) => d.name);
    const python = names.filter((n) => n.endsWith(' (Python)'));
    expect(names.filter((n) => !python.includes(n))).toEqual(Object.keys(pkg.dependencies).filter((n) => !n.startsWith('@types/')).sort());
    // CODE-016: the Python packages bundled for widgets are listed too.
    expect(python).toEqual(['comm (Python)', 'psygnal (Python)', 'ipywidgets (Python)', 'anywidget (Python)']);
    expect(deps.find((d) => d.name === 'anywidget (Python)')?.license).toBe('MIT');
    const yjs = deps.find((d) => d.name === 'yjs')!;
    expect(yjs.version).toBe(JSON.parse(readFileSync('node_modules/yjs/package.json', 'utf8')).version);
    expect(yjs.license).toBe('MIT');
    expect(deps.find((d) => d.name === '@scelles/collab')?.url).toBe('https://github.com/s-celles/QRShare');
  });

  it('shows them in the About window and in the copied details', () => {
    expect(BUILD.dependencies.length).toBeGreaterThan(10);
    const root = aboutContent('https://example.org/pwo/');
    const list = root.querySelector('details.about-deps')!;
    expect(list.querySelector('summary')!.textContent).toContain(String(BUILD.dependencies.length));
    const yjs = BUILD.dependencies.find((d) => d.name === 'yjs')!;
    expect(list.textContent).toContain(`yjs${yjs.version}MIT`);
    expect(debugReport()).toContain(`yjs@${yjs.version}`);
  });
});
