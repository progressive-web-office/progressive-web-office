/** Equation rendering in the editor and the equation dialog (MATH-001, MATH-002). */
import { t } from '../i18n';
import { button, h } from '../app/dom';
import { latexToMarkup, loadMathLive } from './mathlive';

const FORBIDDEN = new Set(['script', 'iframe', 'object', 'embed', 'foreignobject', 'link', 'meta', 'style', 'form', 'input', 'button']);

/** Keep MathLive's presentational markup only (defence in depth against crafted LaTeX). */
export function sanitizeMarkup(html: string): DocumentFragment {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const walk = (el: Element): void => {
    for (const child of Array.from(el.children)) {
      const tag = child.localName.toLowerCase();
      if (FORBIDDEN.has(tag)) {
        child.remove();
        continue;
      }
      for (const a of Array.from(child.attributes)) {
        const name = a.name.toLowerCase();
        if (name.startsWith('on') || name === 'href' || name === 'xlink:href' || name === 'src' || name === 'srcset' || name === 'formaction') child.removeAttribute(a.name);
      }
      if (tag === 'a') child.replaceWith(...Array.from(child.childNodes));
      walk(child);
    }
  };
  walk(doc.body);
  const frag = document.createDocumentFragment();
  frag.append(...Array.from(doc.body.childNodes));
  return frag;
}

/** Render every `span.math` placeholder inside `root` with MathLive. */
export async function renderMath(root: HTMLElement): Promise<void> {
  const spans = Array.from(root.querySelectorAll<HTMLElement>('span.math[data-latex]')).filter((s) => s.dataset.rendered !== s.dataset.latex);
  if (!spans.length) return;
  for (const span of spans) {
    const latex = span.dataset.latex ?? '';
    try {
      const markup = await latexToMarkup(latex, span.dataset.display === 'true');
      span.replaceChildren(sanitizeMarkup(markup));
      span.dataset.rendered = latex;
      span.setAttribute('role', 'img');
      span.setAttribute('aria-label', latex);
      span.title = t('math.clickToEdit');
    } catch {
      /* keep the $...$ fallback text */
    }
  }
}

export interface EquationValue {
  latex: string;
  display: boolean;
}

/** Modal equation editor with a MathLive math field. Resolves to null when cancelled. */
export async function editEquation(host: HTMLElement, initial: EquationValue = { latex: '', display: false }): Promise<EquationValue | null> {
  await loadMathLive();
  return new Promise((resolve) => {
    const field = document.createElement('math-field') as HTMLElement & { value: string };
    field.className = 'equation-field';
    field.setAttribute('aria-label', t('math.field'));
    field.value = initial.latex;
    const source = h('input', { type: 'text', class: 'equation-source', 'aria-label': t('math.source'), spellcheck: 'false' });
    source.value = initial.latex;
    field.addEventListener('input', () => (source.value = field.value));
    source.addEventListener('input', () => (field.value = source.value));
    const display = h('input', { type: 'checkbox', id: 'eq-display' });
    display.checked = initial.display;
    const dialog = h('dialog', { class: 'dialog equation-dialog', 'aria-labelledby': 'eq-title' });
    const finish = (ok: boolean): void => {
      dialog.close();
      dialog.remove();
      resolve(ok && source.value.trim() ? { latex: source.value.trim(), display: display.checked } : null);
    };
    dialog.append(
      h('h2', { id: 'eq-title' }, initial.latex ? t('math.editTitle') : t('math.insertTitle')),
      field,
      h('label', { class: 'equation-label' }, 'LaTeX ', source),
      h('label', { class: 'check', for: 'eq-display' }, display, ` ${t('math.display')}`),
      h('div', { class: 'dialog-actions' }, button(t('common.cancel'), () => finish(false)), button(initial.latex ? t('math.update') : t('math.insert'), () => finish(true), { className: 'primary' })),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(false);
    });
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    setTimeout(() => field.focus(), 0);
  });
}
