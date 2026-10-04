/**
 * DRAW-008: a bitmap painting editor, for a new picture or a picture of a
 * document — pencil, brush, eraser, fill, shapes, text, colour picker,
 * selection moved, copied or deleted, canvas resized, undo, zoom.
 */
import { button, h } from '../app/dom';
import { t } from '../i18n';
import { along, floodFill, hexToRgba, keepsAlpha, pixelAt, rectBetween, rgbaToHex } from './pixels';

export interface PaintedPicture {
  bytes: Uint8Array;
  mediaType: string;
  width: number;
  height: number;
}

type Tool = 'pencil' | 'brush' | 'eraser' | 'fill' | 'line' | 'rect' | 'ellipse' | 'text' | 'picker' | 'select';
type Pt = [number, number];
interface Rect { x: number; y: number; w: number; h: number }

const MAX_UNDO = 30;

export async function paintPicture(host: HTMLElement, source?: { bytes: Uint8Array; mediaType: string }, size: { width: number; height: number } = { width: 800, height: 500 }): Promise<PaintedPicture | null> {
  const bitmap = source ? await createImageBitmap(new Blob([source.bytes as BlobPart], { type: source.mediaType })) : undefined;
  const mediaType = source && ['image/png', 'image/jpeg', 'image/webp'].includes(source.mediaType) ? source.mediaType : 'image/png';
  const opaque = !keepsAlpha(mediaType);
  return new Promise((resolve) => {
    const canvas = h('canvas', { class: 'paint-canvas', tabindex: '0', role: 'img', 'aria-label': t('paint.canvas') });
    const overlay = h('canvas', { class: 'paint-overlay', 'aria-hidden': 'true' });
    canvas.width = overlay.width = bitmap?.width ?? size.width;
    canvas.height = overlay.height = bitmap?.height ?? size.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const octx = overlay.getContext('2d')!;
    if (bitmap) ctx.drawImage(bitmap, 0, 0);
    else {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    bitmap?.close();

    let tool: Tool = 'brush';
    let zoom = Math.min(1, 900 / canvas.width);
    let changed = false;
    const undo: ImageData[] = [];
    const redo: ImageData[] = [];
    const snapshot = (): void => {
      undo.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
      if (undo.length > MAX_UNDO) undo.shift();
      redo.length = 0;
      changed = true;
      sync();
    };
    const restore = (from: ImageData[], to: ImageData[]): void => {
      commitFloat();
      const img = from.pop();
      if (!img) return;
      to.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
      setSize(img.width, img.height);
      ctx.putImageData(img, 0, 0);
      selection = undefined;
      drawOverlay();
      sync();
    };

    // --- controls ------------------------------------------------------------------
    const colorInput = h('input', { type: 'color', value: '#1f2937', 'aria-label': t('paint.color') });
    const sizeInput = h('input', { type: 'range', min: '1', max: '64', value: '6', 'aria-label': t('paint.size') });
    const sizeLabel = h('span', { class: 'paint-value' }, '6 px');
    const opacityInput = h('input', { type: 'range', min: '5', max: '100', value: '100', 'aria-label': t('paint.opacity') });
    const opacityLabel = h('span', { class: 'paint-value' }, '100 %');
    const filled = h('input', { type: 'checkbox' });
    sizeInput.addEventListener('input', () => (sizeLabel.textContent = `${sizeInput.value} px`));
    opacityInput.addEventListener('input', () => (opacityLabel.textContent = `${opacityInput.value} %`));
    const color = (): string => colorInput.value;
    const width = (): number => Number(sizeInput.value);
    const alpha = (): number => Number(opacityInput.value) / 100;
    const status = h('p', { class: 'paint-status', role: 'status' });

    const tools: [Tool, string, string][] = [
      ['pencil', '✏', t('paint.pencil')], ['brush', '🖌', t('paint.brush')], ['eraser', '⌫', t('paint.eraser')], ['fill', '🪣', t('paint.fill')],
      ['line', '╱', t('draw.line')], ['rect', '▭', t('draw.rect')], ['ellipse', '◯', t('draw.ellipse')], ['text', 'T', t('draw.text')],
      ['picker', '💧', t('paint.picker')], ['select', '⬚', t('paint.select')],
    ];
    const toolButtons = tools.map(([value, icon, label]) => {
      const b = button(label, () => setTool(value), { text: icon, title: label, pressed: value === tool });
      b.dataset.tool = value;
      return b;
    });
    const setTool = (value: Tool): void => {
      if (value !== 'select') commitFloat();
      tool = value;
      for (const b of toolButtons) b.setAttribute('aria-pressed', String(b.dataset.tool === tool));
      canvas.dataset.tool = tool;
      drawOverlay();
    };
    const undoBtn = button(t('common.undo'), () => restore(undo, redo), { text: '↶', title: t('common.undo') });
    const redoBtn = button(t('common.redo'), () => restore(redo, undo), { text: '↷', title: t('common.redo') });
    const zoomLabel = h('span', { class: 'paint-value' });
    const wInput = h('input', { type: 'number', min: '1', max: '8000', 'aria-label': t('draw.widthPx'), class: 'draw-size' });
    const hInput = h('input', { type: 'number', min: '1', max: '8000', 'aria-label': t('draw.heightPx'), class: 'draw-size' });
    const sync = (): void => {
      undoBtn.disabled = !undo.length;
      redoBtn.disabled = !redo.length;
      zoomLabel.textContent = `${Math.round(zoom * 100)} %`;
      for (const c of [canvas, overlay]) {
        c.style.width = `${canvas.width * zoom}px`;
        c.style.height = `${canvas.height * zoom}px`;
      }
      wInput.value = String(canvas.width);
      hInput.value = String(canvas.height);
      status.textContent = `${canvas.width} × ${canvas.height} px${selection ? ` · ${t('paint.selection')} ${selection.w} × ${selection.h}` : ''}`;
    };
    const setSize = (w: number, hh: number): void => {
      if (w === canvas.width && hh === canvas.height) return;
      canvas.width = overlay.width = w;
      canvas.height = overlay.height = hh;
    };
    /** The canvas resized, the picture kept at the top left (the new part white, or clear). */
    const resizeCanvas = (): void => {
      const [w, hh] = [Math.round(Number(wInput.value)), Math.round(Number(hInput.value))];
      if (!(w >= 1 && hh >= 1 && w <= 8000 && hh <= 8000) || (w === canvas.width && hh === canvas.height)) return sync();
      commitFloat();
      snapshot();
      const old = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setSize(w, hh);
      if (opaque || !source) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, hh);
      }
      ctx.putImageData(old, 0, 0);
      selection = undefined;
      sync();
    };
    wInput.addEventListener('change', resizeCanvas);
    hInput.addEventListener('change', resizeCanvas);

    // --- selection ------------------------------------------------------------------
    let selection: Rect | undefined;
    /** Pixels lifted from the picture, moved over it until dropped. */
    let floating: { image: HTMLCanvasElement; x: number; y: number } | undefined;
    let clipboard: HTMLCanvasElement | undefined;
    const cut = (r: Rect): HTMLCanvasElement => {
      const c = h('canvas');
      c.width = r.w;
      c.height = r.h;
      c.getContext('2d')!.putImageData(ctx.getImageData(r.x, r.y, r.w, r.h), 0, 0);
      return c;
    };
    const clear = (r: Rect): void => {
      if (opaque) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(r.x, r.y, r.w, r.h);
      } else ctx.clearRect(r.x, r.y, r.w, r.h);
    };
    const lift = (): void => {
      if (!selection || floating) return;
      snapshot();
      floating = { image: cut(selection), x: selection.x, y: selection.y };
      clear(selection);
    };
    function commitFloat(): void {
      if (!floating) return;
      ctx.drawImage(floating.image, floating.x, floating.y);
      floating = undefined;
      drawOverlay();
    }
    const deleteSelection = (): void => {
      if (floating) {
        floating = undefined;
        selection = undefined;
        return drawOverlay();
      }
      if (!selection) return;
      snapshot();
      clear(selection);
      selection = undefined;
      drawOverlay();
      sync();
    };
    const copy = (): void => {
      if (floating) clipboard = floating.image;
      else if (selection) clipboard = cut(selection);
    };
    const paste = (): void => {
      if (!clipboard) return;
      commitFloat();
      snapshot();
      setTool('select');
      floating = { image: clipboard, x: 0, y: 0 };
      selection = { x: 0, y: 0, w: clipboard.width, h: clipboard.height };
      drawOverlay();
      sync();
    };

    function drawOverlay(preview?: (c: CanvasRenderingContext2D) => void): void {
      octx.clearRect(0, 0, overlay.width, overlay.height);
      if (floating) octx.drawImage(floating.image, floating.x, floating.y);
      if (preview) preview(octx);
      if (selection) {
        const r = floating ? { ...selection, x: floating.x, y: floating.y } : selection;
        octx.save();
        octx.lineWidth = 1 / zoom;
        octx.setLineDash([5 / zoom, 4 / zoom]);
        octx.strokeStyle = '#000';
        octx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
        octx.strokeStyle = '#fff';
        octx.lineDashOffset = 5 / zoom;
        octx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
        octx.restore();
      }
    }

    // --- painting ---------------------------------------------------------------
    const point = (e: PointerEvent): Pt => {
      const r = canvas.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * canvas.width, ((e.clientY - r.top) / r.height) * canvas.height];
    };
    const stroke = (c: CanvasRenderingContext2D): void => {
      c.lineWidth = width();
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.strokeStyle = color();
      c.fillStyle = color();
      c.globalAlpha = alpha();
    };
    const shape = (c: CanvasRenderingContext2D, kind: Tool, a: Pt, b: Pt, square: boolean): void => {
      stroke(c);
      let [w, hh] = [b[0] - a[0], b[1] - a[1]];
      if (square) w = hh = Math.max(Math.abs(w), Math.abs(hh)) * Math.sign(w || 1);
      c.beginPath();
      if (kind === 'line') {
        c.moveTo(...a);
        c.lineTo(...(square ? snap45(a, b) : b));
      } else if (kind === 'rect') c.rect(a[0], a[1], w, square ? Math.abs(w) * Math.sign(hh || 1) : hh);
      else c.ellipse(a[0] + w / 2, a[1] + (square ? Math.abs(w) * Math.sign(hh || 1) : hh) / 2, Math.abs(w / 2), Math.abs((square ? w : hh) / 2), 0, 0, 2 * Math.PI);
      if (filled.checked && kind !== 'line') c.fill();
      else c.stroke();
      c.globalAlpha = 1;
    };
    /** A freehand stroke: drawn on a layer, put down with its opacity when done (no darker overlaps). */
    let layer: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; last: Pt } | undefined;
    let drag: { from: Pt; last: Pt; mode: 'paint' | 'shape' | 'select' | 'move'; offset?: Pt } | undefined;

    const stamp = (from: Pt, to: Pt): void => {
      if (!layer) return;
      const c = layer.ctx;
      if (tool === 'pencil') {
        // Hard pixels: no smoothing.
        c.fillStyle = color();
        const s = Math.max(1, Math.round(width() / 3));
        for (const [x, y] of along(from, to, 0.5)) c.fillRect(Math.floor(x - s / 2 + 0.5), Math.floor(y - s / 2 + 0.5), s, s);
        return;
      }
      c.lineWidth = width();
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.strokeStyle = tool === 'eraser' ? '#000' : color();
      c.beginPath();
      c.moveTo(...from);
      c.lineTo(...to);
      c.stroke();
    };
    const showLayer = (): void => {
      if (!layer) return;
      drawOverlay((c) => {
        c.globalAlpha = tool === 'eraser' ? 0.5 : alpha();
        if (tool === 'eraser') {
          c.fillStyle = '#ffffff';
          c.globalCompositeOperation = 'source-over';
        }
        c.drawImage(layer!.canvas, 0, 0);
        c.globalAlpha = 1;
      });
    };

    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      canvas.focus();
      canvas.setPointerCapture?.(e.pointerId);
      const p = point(e);
      if (tool === 'picker') {
        const [x, y] = [Math.floor(p[0]), Math.floor(p[1])];
        if (x >= 0 && y >= 0 && x < canvas.width && y < canvas.height) colorInput.value = rgbaToHex(pixelAt(ctx.getImageData(x, y, 1, 1).data, 1, 0, 0));
        return;
      }
      if (tool === 'fill') {
        commitFloat();
        snapshot();
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        floodFill(img.data, canvas.width, canvas.height, p[0], p[1], hexToRgba(color(), alpha()));
        ctx.putImageData(img, 0, 0);
        return;
      }
      if (tool === 'text') {
        const text = window.prompt(t('draw.textPrompt'))?.trim();
        if (!text) return;
        commitFloat();
        snapshot();
        ctx.globalAlpha = alpha();
        ctx.fillStyle = color();
        ctx.font = `${Math.max(10, width() * 4)}px sans-serif`;
        ctx.textBaseline = 'top';
        text.split('\n').forEach((line, i) => ctx.fillText(line, p[0], p[1] + i * width() * 4.8));
        ctx.globalAlpha = 1;
        return;
      }
      if (tool === 'select') {
        const r = floating ? { ...selection!, x: floating.x, y: floating.y } : selection;
        if (r && p[0] >= r.x && p[0] <= r.x + r.w && p[1] >= r.y && p[1] <= r.y + r.h) {
          lift();
          drag = { from: p, last: p, mode: 'move', offset: [p[0] - floating!.x, p[1] - floating!.y] };
          return;
        }
        commitFloat();
        selection = undefined;
        drag = { from: p, last: p, mode: 'select' };
        return;
      }
      commitFloat();
      selection = undefined;
      if (tool === 'line' || tool === 'rect' || tool === 'ellipse') {
        drag = { from: p, last: p, mode: 'shape' };
        return;
      }
      const c = h('canvas');
      c.width = canvas.width;
      c.height = canvas.height;
      layer = { canvas: c, ctx: c.getContext('2d')!, last: p };
      drag = { from: p, last: p, mode: 'paint' };
      stamp(p, [p[0] + 0.01, p[1]]);
      showLayer();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const p = point(e);
      if (drag.mode === 'paint') {
        stamp(drag.last, p);
        drag.last = p;
        showLayer();
      } else if (drag.mode === 'shape') {
        drag.last = p;
        drawOverlay((c) => shape(c, tool, drag!.from, p, e.shiftKey));
      } else if (drag.mode === 'select') {
        selection = rectBetween(drag.from, p, canvas.width, canvas.height);
        drawOverlay();
        sync();
      } else if (drag.mode === 'move' && floating) {
        floating.x = Math.round(p[0] - drag.offset![0]);
        floating.y = Math.round(p[1] - drag.offset![1]);
        drawOverlay();
      }
    });
    const release = (e: PointerEvent): void => {
      const dr = drag;
      drag = undefined;
      if (!dr) return;
      if (dr.mode === 'paint' && layer) {
        snapshot();
        ctx.save();
        ctx.globalAlpha = tool === 'eraser' ? 1 : alpha();
        if (tool === 'eraser' && !opaque) ctx.globalCompositeOperation = 'destination-out';
        else if (tool === 'eraser') {
          // Erasing a JPEG paints white.
          const lc = layer.ctx;
          lc.globalCompositeOperation = 'source-in';
          lc.fillStyle = '#ffffff';
          lc.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(layer.canvas, 0, 0);
        ctx.restore();
        layer = undefined;
        drawOverlay();
      } else if (dr.mode === 'shape') {
        if (Math.hypot(dr.last[0] - dr.from[0], dr.last[1] - dr.from[1]) >= 2) {
          snapshot();
          shape(ctx, tool, dr.from, dr.last, e.shiftKey);
        }
        drawOverlay();
      } else if (dr.mode === 'select') {
        if (selection && (selection.w < 2 || selection.h < 2)) selection = undefined;
        drawOverlay();
        sync();
      } else if (dr.mode === 'move' && floating && selection) {
        selection = { ...selection, x: floating.x, y: floating.y };
        drawOverlay();
      }
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);

    const onKey = (e: KeyboardEvent): void => {
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') return void (e.preventDefault(), e.shiftKey ? restore(redo, undo) : restore(undo, redo));
      if (mod && k === 'y') return void (e.preventDefault(), restore(redo, undo));
      if (mod && k === 'c') return void (e.preventDefault(), copy());
      if (mod && k === 'x') return void (e.preventDefault(), copy(), deleteSelection());
      if (mod && k === 'v') return void (e.preventDefault(), paste());
      if (mod && k === 'a') {
        e.preventDefault();
        commitFloat();
        setTool('select');
        selection = { x: 0, y: 0, w: canvas.width, h: canvas.height };
        drawOverlay();
        return sync();
      }
      if (e.key === 'Delete' || e.key === 'Backspace') return void (e.preventDefault(), deleteSelection());
      if (e.key === 'Escape' && (selection || floating)) {
        e.preventDefault();
        e.stopPropagation();
        commitFloat();
        selection = undefined;
        drawOverlay();
        return sync();
      }
      // The selection moved with the arrows (Shift: ten pixels).
      const step = e.shiftKey ? 10 : 1;
      const moves: Record<string, Pt> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (moves[e.key] && selection) {
        e.preventDefault();
        lift();
        floating!.x += moves[e.key]![0];
        floating!.y += moves[e.key]![1];
        selection = { ...selection, x: floating!.x, y: floating!.y };
        drawOverlay();
      }
    };
    canvas.addEventListener('keydown', onKey);

    const setZoom = (z: number): void => {
      zoom = Math.min(8, Math.max(0.1, z));
      sync();
    };

    // --- dialog ------------------------------------------------------------------------
    const dialog = h('dialog', { class: 'dialog paint-dialog', 'aria-labelledby': 'paint-title' });
    const finish = (value: PaintedPicture | null): void => {
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    const done = async (): Promise<void> => {
      commitFloat();
      // A new picture is kept even blank; an edited one only when changed.
      if (!changed && source) return finish(null);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, mediaType, 0.92));
      if (!blob) return finish(null);
      finish({ bytes: new Uint8Array(await blob.arrayBuffer()), mediaType: blob.type || mediaType, width: canvas.width, height: canvas.height });
    };
    dialog.append(
      h('h2', { id: 'paint-title' }, t('paint.title')),
      h(
        'div',
        { class: 'draw-toolbar', role: 'toolbar', 'aria-label': t('paint.tools') },
        h('span', { class: 'draw-group' }, ...toolButtons),
        h('span', { class: 'draw-group' }, undoBtn, redoBtn),
        h(
          'span',
          { class: 'draw-group' },
          button(t('paint.copy'), copy, { text: '⧉', title: `${t('paint.copy')} (Ctrl+C)` }),
          button(t('paint.paste'), paste, { text: '📋', title: `${t('paint.paste')} (Ctrl+V)` }),
          button(t('paint.deleteSelection'), deleteSelection, { text: '🗑', title: `${t('paint.deleteSelection')} (Del)` }),
        ),
        h('span', { class: 'draw-group' }, button(t('draw.zoomOut'), () => setZoom(zoom / 1.25), { text: '−', title: t('draw.zoomOut') }), zoomLabel, button(t('draw.zoomIn'), () => setZoom(zoom * 1.25), { text: '+', title: t('draw.zoomIn') })),
      ),
      h(
        'div',
        { class: 'draw-props', role: 'group', 'aria-label': t('draw.props') },
        h('label', {}, `${t('paint.color')} `, colorInput),
        h('label', {}, `${t('paint.size')} `, sizeInput, sizeLabel),
        h('label', {}, `${t('paint.opacity')} `, opacityInput, opacityLabel),
        h('label', {}, filled, ` ${t('paint.filled')}`),
        h('label', {}, `${t('draw.widthPx')} `, wInput),
        h('label', {}, `${t('draw.heightPx')} `, hInput),
      ),
      h('div', { class: 'paint-scroll' }, h('div', { class: 'paint-stack' }, canvas, overlay)),
      status,
      h('div', { class: 'dialog-actions' }, button(t('common.cancel'), () => finish(null)), button(t('draw.done'), () => void done(), { className: 'primary' })),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      if (!changed || window.confirm(t('paint.discard'))) finish(null);
    });
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    setTool('brush');
    sync();
    canvas.focus();
  });
}

/** The end of a line held to a multiple of 45°. */
function snap45(a: Pt, b: Pt): Pt {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const angle = Math.round(Math.atan2(b[1] - a[1], b[0] - a[0]) / (Math.PI / 4)) * (Math.PI / 4);
  return [a[0] + len * Math.cos(angle), a[1] + len * Math.sin(angle)];
}
