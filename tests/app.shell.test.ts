import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/app/app';

let root: HTMLElement;
beforeEach(() => {
  root = document.createElement('div');
  document.body.append(root);
});
afterEach(() => root.remove());

describe('UI-001 start screen', () => {
  it('offers new document, new spreadsheet and open actions', () => {
    new App(root);
    const labels = Array.from(root.querySelectorAll('.start button')).map((b) => b.textContent?.trim());
    expect(labels).toEqual(
      expect.arrayContaining(['New document', 'New spreadsheet', 'New presentation', 'Open file…']),
    );
  });

  it('links to the documentation and the source code', () => {
    new App(root);
    const links = Array.from(root.querySelectorAll<HTMLElement>('.start .start-links .start-link'));
    expect(links.map((a) => a.textContent)).toEqual(['Documentation', 'Source code (GNU AGPL-3.0)', 'About']);
    expect((links[0] as HTMLAnchorElement).href).toBe(new URL('docs/', document.baseURI).href);
    // And in the header: the documentation (?) and About (ℹ).
    expect(root.querySelector<HTMLAnchorElement>('.header-actions a[aria-label="Documentation"]')!.href).toBe(new URL('docs/', document.baseURI).href);
  });

  it('UI-003 gives every button an accessible name', () => {
    new App(root);
    for (const b of Array.from(root.querySelectorAll('button'))) {
      const name = b.getAttribute('aria-label') ?? b.textContent?.trim();
      expect(name, b.outerHTML).toBeTruthy();
    }
  });
});

describe('FILE-004 / FILE-012 rejected files', () => {
  it('shows an error for unsupported files and stays on the start screen', async () => {
    const app = new App(root);
    await app.openFile(new File([new Uint8Array([1, 2, 3])], 'image.png'));
    expect(root.querySelector('[role="alert"]')?.textContent).toMatch(/not supported/i);
    expect(root.querySelector('.start')).not.toBeNull();
  });

  it('refuses files over the size limit', async () => {
    const app = new App(root);
    const big = new File(['x'], 'big.csv');
    Object.defineProperty(big, 'size', { value: 250 * 1024 * 1024 });
    await app.openFile(big);
    expect(root.querySelector('[role="alert"]')?.textContent).toMatch(/too large/i);
  });
});

describe('FILE-007 / FILE-001 documents in the shell', () => {
  it('creates a new document with an editable page', async () => {
    const app = new App(root);
    await app.newDocument('document');
    expect(root.querySelector('.doc-page[contenteditable="true"]')).not.toBeNull();
    expect(root.querySelector('.doc-name')?.textContent).toBe('Untitled document.odt'); // FILE-016: open formats by default
  });

  it('opens a Markdown file and shows its content', async () => {
    const app = new App(root);
    await app.openFile(new File(['# Hello\n\nWorld'], 'hello.md'));
    expect(root.querySelector('.doc-page h1')?.textContent).toBe('Hello');
    expect(root.querySelector('.app-status')?.textContent).toContain('Markdown');
  });
});

describe('FILE-011 autosaved drafts', () => {
  it('autosaves a modified document and offers to restore it on the start screen', async () => {
    let stored: { name: string; format: string; bytes: Uint8Array } | undefined;
    const drafts = {
      save: async (d: { name: string; format: string; bytes: Uint8Array }) => void (stored = d),
      load: async () => stored as never,
      clear: async () => void (stored = undefined),
    };
    const app = new App(root, { drafts, autosaveMs: 5 });
    await app.openFile(new File(['# Draft\n'], 'draft.md'));
    // Type in the heading (the editor reads DOM changes like a browser's input).
    root.querySelector('.doc-page h1')!.firstChild!.textContent += '!';
    await vi.waitFor(() => expect(stored?.name).toBe('draft.md'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    app.close();
    // closing deliberately discards the draft
    await new Promise((r) => setTimeout(r, 5));
    expect(stored).toBeUndefined();
  });

  it('shows a restore button when a draft exists', async () => {
    const drafts = {
      save: async () => undefined,
      load: async () => ({ name: 'kept.md', format: 'md' as const, bytes: new TextEncoder().encode('# Kept'), savedAt: Date.now() }),
      clear: async () => undefined,
    };
    new App(root, { drafts });
    await new Promise((r) => setTimeout(r, 5));
    const restore = Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.includes('kept.md'));
    expect(restore).toBeDefined();
    restore!.click();
    await new Promise((r) => setTimeout(r, 20));
    expect(root.querySelector('.doc-page h1')?.textContent).toBe('Kept');
  });
});

describe('UI-007 / UI-008 interface language', () => {
  it('renders the start screen in French and switches to Chinese from the picker', async () => {
    const { setLocale } = await import('../src/i18n');
    setLocale('fr');
    try {
      new App(root);
      expect(root.querySelector('.start h1')?.textContent).toContain('Progressive Web Office');
      expect(Array.from(root.querySelectorAll('.start button')).map((b) => b.textContent)).toContain('Nouveau document');
      const picker = root.querySelector<HTMLSelectElement>('select.language')!;
      picker.value = 'zh';
      picker.dispatchEvent(new Event('change'));
      expect(Array.from(root.querySelectorAll('.start button')).map((b) => b.textContent)).toContain('新建文档');
      expect(document.documentElement.lang).toBe('zh-Hans');
    } finally {
      setLocale('en');
    }
  });
});
