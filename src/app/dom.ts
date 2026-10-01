/** Minimal hyperscript-style DOM builder (no innerHTML, so no injection). */

type Attrs = Record<string, string | number | boolean | EventListener | undefined | null>;
type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...kids: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'class') {
      el.className = String(value);
    } else if (value === true) {
      el.setAttribute(key, '');
    } else {
      el.setAttribute(key, String(value));
    }
  }
  for (const kid of kids) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(typeof kid === 'string' ? document.createTextNode(kid) : kid);
  }
  return el;
}

/** Toolbar button helper with accessible label and optional tooltip. */
export function button(
  label: string,
  onClick: (ev: MouseEvent) => void,
  opts: { title?: string; className?: string; text?: string; pressed?: boolean } = {},
): HTMLButtonElement {
  const b = h(
    'button',
    {
      type: 'button',
      class: opts.className,
      title: opts.title ?? label,
      'aria-label': opts.text !== undefined && opts.text !== label ? label : undefined,
      'aria-pressed': opts.pressed === undefined ? undefined : String(opts.pressed),
    },
    opts.text ?? label,
  );
  // Keep the editor selection when clicking toolbar buttons.
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', onClick);
  return b;
}
