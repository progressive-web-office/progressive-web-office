/**
 * PRES-014: the presenter view — beside the slideshow, a console with the
 * current and the next slide, the speaker notes, the time spent and the time
 * of day, and buttons to move. In a second window (put it on the screen
 * facing you), or in this window when windows cannot be opened: then it is a
 * rehearsal, without the slideshow.
 */
import { t } from '../i18n';
import { typesetMath } from '../math/inline';

export interface PresenterOptions {
  count: number;
  /** A new element of slide i, at its full size. */
  render(index: number): HTMLElement;
  size: { width: number; height: number };
  notes(index: number): string;
  go(index: number): void;
  end(): void;
}

export interface PresenterConsole {
  /** Show slide i (the slideshow moved). */
  show(index: number): void;
  close(): void;
  /** Whether it is in a window of its own. */
  separate: boolean;
}

const pad = (n: number): string => String(n).padStart(2, '0');
const duration = (ms: number): string => {
  const s = Math.floor(ms / 1000);
  return `${s >= 3600 ? `${Math.floor(s / 3600)}:` : ''}${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
};

/** Open the console: in a window of its own when one can be opened, else over this page. */
export function openPresenter(opts: PresenterOptions): PresenterConsole {
  const win = window.open('', 'pwo-presenter', 'popup,width=1100,height=720');
  const separate = !!win && !win.closed;
  const doc = separate ? win.document : document;
  if (separate) {
    doc.title = t('presenter.title');
    doc.documentElement.lang = document.documentElement.lang;
    doc.documentElement.dataset.theme = document.documentElement.dataset.theme ?? '';
    // The styles of the application, for the slides and the console.
    doc.head.replaceChildren(...Array.from(document.querySelectorAll('style, link[rel="stylesheet"]')).map((n) => doc.importNode(n, true)));
    doc.body.replaceChildren();
  }
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const btn = (label: string, text: string, run: () => void): HTMLButtonElement => {
    const b = el('button', undefined, text);
    b.type = 'button';
    b.title = label;
    b.setAttribute('aria-label', label);
    b.addEventListener('click', run);
    return b;
  };

  let index = 0;
  let started = Date.now();
  let paused: number | undefined;
  let fontSize = 1.25;

  const root = el('div', `presenter${separate ? '' : ' presenter-inline'}`);
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', t('presenter.title'));
  root.tabIndex = 0;
  const currentBox = el('div', 'presenter-current');
  const nextBox = el('div', 'presenter-next');
  const nextLabel = el('div', 'presenter-label', t('presenter.next'));
  const notes = el('div', 'presenter-notes');
  notes.setAttribute('aria-live', 'polite');
  const position = el('span', 'presenter-position');
  const elapsed = el('span', 'presenter-elapsed');
  elapsed.setAttribute('role', 'timer');
  const clock = el('span', 'presenter-clock');
  const pauseBtn = btn(t('presenter.pause'), '⏸', () => {
    if (paused === undefined) paused = Date.now();
    else {
      started += Date.now() - paused;
      paused = undefined;
    }
    pauseBtn.textContent = paused === undefined ? '⏸' : '▶';
    tick();
  });
  const bar = el('div', 'presenter-bar');
  bar.append(
    btn(t('presenter.previous'), '◀', () => opts.go(index - 1)),
    position,
    btn(t('presenter.nextSlide'), '▶', () => opts.go(index + 1)),
    el('span', 'presenter-sep'),
    elapsed,
    pauseBtn,
    btn(t('presenter.reset'), '↺', () => {
      started = Date.now();
      if (paused !== undefined) paused = started;
      tick();
    }),
    el('span', 'presenter-sep'),
    clock,
    el('span', 'presenter-sep'),
    btn(t('presenter.smaller'), 'A−', () => {
      fontSize = Math.max(0.8, fontSize - 0.15);
      notes.style.fontSize = `${fontSize}rem`;
    }),
    btn(t('presenter.larger'), 'A+', () => {
      fontSize = Math.min(3, fontSize + 0.15);
      notes.style.fontSize = `${fontSize}rem`;
    }),
    btn(t('presenter.end'), '✕', () => opts.end()),
  );
  const side = el('div', 'presenter-side');
  side.append(nextLabel, nextBox, notes);
  const main = el('div', 'presenter-main');
  main.append(currentBox, side);
  root.append(bar, main);
  if (!separate) {
    const note = el('p', 'presenter-rehearsal', t('presenter.rehearsal'));
    root.prepend(note);
  }
  notes.style.fontSize = `${fontSize}rem`;

  /** A slide scaled into its box. */
  const place = (box: HTMLElement, i: number): void => {
    box.replaceChildren();
    if (i < 0 || i >= opts.count) {
      box.append(el('div', 'presenter-end', t('presenter.endOfShow')));
      return;
    }
    const w = box.clientWidth || 600;
    const h = box.clientHeight || 340;
    const scale = Math.min(w / opts.size.width, h / opts.size.height);
    const slide = doc.importNode(opts.render(i), true) as HTMLElement;
    slide.style.transform = `scale(${scale})`;
    const frame = el('div', 'show-frame');
    frame.style.width = `${opts.size.width * scale}px`;
    frame.style.height = `${opts.size.height * scale}px`;
    frame.append(slide);
    box.append(frame);
    void typesetMath(frame).catch(() => undefined);
  };
  const tick = (): void => {
    elapsed.textContent = duration((paused ?? Date.now()) - started);
    const now = new Date();
    clock.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  };
  const show = (i: number): void => {
    index = i;
    position.textContent = t('slides.position', { n: i + 1, total: opts.count });
    place(currentBox, i);
    place(nextBox, i + 1);
    const text = opts.notes(i);
    notes.textContent = text || t('presenter.noNotes');
    notes.classList.toggle('empty', !text);
    tick();
  };

  root.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).tagName === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) return;
    if (['ArrowRight', 'ArrowDown', ' ', 'PageDown', 'Enter', 'n'].includes(e.key)) {
      e.preventDefault();
      opts.go(index + 1);
    } else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p'].includes(e.key)) {
      e.preventDefault();
      opts.go(index - 1);
    } else if (e.key === 'Home') opts.go(0);
    else if (e.key === 'End') opts.go(opts.count - 1);
    else if (e.key === 'Escape') {
      e.preventDefault();
      opts.end();
    }
  });
  const timer = setInterval(tick, 1000);
  const onResize = (): void => show(index);
  (separate ? win : window).addEventListener('resize', onResize);
  // Closing the presenter's window ends the show.
  const onUnload = (): void => opts.end();
  if (separate) win.addEventListener('pagehide', onUnload);

  doc.body.append(root);
  show(0);
  root.focus();
  return {
    separate,
    show,
    close: () => {
      clearInterval(timer);
      (separate ? win : window).removeEventListener('resize', onResize);
      if (separate) {
        win.removeEventListener('pagehide', onUnload);
        win.close();
      } else root.remove();
    },
  };
}
