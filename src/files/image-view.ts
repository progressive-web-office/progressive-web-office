/**
 * Pictures (FILE-023): shown fitted to the window or at their own size; an
 * SVG drawing edited in the drawing editor, a PNG, JPEG or WebP picture
 * painted on (DRAW-001, DRAW-008), and saved back.
 */
import { button, h } from '../app/dom';
import type { EditorView, ViewContext } from '../app/views';
import type { DocumentFormat } from '../core/format';
import { t } from '../i18n';
import './files.css';

/** The media type of a picture, by signature (SVG as text). */
export function pictureType(bytes: Uint8Array): string {
  const ascii = (from: number, s: string): boolean => [...s].every((c, i) => bytes[from + i] === c.charCodeAt(0));
  if (bytes[0] === 0x89 && ascii(1, 'PNG')) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (ascii(0, 'GIF8')) return 'image/gif';
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'image/webp';
  if (ascii(0, 'BM')) return 'image/bmp';
  if (ascii(4, 'ftyp')) return 'image/avif';
  if (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0) return 'image/x-icon';
  return 'image/svg+xml';
}

/** Pictures the painting editor writes back in their own type. */
const PAINTABLE = ['image/png', 'image/jpeg', 'image/webp'];

export class ImageView implements EditorView {
  readonly element: HTMLElement;
  private url = '';
  private readonly img: HTMLImageElement;
  private size = '';
  private readonly type: string;

  constructor(
    private bytes: Uint8Array,
    private readonly ctx: ViewContext,
    private readonly fileName: string,
  ) {
    this.type = pictureType(bytes);
    // An SVG shown through <img> runs no script.
    this.img = h('img', { alt: fileName, class: 'picture fit' });
    this.img.addEventListener('load', () => {
      this.size = `${this.img.naturalWidth} × ${this.img.naturalHeight} px`;
      this.ctx.statusChanged();
    });
    this.show();
    const zoom = button(t('picture.actualSize'), () => {
      const fit = this.img.classList.toggle('fit');
      zoom.textContent = t(fit ? 'picture.actualSize' : 'picture.fit');
    });
    const tools: HTMLElement[] = [zoom];
    if (this.type === 'image/svg+xml') tools.push(button(t('draw.edit'), () => void this.edit(), { icon: '✏️', className: 'primary' }));
    else if (PAINTABLE.includes(this.type)) tools.push(button(t('paint.edit'), () => void this.edit(), { icon: '🎨', className: 'primary' }));
    this.element = h(
      'div',
      { class: 'picture-view' },
      h('div', { class: 'toolbar', role: 'toolbar', 'aria-label': t('picture.toolbar') }, ...tools),
      h('div', { class: 'picture-scroll', tabindex: '0', 'aria-label': fileName }, this.img),
    );
    this.img.addEventListener('dblclick', () => void this.edit());
  }

  private show(): void {
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = URL.createObjectURL(new Blob([this.bytes as BlobPart], { type: this.type }));
    this.img.src = this.url;
  }

  /** The drawing or painting editor, the picture replaced when done. */
  async edit(): Promise<boolean> {
    let out: Uint8Array | undefined;
    if (this.type === 'image/svg+xml') {
      const [{ editDrawing }, { fromSvg, toSvg }] = await Promise.all([import('../draw/editor'), import('../draw/svg')]);
      let initial;
      try {
        initial = fromSvg(new TextDecoder().decode(this.bytes));
      } catch {
        initial = undefined;
      }
      const drawing = await editDrawing(this.element, initial);
      if (drawing) out = new TextEncoder().encode(toSvg(drawing));
    } else if (PAINTABLE.includes(this.type)) {
      const { paintPicture } = await import('../paint/editor');
      const painted = await paintPicture(this.element, { bytes: this.bytes, mediaType: this.type });
      if (painted) out = painted.bytes;
    } else return false;
    if (!out) return false;
    this.bytes = out;
    this.show();
    this.ctx.changed();
    return true;
  }

  save(_format: DocumentFormat): Uint8Array {
    return this.bytes;
  }

  /** The media type of the picture, to save it. */
  mediaType(): string {
    return this.type;
  }

  status(): string {
    return this.size;
  }

  printContent(): HTMLElement {
    return h('div', { class: 'picture-view print' }, h('img', { src: this.url, alt: this.fileName, class: 'picture fit' }));
  }

  destroy(): void {
    URL.revokeObjectURL(this.url);
  }
}
