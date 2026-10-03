/** "Snippets…" dialog (DOC-037): insert a snippet, or write, edit and delete the user's own. */
import { button, h } from '../app/dom';
import { t, type MessageKey } from '../i18n';
import { loadSnippets, saveSnippets, type Snippet } from './snippets';

/** Resolves to the snippet to insert, or null. `selected`: text to start a new snippet from. */
export function chooseSnippet(host: HTMLElement, all: Snippet[], selected = ''): Promise<Snippet | null> {
  return new Promise((resolve) => {
    let list = all;
    const dialog = h('dialog', { class: 'dialog snippets-dialog', 'aria-labelledby': 'snippets-title' });
    const finish = (r: Snippet | null): void => {
      dialog.close();
      dialog.remove();
      resolve(r);
    };
    const name = h('input', { type: 'text', 'aria-label': t('snippet.name'), placeholder: t('snippet.name') });
    const body = h('textarea', { rows: '5', 'aria-label': t('snippet.body'), placeholder: t('snippet.bodyHint') }) as HTMLTextAreaElement;
    body.value = selected;
    const lists = h('div', { class: 'snippet-lists' });
    const save = (): void => {
      const n = name.value.trim();
      if (!n || !body.value.trim()) return;
      const mine = loadSnippets().filter((s) => s.name.toLowerCase() !== n.toLowerCase());
      saveSnippets([...mine, { name: n, body: body.value }]);
      list = [{ name: n, body: body.value, origin: 'mine' }, ...list.filter((s) => !(s.origin === 'mine' && s.name.toLowerCase() === n.toLowerCase()))];
      name.value = '';
      body.value = '';
      render();
    };
    const render = (): void => {
      lists.replaceChildren(
        ...(['folder', 'mine', 'builtin'] as const).flatMap((origin) => {
          const items = list.filter((s) => s.origin === origin);
          if (!items.length) return [];
          return [
            h(
              'section',
              { class: 'snippet-group', 'aria-label': t(`snippet.origin.${origin}` as MessageKey) },
              h('h3', {}, t(`snippet.origin.${origin}` as MessageKey)),
              h(
                'ul',
                { role: 'list' },
                ...items.map((s) =>
                  h(
                    'li',
                    {},
                    button(s.name, () => finish(s), { className: 'snippet-insert', title: s.body }),
                    h('code', { class: 'snippet-preview' }, s.body.replace(/\n/g, ' ⏎ ').slice(0, 60)),
                    origin === 'mine'
                      ? h(
                          'span',
                          {},
                          button(t('snippet.edit', { name: s.name }), () => {
                            name.value = s.name;
                            body.value = s.body;
                            body.focus();
                          }, { text: '✎', className: 'icon' }),
                          button(t('snippet.delete', { name: s.name }), () => {
                            saveSnippets(loadSnippets().filter((x) => x.name !== s.name));
                            list = list.filter((x) => x !== s);
                            render();
                          }, { text: '✕', className: 'icon' }),
                        )
                      : '',
                  ),
                ),
              ),
            ),
          ];
        }),
      );
    };
    render();
    dialog.append(
      h('h2', { id: 'snippets-title' }, t('snippet.title')),
      h('p', { class: 'hint' }, t('snippet.intro')),
      lists,
      h('details', { class: 'snippet-new', ...(selected ? { open: '' } : {}) }, h('summary', {}, t('snippet.new')), name, body, h('p', { class: 'hint' }, t('snippet.fields')), button(t('snippet.save'), save)),
      h('div', { class: 'dialog-actions' }, button(t('common.cancel'), () => finish(null))),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(null);
    });
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    dialog.querySelector<HTMLButtonElement>('.snippet-insert')?.focus();
  });
}
