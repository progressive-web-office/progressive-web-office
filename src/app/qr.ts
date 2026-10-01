/** QR codes as images (About window, collaboration invitations). */
import { correction, generate } from 'lean-qr';
import { toSvgDataURL } from 'lean-qr/extras/svg';
import { t } from '../i18n';
import { button, h } from './dom';

/** A `data:` SVG URL of a QR code for `text`, black on white with a quiet zone. */
export function qrDataUrl(text: string): string {
  return toSvgDataURL(generate(text, { minCorrectionLevel: correction.M }), { on: 'black', off: 'white', padX: 4, padY: 4 });
}

export function qrImage(text: string, alt: string, size: number, className: string): HTMLImageElement {
  return h('img', { class: className, src: qrDataUrl(text), alt, width: String(size), height: String(size) });
}

/** The QR code full screen, easy to scan from a distance (click outside, Escape or Close to leave). */
export function showQrFullScreen(host: HTMLElement, text: string, alt: string): void {
  const overlay = h('dialog', { class: 'qr-full', 'aria-label': t('qr.fullScreen') });
  const close = (): void => {
    overlay.close();
    overlay.remove();
  };
  const closeButton = button(t('common.close'), close, { className: 'primary' });
  overlay.append(qrImage(text, alt, 640, 'qr-full-image'), h('p', { class: 'qr-full-text' }, text), closeButton);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || (e.target as HTMLElement).classList.contains('qr-full-image')) close();
  });
  overlay.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  host.append(overlay);
  if (typeof overlay.showModal === 'function') overlay.showModal();
  else overlay.setAttribute('open', '');
  closeButton.focus();
}

/** A QR code that opens full screen when clicked (or activated with the keyboard). */
export function zoomableQr(host: () => HTMLElement, text: string, alt: string, size: number, className: string): HTMLButtonElement {
  const b = button(t('qr.enlarge'), () => showQrFullScreen(host(), text, alt), { className: 'qr-zoom', title: t('qr.enlargeTitle') });
  b.replaceChildren(qrImage(text, alt, size, className));
  b.setAttribute('aria-label', t('qr.enlarge'));
  return b;
}
