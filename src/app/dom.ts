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

/** UI-019: a spinner turning before a text of work in progress, for a status line or a hint. */
export function busyText(text: string): Node[] {
  return [h('span', { class: 'spinner', 'aria-hidden': 'true' }), document.createTextNode(` ${text}`)];
}

/**
 * UI-019: the text of a status line; a text of work in progress (ending with
 * "…": loading, checking, searching…) turns a spinner before it.
 */
export function setStatus(el: HTMLElement, text: string, error = false): void {
  if (!error && text.trim().endsWith('…')) el.replaceChildren(...busyText(text));
  else el.textContent = text;
  el.classList.toggle('error', error);
}

/** Toolbar button helper with accessible label and optional tooltip. */
export function button(
  label: string,
  onClick: (ev: MouseEvent) => void,
  opts: { title?: string; className?: string; text?: string; pressed?: boolean; icon?: string } = {},
): HTMLButtonElement {
  const b = h(
    'button',
    {
      type: 'button',
      class: opts.className,
      title: opts.title ?? label,
      'aria-label': opts.text !== undefined && opts.text !== label ? label : undefined,
      'aria-pressed': opts.pressed === undefined ? undefined : String(opts.pressed),
      // Decorative icon, drawn by CSS (::before) so that the name stays the label.
      'data-icon': opts.icon,
    },
    opts.text ?? label,
  );
  // Keep the editor selection when clicking toolbar buttons.
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', onClick);
  return b;
}
