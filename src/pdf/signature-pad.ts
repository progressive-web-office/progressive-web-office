/** Handwritten signature capture: draw with mouse/touch/stylus or import an image (PDF-011). */
import { t } from '../i18n';
import { button, h } from '../app/dom';

/** Resolve with PNG bytes of the signature, or null if cancelled. */
export function captureSignature(host: HTMLElement): Promise<{ png: Uint8Array; width: number; height: number } | null> {
  return new Promise((resolve) => {
    const canvas = h('canvas', { class: 'signature-canvas', width: '600', height: '200', 'aria-label': t('sig.area') });
    const ctx = canvas.getContext('2d');
    let drawing = false;
    let empty = true;
    const clear = (): void => {
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      empty = true;
    };
    const point = (e: PointerEvent): [number, number] => {
      const r = canvas.getBoundingClientRect();
      return [((e.clientX - r.left) * canvas.width) / r.width, ((e.clientY - r.top) * canvas.height) / r.height];
    };
    canvas.addEventListener('pointerdown', (e) => {
      if (!ctx) return;
      drawing = true;
      canvas.setPointerCapture(e.pointerId);
      ctx.lineWidth = e.pointerType === 'pen' ? Math.max(1.5, e.pressure * 5) : 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#0b1f4d';
      ctx.beginPath();
      ctx.moveTo(...point(e));
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drawing || !ctx) return;
      if (e.pointerType === 'pen') ctx.lineWidth = Math.max(1.5, e.pressure * 5);
      ctx.lineTo(...point(e));
      ctx.stroke();
      empty = false;
    });
    const stop = (): void => {
      drawing = false;
    };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);

    const importImage = async (): Promise<void> => {
      const input = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp' });
      const file = await new Promise<File | null>((res) => {
        input.addEventListener('change', () => res(input.files?.[0] ?? null), { once: true });
        input.addEventListener('cancel', () => res(null), { once: true });
        input.click();
      });
      if (!file || !ctx) return;
      const bitmap = await createImageBitmap(file);
      clear();
      const scale = Math.min(canvas.width / bitmap.width, canvas.height / bitmap.height);
      const w = bitmap.width * scale;
      const hh = bitmap.height * scale;
      ctx.drawImage(bitmap, (canvas.width - w) / 2, (canvas.height - hh) / 2, w, hh);
      empty = false;
    };

    const dialog = h('dialog', { class: 'dialog signature-dialog', 'aria-labelledby': 'sig-title' });
    const finish = async (ok: boolean): Promise<void> => {
      if (!ok || empty) {
        dialog.close();
        dialog.remove();
        resolve(null);
        return;
      }
      const trimmed = trim(canvas);
      const blob = await new Promise<Blob | null>((res) => trimmed.toBlob(res, 'image/png'));
      dialog.close();
      dialog.remove();
      resolve(blob ? { png: new Uint8Array(await blob.arrayBuffer()), width: trimmed.width, height: trimmed.height } : null);
    };
    dialog.append(
      h('h2', { id: 'sig-title' }, t('sig.title')),
      h('p', {}, t('sig.help')),
      canvas,
      h(
        'div',
        { class: 'dialog-actions' },
        button(t('common.clear'), clear),
        button(t('sig.import'), () => void importImage()),
        button(t('common.cancel'), () => void finish(false)),
        button(t('sig.place'), () => void finish(true), { className: 'primary' }),
      ),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      void finish(false);
    });
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  });
}

/** Crop transparent margins around the drawing. */
function trim(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let x1 = width;
  let y1 = height;
  let x2 = -1;
  let y2 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]! > 0) {
        if (x < x1) x1 = x;
        if (x > x2) x2 = x;
        if (y < y1) y1 = y;
        if (y > y2) y2 = y;
      }
    }
  }
  if (x2 < 0) return canvas;
  const pad = 6;
  x1 = Math.max(0, x1 - pad);
  y1 = Math.max(0, y1 - pad);
  x2 = Math.min(width - 1, x2 + pad);
  y2 = Math.min(height - 1, y2 + pad);
  const out = document.createElement('canvas');
  out.width = x2 - x1 + 1;
  out.height = y2 - y1 + 1;
  out.getContext('2d')?.drawImage(canvas, x1, y1, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}
