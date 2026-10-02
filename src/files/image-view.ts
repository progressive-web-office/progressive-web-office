/** Pictures (FILE-023): shown fitted to the window or at their own size. */
import { button, h } from '../app/dom';
import type { EditorView, ViewContext } from '../app/views';
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

export class ImageView implements EditorView {
  readonly element: HTMLElement;
  private readonly url: string;
  private readonly img: HTMLImageElement;
  private size = '';

  constructor(
    bytes: Uint8Array,
    private readonly ctx: ViewContext,
    private readonly fileName: string,
  ) {
    // An SVG shown through <img> runs no script.
    this.url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: pictureType(bytes) }));
    this.img = h('img', { src: this.url, alt: fileName, class: 'picture fit' });
    this.img.addEventListener('load', () => {
      this.size = `${this.img.naturalWidth} × ${this.img.naturalHeight} px`;
      this.ctx.statusChanged();
    });
    const zoom = button(t('picture.actualSize'), () => {
      const fit = this.img.classList.toggle('fit');
      zoom.textContent = t(fit ? 'picture.actualSize' : 'picture.fit');
    });
    this.element = h(
      'div',
      { class: 'picture-view' },
      h('div', { class: 'toolbar', role: 'toolbar', 'aria-label': t('picture.toolbar') }, zoom),
      h('div', { class: 'picture-scroll', tabindex: '0', 'aria-label': fileName }, this.img),
    );
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
