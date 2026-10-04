/**
 * DRAW-019: zooming and panning a picture being edited, as in other drawing
 * programs — the wheel zooms where the pointer is (a pinch on a touchpad
 * too), the middle button drags the view, and on a touch screen two fingers
 * pinch to zoom and move together to pan (one finger keeps drawing).
 */

export interface ZoomPanOptions {
  /** The element shown at the zoom (to keep the point under the pointer in place). */
  content(): Element;
  zoom(): number;
  /** Apply a new zoom (the caller bounds it and draws again). */
  setZoom(z: number): void;
  /** Two fingers came down while one was drawing: undo what it began. */
  cancel?(): void;
}

/** Zoom by `factor` keeping the point at `at` (client coordinates; the middle of the view otherwise) in place. */
export function zoomAt(scroller: HTMLElement, opts: ZoomPanOptions, z: number, at?: { x: number; y: number }): void {
  const before = opts.content().getBoundingClientRect();
  const view = scroller.getBoundingClientRect();
  const ax = at?.x ?? view.left + view.width / 2;
  const ay = at?.y ?? view.top + view.height / 2;
  const old = opts.zoom();
  const ux = (ax - before.left) / old;
  const uy = (ay - before.top) / old;
  opts.setZoom(z);
  const now = opts.zoom();
  const after = opts.content().getBoundingClientRect();
  scroller.scrollLeft += after.left + ux * now - ax;
  scroller.scrollTop += after.top + uy * now - ay;
}

/** Install the wheel, middle-button and two-finger gestures on the scrolling view. */
export function attachZoomPan(scroller: HTMLElement, opts: ZoomPanOptions): void {
  scroller.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      // Pixels, lines or pages; a pinch on a touchpad comes as a wheel with Ctrl.
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
      zoomAt(scroller, opts, opts.zoom() * Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015)), { x: e.clientX, y: e.clientY });
    },
    { passive: false },
  );
  let pan: { x: number; y: number; id: number } | undefined;
  scroller.addEventListener('mousedown', (e) => e.button === 1 && e.preventDefault());
  scroller.addEventListener('pointerdown', (e) => {
    if (e.button !== 1) return;
    e.preventDefault();
    pan = { x: e.clientX, y: e.clientY, id: e.pointerId };
    scroller.setPointerCapture?.(e.pointerId);
    scroller.classList.add('panning');
  });
  scroller.addEventListener('pointermove', (e) => {
    if (!pan || e.pointerId !== pan.id) return;
    scroller.scrollLeft -= e.clientX - pan.x;
    scroller.scrollTop -= e.clientY - pan.y;
    pan = { ...pan, x: e.clientX, y: e.clientY };
  });
  const endPan = (e: PointerEvent): void => {
    if (pan?.id !== e.pointerId) return;
    pan = undefined;
    scroller.classList.remove('panning');
  };
  scroller.addEventListener('pointerup', endPan);
  scroller.addEventListener('pointercancel', endPan);

  // Two fingers: whatever the first began is undone, then they pinch and pan.
  const touches = new Map<number, { x: number; y: number }>();
  let pinch: { dist: number; zoom: number; mid: { x: number; y: number } } | undefined;
  const spread = (): { dist: number; mid: { x: number; y: number } } => {
    const [a, b] = [...touches.values()] as [{ x: number; y: number }, { x: number; y: number }];
    return { dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  };
  scroller.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType !== 'touch') return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size !== 2) return;
      e.stopPropagation();
      opts.cancel?.();
      const s = spread();
      pinch = { dist: s.dist, zoom: opts.zoom(), mid: s.mid };
    },
    true,
  );
  scroller.addEventListener(
    'pointermove',
    (e) => {
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!pinch || touches.size !== 2) return;
      e.stopPropagation();
      const s = spread();
      scroller.scrollLeft -= s.mid.x - pinch.mid.x;
      scroller.scrollTop -= s.mid.y - pinch.mid.y;
      pinch.mid = s.mid;
      zoomAt(scroller, opts, (pinch.zoom * s.dist) / pinch.dist, s.mid);
    },
    true,
  );
  const lift = (e: PointerEvent): void => {
    touches.delete(e.pointerId);
    if (touches.size < 2) pinch = undefined;
  };
  scroller.addEventListener('pointerup', lift, true);
  scroller.addEventListener('pointercancel', lift, true);
}
