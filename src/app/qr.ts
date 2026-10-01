/** QR codes as images (About window, collaboration invitations). */
import { correction, generate } from 'lean-qr';
import { toSvgDataURL } from 'lean-qr/extras/svg';
import { h } from './dom';

/** A `data:` SVG URL of a QR code for `text`, black on white with a quiet zone. */
export function qrDataUrl(text: string): string {
  return toSvgDataURL(generate(text, { minCorrectionLevel: correction.M }), { on: 'black', off: 'white', padX: 4, padY: 4 });
}

export function qrImage(text: string, alt: string, size: number, className: string): HTMLImageElement {
  return h('img', { class: className, src: qrDataUrl(text), alt, width: String(size), height: String(size) });
}
