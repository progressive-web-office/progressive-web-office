import { afterEach, describe, expect, it, vi } from 'vitest';
import { SlideEditor } from '../src/slides/editor';
import { emptyPresentation, contentSlide } from '../src/slides/model';
import { readPresentation } from '../src/slides/io';

const ctx = () => ({ changed: vi.fn(), statusChanged: vi.fn(), choose: vi.fn() });
let ed: SlideEditor | undefined;
afterEach(() => {
  ed?.destroy();
  ed?.element.remove();
  document.querySelector('.slideshow')?.remove();
});

function mount() {
  const pres = emptyPresentation();
  pres.slides.push(contentSlide());
  const c = ctx();
  ed = new SlideEditor(pres, c, 'pptx');
  document.body.append(ed.element);
  ed.mounted();
  return { pres, c, ed };
}
const click = (el: Element | null) => el!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
const key = (el: Element, k: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

describe('PRES-004 slide sorter and stage', () => {
  it('shows thumbnails and the current slide with its shapes', () => {
    const { ed } = mount();
    expect(ed.element.querySelectorAll('.slide-thumb')).toHaveLength(2);
    expect(ed.element.querySelector('.stage .shape.text')?.textContent).toContain('Presentation title');
    click(ed.element.querySelectorAll('.slide-thumb')[1]!);
    expect(ed.element.querySelector('.slide-thumb[aria-current="true"]')?.textContent).toContain('2');
    expect(ed.element.querySelector('.stage')?.textContent).toContain('First point');
    expect(ed.status()).toBe('Slide 2 of 2');
  });
});

describe('PRES-006 slide and shape operations', () => {
  it('adds, duplicates, moves and deletes slides', () => {
    const { ed, pres, c } = mount();
    click(ed.element.querySelector('[aria-label="New slide"]'));
    expect(pres.slides).toHaveLength(3);
    click(ed.element.querySelector('[aria-label="Duplicate slide"]'));
    expect(pres.slides).toHaveLength(4);
    click(ed.element.querySelector('[aria-label="Move slide up"]'));
    expect(ed.status()).toBe('Slide 2 of 4');
    click(ed.element.querySelector('[aria-label="Delete slide"]'));
    expect(pres.slides).toHaveLength(3);
    expect(c.changed).toHaveBeenCalled();
  });

  it('adds a text box and a rectangle, selects and deletes a shape, undoes', () => {
    const { ed, pres } = mount();
    const count = pres.slides[0]!.shapes.length;
    click(ed.element.querySelector('[aria-label="Add text box"]'));
    click(ed.element.querySelector('[aria-label="Add rectangle"]'));
    expect(pres.slides[0]!.shapes).toHaveLength(count + 2);
    expect(ed.element.querySelector('.shape.selected')?.classList.contains('rect')).toBe(true);
    key(ed.element.querySelector('.stage-wrap')!, 'Delete');
    expect(pres.slides[0]!.shapes).toHaveLength(count + 1);
    ed.element.querySelector('.stage-wrap')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    expect(pres.slides[0]!.shapes).toHaveLength(count + 2);
  });

  it('PRES-005 edits shape text in place', () => {
    const { ed, pres } = mount();
    const shape = ed.element.querySelector<HTMLElement>('.stage .shape.text')!;
    shape.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const content = shape.querySelector<HTMLElement>('.shape-content')!;
    expect(content.getAttribute('contenteditable')).toBe('true');
    content.innerHTML = '<p style="text-align: center;"><strong>New</strong> title</p>';
    content.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    expect(pres.slides[0]!.shapes[0]!.paragraphs).toEqual([
      { type: 'paragraph', style: 'normal', align: 'center', runs: [{ text: 'New', bold: true }, { text: ' title' }] },
    ]);
  });

  it('PRES-010 edits speaker notes', () => {
    const { ed, pres } = mount();
    const notes = ed.element.querySelector<HTMLTextAreaElement>('.notes')!;
    notes.value = 'Say hello';
    notes.dispatchEvent(new Event('input'));
    expect(pres.slides[0]!.notes).toBe('Say hello');
  });
});

describe('PRES-007 slideshow', () => {
  it('advances, goes back and exits with the keyboard', () => {
    const { ed } = mount();
    click(ed.element.querySelector('[aria-label="Start slideshow"]'));
    const show = document.querySelector<HTMLElement>('.slideshow')!;
    expect(show.getAttribute('aria-label')).toBe('Slide 1 of 2');
    key(show, 'ArrowRight');
    expect(show.getAttribute('aria-label')).toBe('Slide 2 of 2');
    key(show, ' ');
    expect(show.getAttribute('aria-label')).toBe('Slide 2 of 2');
    key(show, 'PageUp');
    expect(show.getAttribute('aria-label')).toBe('Slide 1 of 2');
    key(show, 'Escape');
    expect(document.querySelector('.slideshow')).toBeNull();
  });
});

describe('FILE-006 presentation conversions', () => {
  it.each(['pptx', 'odp'] as const)('saves %s that can be read back', (format) => {
    const { ed } = mount();
    const back = readPresentation(format, ed.save(format));
    expect(back.slides).toHaveLength(2);
  });
});
