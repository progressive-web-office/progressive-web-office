// Widget view runtime (CODE-016): an anywidget front-end module (AFM) host,
// run inside an <iframe sandbox="allow-scripts"> with an opaque origin and no
// network. The application relays the models' state; this document renders
// them: AFM modules (initialize once per model, render per view, AbortSignal
// cleanups, composition through `host`), and the Jupyter layout widgets
// (boxes, grid, label, HTML). It has no imports: its hash is allowed by the
// Content-Security-Policy.
(() => {
  'use strict';
  const models = new Map(); // id -> Model
  const waiting = new Map(); // id -> [resolve]
  const modules = new Map(); // esm text -> Promise<module>
  const send = (message, transfer) => parent.postMessage({ pwoView: true, ...message }, '*', transfer || []);

  const isBinary = (v) => v instanceof ArrayBuffer || ArrayBuffer.isView(v);
  const same = (a, b) => {
    if (Object.is(a, b)) return true;
    if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
    if (isBinary(a) || isBinary(b)) return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const ka = Object.keys(a);
    return ka.length === Object.keys(b).length && ka.every((k) => same(a[k], b[k]));
  };
  const refId = (ref) => (typeof ref === 'string' ? (/^(?:anywidget:|IPY_MODEL_)(.+)$/.exec(ref) || [])[1] : undefined);

  /** Binary values leave the state as buffers, with their paths. */
  function split(state) {
    const paths = [];
    const buffers = [];
    const walk = (v, path) => {
      if (isBinary(v)) {
        paths.push(path);
        const bytes = v instanceof ArrayBuffer ? new Uint8Array(v) : new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
        buffers.push(bytes.slice().buffer);
        return null;
      }
      if (Array.isArray(v)) return v.map((x, i) => walk(x, [...path, i]));
      if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
        const out = {};
        for (const [k, x] of Object.entries(v)) out[k] = walk(x, [...path, k]);
        return out;
      }
      return v;
    };
    return { state: walk(state, []), paths, buffers };
  }

  class Model {
    constructor(id, state) {
      this.id = id;
      this.state = state;
      this.handlers = new Map();
      this.pending = new Set();
      this.abort = new AbortController();
      this.ready = undefined; // initialize
      this.exports = undefined;
      this.widget_manager = { get_model: (ref) => getModel(refId(ref) || ref) };
    }
    get(key) {
      return this.state[key];
    }
    set(key, value) {
      if (same(this.state[key], value)) return;
      this.state[key] = value;
      this.pending.add(key);
      this.emit(`change:${key}`);
      this.emit('change');
    }
    save_changes() {
      if (!this.pending.size) return;
      const changes = {};
      for (const k of this.pending) changes[k] = this.state[k];
      this.pending.clear();
      const { state, paths, buffers } = split(changes);
      send({ type: 'save', id: this.id, state, paths, buffers }, buffers);
    }
    on(name, callback) {
      for (const n of String(name).split(/\s+/)) this.handlers.set(n, [...(this.handlers.get(n) || []), callback]);
    }
    off(name, callback) {
      if (!name && !callback) return this.handlers.clear();
      for (const n of name ? String(name).split(/\s+/) : [...this.handlers.keys()]) {
        const left = callback ? (this.handlers.get(n) || []).filter((h) => h !== callback) : [];
        if (left.length) this.handlers.set(n, left);
        else this.handlers.delete(n);
      }
    }
    send(content, _callbacks, buffers) {
      const list = (buffers || []).map((b) => (b instanceof ArrayBuffer ? b.slice(0) : new Uint8Array(b.buffer, b.byteOffset, b.byteLength).slice().buffer));
      send({ type: 'custom', id: this.id, content, buffers: list }, list);
    }
    emit(name, ...args) {
      for (const h of [...(this.handlers.get(name) || [])]) {
        try {
          h(...args);
        } catch (err) {
          report(err);
        }
      }
    }
    /** From the application: new values, no echo. */
    update(patch) {
      const changed = Object.keys(patch).filter((k) => !same(this.state[k], patch[k]));
      for (const k of changed) this.state[k] = patch[k];
      for (const k of changed) this.emit(`change:${k}`);
      if (changed.length) this.emit('change');
    }
  }

  function report(err) {
    const message = err && err.message ? err.message : String(err);
    send({ type: 'error', message });
    return message;
  }

  function getModel(id) {
    if (!id) return Promise.reject(new Error('Not a widget reference.'));
    const m = models.get(id);
    if (m) return Promise.resolve(m);
    return new Promise((resolve, reject) => {
      waiting.set(id, [...(waiting.get(id) || []), resolve]);
      send({ type: 'need', id });
      setTimeout(() => reject(new Error(`Unknown widget model “${id}”.`)), 10000);
    });
  }

  function loadModule(esm) {
    if (!modules.has(esm)) {
      const url = URL.createObjectURL(new Blob([esm], { type: 'text/javascript' }));
      modules.set(esm, import(url));
    }
    return modules.get(esm);
  }

  async function widgetOf(mod) {
    let def = mod && 'default' in mod ? mod.default : mod;
    if (typeof def === 'function') def = await def();
    if (!def || (typeof def.render !== 'function' && typeof def.initialize !== 'function')) {
      // anywidget before 0.6: named exports.
      if (mod && typeof mod.render === 'function') return { render: mod.render };
      throw new Error('The widget module exports no initialize or render function.');
    }
    return def;
  }

  function wire(signal, cleanup) {
    if (typeof cleanup !== 'function') return;
    if (signal.aborted) cleanup();
    else signal.addEventListener('abort', () => cleanup(), { once: true });
  }

  /** initialize, once per model (AFM). */
  function initialize(model) {
    model.ready ??= (async () => {
      const def = await widgetOf(await loadModule(model.get('_esm')));
      styles(model);
      model.on('change:_css', () => styles(model));
      if (typeof def.initialize === 'function') {
        const out = await def.initialize({ model, signal: model.abort.signal, experimental: { invoke: () => Promise.reject(new Error('Not supported by this host.')) } });
        if (typeof out === 'function') wire(model.abort.signal, out);
        else if (out && typeof out === 'object') model.exports = out;
      }
      return def;
    })();
    return model.ready;
  }

  function styles(model) {
    const css = model.get('_css');
    const key = model.get('_anywidget_id') || model.id;
    let style = document.querySelector(`style[data-widget="${CSS.escape(key)}"]`);
    if (!css) return style && style.remove();
    if (!style) {
      style = document.createElement('style');
      style.dataset.widget = key;
      document.head.append(style);
    }
    style.textContent = css;
  }

  const host = {
    async getWidget(ref) {
      const model = await getModel(refId(ref));
      await initialize(model);
      return { exports: model.exports, render: ({ el, signal }) => render(model.id, el, signal || new AbortController().signal) };
    },
    getModel: (ref) => getModel(refId(ref)),
  };

  /** CSS of a Jupyter `Layout` model on an element. */
  async function layout(el, ref, signal) {
    const id = refId(ref);
    if (!id) return;
    const m = await getModel(id);
    const apply = () => {
      for (const [k, v] of Object.entries(m.state)) {
        if (k.startsWith('_') || v === null || v === undefined || v === '') continue;
        el.style.setProperty(k.replace(/_/g, '-'), String(v));
      }
    };
    apply();
    m.on('change', apply);
    signal.addEventListener('abort', () => m.off('change', apply), { once: true });
  }

  const BOXES = { HBoxModel: 'flex-row', VBoxModel: 'flex-column', BoxModel: 'flex-row', GridBoxModel: 'grid' };

  /** Render the view of a model into `el` (AFM, or a Jupyter layout widget). */
  async function render(id, el, signal) {
    const model = await getModel(id);
    const name = model.get('_model_name');
    if (model.get('_esm')) {
      const def = await initialize(model);
      if (model.get('layout')) await layout(el, model.get('layout'), signal);
      if (typeof def.render === 'function') wire(signal, await def.render({ model, el, signal, host, experimental: { invoke: () => Promise.reject(new Error('Not supported by this host.')) } }));
      return;
    }
    if (BOXES[name]) {
      const kind = BOXES[name];
      el.classList.add('pwo-box');
      el.style.display = kind === 'grid' ? 'grid' : 'flex';
      if (kind !== 'grid') el.style.flexDirection = kind === 'flex-row' ? 'row' : 'column';
      if (kind !== 'grid') el.style.flexWrap = 'wrap';
      el.style.gap = '8px';
      if (model.get('layout')) await layout(el, model.get('layout'), signal);
      let current = new AbortController();
      const draw = async () => {
        current.abort();
        current = new AbortController();
        const inner = AbortSignal.any([signal, current.signal]);
        el.replaceChildren();
        for (const child of model.get('children') || []) {
          const slot = document.createElement('div');
          slot.className = 'pwo-slot';
          el.append(slot);
          render(refId(child), slot, inner).catch((err) => fail(slot, err));
        }
      };
      model.on('change:children', draw);
      signal.addEventListener('abort', () => {
        current.abort();
        model.off('change:children', draw);
      }, { once: true });
      await draw();
      return;
    }
    if (name === 'LabelModel' || name === 'HTMLModel' || name === 'HTMLMathModel') {
      const show = () => {
        const value = String(model.get('value') ?? '');
        if (name === 'LabelModel') el.textContent = value;
        else el.innerHTML = value; // no script can run: the policy allows only this runtime
      };
      show();
      model.on('change:value', show);
      signal.addEventListener('abort', () => model.off('change:value', show), { once: true });
      if (model.get('layout')) await layout(el, model.get('layout'), signal);
      return;
    }
    el.className = 'pwo-unsupported';
    el.textContent = `${(name || 'Widget').replace(/Model$/, '')}: not supported here (anywidget widgets are).`;
  }

  function fail(el, err) {
    el.className = 'pwo-error';
    el.textContent = report(err);
  }

  /** Copy the computed styles of `src` (and its descendants) onto the copy `dst`. */
  function inline(src, dst) {
    if (!(src instanceof Element)) return;
    const cs = getComputedStyle(src);
    let css = '';
    for (const p of cs) css += `${p}:${cs.getPropertyValue(p)};`;
    dst.setAttribute('style', css);
    // What the user typed lives in properties, not attributes.
    if (src instanceof HTMLInputElement) {
      if (src.type === 'checkbox' || src.type === 'radio') {
        if (src.checked) dst.setAttribute('checked', '');
        else dst.removeAttribute('checked');
      } else dst.setAttribute('value', src.value);
    } else if (src instanceof HTMLTextAreaElement) dst.textContent = src.value;
    else if (src instanceof HTMLSelectElement) {
      Array.from(dst.options || []).forEach((o, i) => (i === src.selectedIndex ? o.setAttribute('selected', '') : o.removeAttribute('selected')));
    }
    if (src instanceof HTMLCanvasElement) {
      try {
        const img = document.createElement('img');
        img.src = src.toDataURL('image/png');
        img.setAttribute('style', css);
        dst.replaceWith(img);
      } catch {
        /* a canvas that cannot be read stays empty */
      }
      return;
    }
    const a = src.children;
    const b = dst.children;
    for (let i = 0; i < a.length && i < b.length; i++) inline(a[i], b[i]);
  }

  /** A PNG picture of the view (for print, export and reopening the document). */
  async function snapshot() {
    const root = document.getElementById('root');
    // Cropped to what is drawn.
    const box = root.getBoundingClientRect();
    let right = 0;
    const extend = (r) => {
      if (r.width && r.height) right = Math.max(right, r.right - box.left);
    };
    for (const el of root.querySelectorAll('svg, canvas, img, input, button, select, textarea, video')) extend(el.getBoundingClientRect());
    const texts = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = texts.nextNode(); n; n = texts.nextNode()) {
      if (!n.textContent.trim() || n.parentElement.closest('svg')) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      extend(range.getBoundingClientRect());
    }
    if (!right) right = box.width;
    const width = Math.max(1, Math.min(Math.ceil(box.width), Math.ceil(right) + 4));
    const height = Math.max(1, Math.ceil(root.scrollHeight));
    const copy = root.cloneNode(true);
    inline(root, copy);
    copy.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    const xhtml = new XMLSerializer().serializeToString(copy);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject x="0" y="0" width="100%" height="100%">${xhtml}</foreignObject></svg>`;
    // A data: URL: an SVG with HTML drawn from a blob: URL taints the canvas.
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('The widget could not be drawn.'));
        img.src = url;
      });
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = document.documentElement.classList.contains('dark') ? '#1c2430' : '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      return blob ? await blob.arrayBuffer() : null;
    }
  }

  addEventListener('message', (event) => {
    if (event.source !== parent) return;
    const m = event.data || {};
    if (m.type === 'snapshot') {
      snapshot().then(
        (png) => send({ type: 'snapshot', req: m.req, png }, png ? [png] : []),
        (err) => send({ type: 'snapshot', req: m.req, png: null, message: String(err && err.message) }),
      );
      return;
    }
    if (m.type === 'model') {
      const existing = models.get(m.id);
      if (existing) existing.update(m.state);
      else models.set(m.id, new Model(m.id, m.state));
      for (const resolve of waiting.get(m.id) || []) resolve(models.get(m.id));
      waiting.delete(m.id);
    } else if (m.type === 'update') {
      models.get(m.id)?.update(m.state);
    } else if (m.type === 'custom') {
      models.get(m.id)?.emit('msg:custom', m.content, (m.buffers || []).map((b) => new DataView(b)));
    } else if (m.type === 'closed') {
      const model = models.get(m.id);
      if (model) {
        model.abort.abort();
        models.delete(m.id);
      }
    } else if (m.type === 'render') {
      const root = document.getElementById('root');
      root.replaceChildren();
      const el = document.createElement('div');
      root.append(el);
      render(m.id, el, new AbortController().signal).catch((err) => fail(el, err));
    }
  });

  // The application sizes the frame to its content.
  let last = 0;
  const measure = () => {
    const root = document.getElementById('root');
    const height = Math.ceil(Math.max(root.scrollHeight, root.getBoundingClientRect().height) + 8);
    if (height !== last) {
      last = height;
      send({ type: 'size', height });
    }
  };
  const sizes = new ResizeObserver(measure);
  sizes.observe(document.getElementById('root'));
  // Widgets draw late (fonts, animations, nested views): their elements are watched too.
  new MutationObserver(() => {
    for (const el of document.getElementById('root').querySelectorAll('*')) if (el.childElementCount === 0 || el instanceof SVGSVGElement) sizes.observe(el);
    measure();
  }).observe(document.getElementById('root'), { childList: true, subtree: true });
  send({ type: 'ready' });
})();
