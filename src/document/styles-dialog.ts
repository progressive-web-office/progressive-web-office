/** DOC-053: the "Styles…" window — the named paragraph styles of the document, made, changed, renamed and deleted. */
import { button, h } from '../app/dom';
import { t, type MessageKey } from '../i18n';
import { cleanNamedStyles, namedStylesCss, styleId, type NamedStyle } from './styles';
import type { Align } from './model';

export interface StylesChoice {
  styles: NamedStyle[];
  /** A style to give the current paragraph(s) now. */
  apply?: string;
}

/**
 * Edit the styles; `fromParagraph` is the look of the current paragraph, for
 * a new style made from it.
 */
export function chooseStyles(host: HTMLElement, initial: NamedStyle[], fromParagraph: Omit<NamedStyle, 'id' | 'name'>, current?: string): Promise<StylesChoice | null> {
  return new Promise((resolve) => {
    let styles = initial.map((s) => ({ ...s }));
    let selected = current && styles.some((s) => s.id === current) ? current : styles[0]?.id;
    const preview = h('style');
    const list = h('ul', { class: 'styles-list', role: 'listbox', 'aria-label': t('styles.list') });
    const editor = h('div', { class: 'styles-editor' });
    const dialog = h('dialog', { class: 'dialog styles-dialog', 'aria-labelledby': 'styles-title' });
    const finish = (v: StylesChoice | null): void => {
      dialog.close();
      dialog.remove();
      resolve(v);
    };
    const render = (): void => {
      preview.textContent = namedStylesCss(styles, '.styles-dialog');
      list.replaceChildren(
        ...(styles.length
          ? styles.map((s) => {
              const li = h('li', { role: 'option', 'aria-selected': String(s.id === selected), tabindex: '0' }, h('span', { 'data-named': s.id, class: 'styles-sample' }, s.name));
              li.addEventListener('click', () => {
                selected = s.id;
                render();
              });
              li.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  selected = s.id;
                  render();
                }
              });
              return li;
            })
          : [h('li', { class: 'hint' }, t('styles.none'))]),
      );
      renderEditor();
    };
    const renderEditor = (): void => {
      const s = styles.find((x) => x.id === selected);
      if (!s) return void editor.replaceChildren();
      const update = (patch: Partial<NamedStyle>): void => {
        const i = styles.findIndex((x) => x.id === s.id);
        const next = { ...styles[i]!, ...patch };
        for (const k of Object.keys(patch) as (keyof NamedStyle)[]) if (patch[k] === undefined || patch[k] === false || patch[k] === '') delete next[k];
        styles[i] = cleanNamedStyles([next])?.[0] ?? styles[i]!;
        preview.textContent = namedStylesCss(styles, '.styles-dialog');
        list.querySelector(`[data-named="${s.id}"]`)!.textContent = styles[i]!.name;
      };
      const field = (label: MessageKey, control: HTMLElement): HTMLElement => h('label', { class: 'field' }, t(label), control);
      const text = (value: string | undefined, onChange: (v: string) => void, attrs: Record<string, string> = {}): HTMLInputElement => {
        const el = h('input', { type: 'text', value: value ?? '', ...attrs });
        el.addEventListener('change', () => onChange(el.value.trim()));
        return el;
      };
      const num = (value: number | undefined, onChange: (v: number | undefined) => void, attrs: Record<string, string> = {}): HTMLInputElement => {
        const el = h('input', { type: 'number', step: 'any', value: value === undefined ? '' : String(value), ...attrs });
        el.addEventListener('change', () => onChange(el.value.trim() === '' ? undefined : Number(el.value)));
        return el;
      };
      const flag = (key: 'bold' | 'italic' | 'underline' | 'smallCaps', label: MessageKey): HTMLElement => {
        const el = h('input', { type: 'checkbox', checked: !!s[key] });
        el.addEventListener('change', () => update({ [key]: el.checked || undefined }));
        return h('label', { class: 'check' }, el, ` ${t(label)}`);
      };
      const useColor = h('input', { type: 'checkbox', checked: !!s.color });
      const color = h('input', { type: 'color', value: s.color ?? '#000000' });
      const setColor = (): void => update({ color: useColor.checked ? color.value : undefined });
      useColor.addEventListener('change', setColor);
      color.addEventListener('input', () => {
        useColor.checked = true;
        setColor();
      });
      const align = h('select', {}, ...(['', 'left', 'center', 'right', 'justify'] as const).map((a) => h('option', { value: a, selected: (s.align ?? '') === a }, a ? t(`styles.align.${a}` as MessageKey) : t('styles.inherit'))));
      align.addEventListener('change', () => update({ align: (align.value || undefined) as Align | undefined }));
      editor.replaceChildren(
        field('styles.name', text(s.name, (v) => v && update({ name: v }))),
        h(
          'div',
          { class: 'styles-row' },
          field('styles.font', text(s.font, (v) => update({ font: v || undefined }), { placeholder: t('styles.inherit') })),
          field('styles.size', num(s.size, (v) => update({ size: v }), { min: '1', max: '999', placeholder: 'pt' })),
          h('label', { class: 'check' }, useColor, ` ${t('styles.color')} `, color),
        ),
        h('div', { class: 'styles-row' }, flag('bold', 'styles.bold'), flag('italic', 'styles.italic'), flag('underline', 'styles.underline'), flag('smallCaps', 'styles.smallCaps')),
        h(
          'div',
          { class: 'styles-row' },
          field('styles.align', align),
          field('styles.spaceBefore', num(s.spaceBefore, (v) => update({ spaceBefore: v }), { placeholder: 'pt' })),
          field('styles.spaceAfter', num(s.spaceAfter, (v) => update({ spaceAfter: v }), { placeholder: 'pt' })),
          field('styles.indent', num(s.indent, (v) => update({ indent: v }), { placeholder: 'pt' })),
          field('styles.firstLine', num(s.firstLine, (v) => update({ firstLine: v }), { placeholder: 'pt' })),
          field('styles.lineHeight', num(s.lineHeight, (v) => update({ lineHeight: v }), { min: '0.5', max: '5', step: '0.05', placeholder: '1.0' })),
        ),
        h(
          'div',
          { class: 'dialog-actions start' },
          button(t('styles.applyHere'), () => finish({ styles, apply: s.id }), { icon: '¶' }),
          button(t('styles.delete'), () => {
            if (!window.confirm(t('styles.deleteConfirm', { name: s.name }))) return;
            styles = styles.filter((x) => x.id !== s.id);
            selected = styles[0]?.id;
            render();
          }, { icon: '🗑' }),
        ),
      );
    };
    const create = button(t('styles.newFromParagraph'), () => {
      const name = window.prompt(t('styles.newName'))?.trim();
      if (!name) return;
      const id = styleId(name, styles.map((s) => s.id));
      styles.push(cleanNamedStyles([{ ...fromParagraph, id, name }])?.[0] ?? { id, name });
      selected = id;
      render();
    }, { icon: '➕' });
    dialog.append(
      preview,
      h('h2', { id: 'styles-title' }, t('styles.title')),
      h('p', { class: 'hint' }, t('styles.intro')),
      h('div', { class: 'styles-body' }, h('div', {}, list, create), editor),
      h('div', { class: 'dialog-actions' }, button(t('common.cancel'), () => finish(null)), button(t('styles.save'), () => finish({ styles }), { className: 'primary' })),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(null);
    });
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    render();
  });
}
