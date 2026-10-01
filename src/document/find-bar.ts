/** Find & replace bar of the text editor (DOC-019). */
import type { EditorView } from 'prosemirror-view';
import { button, h } from '../app/dom';
import { t } from '../i18n';
import { gotoMatch, replaceAll, replaceCurrent, searchKey, setQuery, type SearchQuery } from './pm/search';

export class FindBar {
  readonly element: HTMLElement;
  private readonly find = h('input', { type: 'search', 'aria-label': t('find.find'), placeholder: t('find.find'), spellcheck: 'false' });
  private readonly replace = h('input', { type: 'text', 'aria-label': t('find.replaceWith'), placeholder: t('find.replaceWith'), spellcheck: 'false' });
  private readonly count = h('span', { class: 'find-count', role: 'status', 'aria-live': 'polite' });
  private readonly replaceRow: HTMLElement;
  private readonly options: Record<'caseSensitive' | 'wholeWord' | 'regex', HTMLInputElement>;

  constructor(private readonly view: () => EditorView) {
    const option = (label: string, text: string): HTMLInputElement => h('input', { type: 'checkbox', 'aria-label': label, title: label, 'data-text': text });
    this.options = { caseSensitive: option(t('find.matchCase'), 'Aa'), wholeWord: option(t('find.wholeWord'), 'W'), regex: option(t('find.regex'), '.*') };
    const toggles = Object.values(this.options).map((box) => h('label', { class: 'find-option', title: box.title }, box, h('span', { 'aria-hidden': 'true' }, box.dataset.text ?? '')));
    this.replaceRow = h(
      'div',
      { class: 'find-row' },
      this.replace,
      button(t('find.replace'), () => this.replaceOne()),
      button(t('find.replaceAll'), () => this.replaceEverything()),
    );
    this.element = h(
      'div',
      { class: 'find-bar', role: 'search', 'aria-label': t('find.title'), hidden: true },
      h(
        'div',
        { class: 'find-row' },
        this.find,
        ...toggles,
        this.count,
        button(t('find.previous'), () => this.go(-1), { text: '↑', title: `${t('find.previous')} (Shift+Enter)` }),
        button(t('find.next'), () => this.go(1), { text: '↓', title: `${t('find.next')} (Enter)` }),
        button(t('common.close'), () => this.close(), { text: '×', className: 'icon', title: `${t('common.close')} (Esc)` }),
      ),
      this.replaceRow,
    );
    this.find.addEventListener('input', () => this.search());
    for (const box of Object.values(this.options)) box.addEventListener('change', () => this.search());
    this.element.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      } else if (e.key === 'Enter' && e.target === this.find) {
        e.preventDefault();
        this.go(e.shiftKey ? -1 : 1);
      } else if (e.key === 'Enter' && e.target === this.replace) {
        e.preventDefault();
        this.replaceOne();
      }
    });
  }

  get isOpen(): boolean {
    return !this.element.hidden;
  }

  /** Open the bar, with the selected text as the search. */
  open(withReplace: boolean): void {
    const view = this.view();
    const { from, to, empty } = view.state.selection;
    const selected = empty ? '' : view.state.doc.textBetween(from, to, ' ');
    if (selected && !selected.includes('\n') && selected.length < 200) this.find.value = selected;
    this.element.hidden = false;
    this.replaceRow.hidden = !withReplace;
    this.find.focus();
    this.find.select();
    this.search();
  }

  close(): void {
    this.element.hidden = true;
    const view = this.view();
    view.dispatch(setQuery(view.state.tr, { text: '' }));
    view.focus();
  }

  private query(): SearchQuery {
    return { text: this.find.value, caseSensitive: this.options.caseSensitive.checked, wholeWord: this.options.wholeWord.checked, regex: this.options.regex.checked };
  }

  private search(): void {
    const view = this.view();
    view.dispatch(setQuery(view.state.tr, this.query()));
    // Show the match after the cursor without moving the cursor or the focus.
    view.dom.querySelector('.search-match.current')?.scrollIntoView?.({ block: 'nearest' });
    this.refresh();
  }

  refresh(): void {
    const s = searchKey.getState(this.view().state);
    this.find.classList.toggle('error', !!s?.error || (!!this.find.value && !s?.matches.length));
    this.count.textContent = s?.error ? t('find.invalid') : !this.find.value ? '' : s?.matches.length ? t('find.count', { n: s.current + 1, total: s.matches.length }) : t('find.none');
  }

  private go(dir: 1 | -1): void {
    const view = this.view();
    const tr = gotoMatch(view.state, dir);
    if (tr) view.dispatch(tr);
    this.refresh();
  }

  private replaceOne(): void {
    const view = this.view();
    const tr = replaceCurrent(view.state, this.replace.value);
    if (tr) view.dispatch(tr);
    this.refresh();
  }

  private replaceEverything(): void {
    const view = this.view();
    const result = replaceAll(view.state, this.replace.value);
    if (!result) return;
    view.dispatch(result.tr);
    this.refresh();
    this.count.textContent = t('find.replaced', { n: result.count });
  }
}
