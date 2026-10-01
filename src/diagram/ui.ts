/** Diagram rendering in the editor and the diagram dialog (DIAG-001, DIAG-002). */
import { t } from '../i18n';
import { button, h } from '../app/dom';
import { DIAGRAM_TEMPLATES } from './templates';
import { renderDiagramSvg, svgDataUrl } from './mermaid';

function errorMessage(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  return text.split('\n').slice(0, 6).join('\n');
}

/** Render every `span.diagram` placeholder inside `root` as a picture. */
export async function renderDiagrams(root: HTMLElement): Promise<void> {
  const spans = Array.from(root.querySelectorAll<HTMLElement>('span.diagram[data-source]')).filter((s) => s.dataset.rendered !== s.dataset.source);
  for (const span of spans) {
    const source = span.dataset.source ?? '';
    try {
      const { svg, width, height } = await renderDiagramSvg(source);
      if (span.dataset.source !== source) continue; // edited meanwhile
      const img = h('img', { src: svgDataUrl(svg), alt: t('diagram.alt'), width: String(width), height: String(height), draggable: 'false' });
      span.replaceChildren(img);
      span.classList.remove('diagram-error');
      span.title = t('diagram.clickToEdit');
    } catch (err) {
      // Keep the source visible and say what is wrong (DIAG-002).
      span.replaceChildren(source);
      span.classList.add('diagram-error');
      span.title = `${t('diagram.invalid')}\n${errorMessage(err)}`;
    }
    span.dataset.rendered = source;
    span.setAttribute('role', 'img');
    span.setAttribute('aria-label', t('diagram.alt'));
  }
}

/** Modal Mermaid editor with templates and a live preview. Resolves to the new source, or null when cancelled. */
export function editDiagram(host: HTMLElement, initial = ''): Promise<string | null> {
  return new Promise((resolve) => {
    const source = h('textarea', { class: 'diagram-source', rows: '12', wrap: 'off', spellcheck: 'false', 'aria-label': t('diagram.source') });
    source.value = initial || DIAGRAM_TEMPLATES[0]!.source;
    const template = h(
      'select',
      { 'aria-label': t('diagram.template'), title: t('diagram.template') },
      h('option', { value: '' }, t('diagram.template')),
      ...DIAGRAM_TEMPLATES.map((tpl) => h('option', { value: tpl.id }, t(tpl.label))),
    );
    const preview = h('div', { class: 'diagram-preview', 'aria-label': t('diagram.preview') });
    const error = h('pre', { class: 'diagram-message', 'aria-live': 'polite' });
    let timer: ReturnType<typeof setTimeout> | undefined;
    let generation = 0;

    const update = async (): Promise<void> => {
      const mine = ++generation;
      const text = source.value;
      if (!text.trim()) {
        preview.replaceChildren();
        error.textContent = '';
        return;
      }
      try {
        const { svg, width, height } = await renderDiagramSvg(text);
        if (mine !== generation) return;
        preview.replaceChildren(h('img', { src: svgDataUrl(svg), alt: t('diagram.alt'), width: String(width), height: String(height) }));
        error.textContent = '';
      } catch (err) {
        if (mine !== generation) return;
        error.textContent = `${t('diagram.invalid')}\n${errorMessage(err)}`;
      }
    };
    const schedule = (): void => {
      clearTimeout(timer);
      timer = setTimeout(() => void update(), 300);
    };
    source.addEventListener('input', schedule);
    template.addEventListener('change', () => {
      const tpl = DIAGRAM_TEMPLATES.find((x) => x.id === template.value);
      template.value = '';
      if (!tpl) return;
      source.value = tpl.source;
      void update();
      source.focus();
    });

    const dialog = h('dialog', { class: 'dialog diagram-dialog', 'aria-labelledby': 'diagram-title' });
    const finish = (ok: boolean): void => {
      clearTimeout(timer);
      generation++;
      dialog.close();
      dialog.remove();
      resolve(ok && source.value.trim() ? source.value.replace(/\s+$/, '') : null);
    };
    dialog.append(
      h('h2', { id: 'diagram-title' }, initial ? t('diagram.editTitle') : t('diagram.insertTitle')),
      h('div', { class: 'diagram-toolbar' }, template, h('a', { href: 'https://mermaid.js.org/intro/syntax-reference.html', target: '_blank', rel: 'noopener noreferrer' }, t('diagram.syntax'))),
      h('div', { class: 'diagram-panes' }, source, preview),
      error,
      h(
        'div',
        { class: 'dialog-actions' },
        button(t('common.cancel'), () => finish(false)),
        button(initial ? t('diagram.update') : t('diagram.insert'), () => finish(true), { className: 'primary' }),
      ),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(false);
    });
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    void update();
    setTimeout(() => source.focus(), 0);
  });
}
