import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../src/app/app';
import { NEW_HOME, movedFrom } from '../src/app/move';

describe('BACKUP-006 the application moves to a new address', () => {
  it('knows the old address and the new one', () => {
    expect(movedFrom('https://s-celles.github.io/progressive-web-office/')).toBe(true);
    expect(movedFrom('https://s-celles.github.io/progressive-web-office/?doc=1#x')).toBe(true);
    expect(movedFrom('https://progressive-web-office.github.io/progressive-web-office/')).toBe(false);
    expect(movedFrom('http://localhost:5173/')).toBe(false);
    expect(NEW_HOME).toBe('https://progressive-web-office.github.io/progressive-web-office/');
  });

  let root: HTMLElement | undefined;
  afterEach(() => root?.remove());

  it('shows a notice with a backup button and the new address on the old site only', () => {
    root = document.createElement('div');
    document.body.append(root);
    new App(root, { location: 'https://s-celles.github.io/progressive-web-office/' });
    const notice = root.querySelector('.move-banner')!;
    expect(notice).not.toBeNull();
    expect(notice.textContent).toMatch(/moves/i);
    expect(notice.querySelector<HTMLAnchorElement>('a')!.href).toBe(NEW_HOME);
    expect(Array.from(notice.querySelectorAll('button')).map((b) => b.textContent)).toContain('Back up now');
    root.remove();

    root = document.createElement('div');
    document.body.append(root);
    new App(root, { location: 'http://localhost:5173/' });
    expect(root.querySelector('.move-banner')).toBeNull();
  });
});
