/** Tracked changes panel of the word processor (REV-005): accept or reject each change, or all. */
import type { EditorView as PmView } from 'prosemirror-view';
import { TextSelection } from 'prosemirror-state';
import { button, h } from '../app/dom';
import { t } from '../i18n';
import { changesOf, decide, decideAll, type Change } from './changes';

export class ChangePanel {
  readonly element: HTMLElement;
  private readonly list = h('div', { class: 'change-list' });
  private readonly head = h('div', { class: 'comment-actions change-all' });

  constructor(
    private readonly view: () => PmView,
    private readonly readOnly: () => boolean,
  ) {
    this.element = h('section', { class: 'doc-changes', 'aria-label': t('track.panel'), hidden: true }, h('h2', {}, t('track.panel')), this.head, this.list);
  }

  refresh(): void {
    const changes = changesOf(this.view().state.doc);
    this.element.hidden = !changes.length;
    this.head.replaceChildren(
      ...(this.readOnly() || !changes.length
        ? []
        : [button(t('track.acceptAll'), () => this.all(true)), button(t('track.rejectAll'), () => this.all(false), { className: 'danger' })]),
    );
    this.list.replaceChildren(...changes.map((c) => this.card(c)));
  }

  private card(c: Change): HTMLElement {
    const date = c.date ? new Date(c.date) : undefined;
    const card = h(
      'article',
      { class: `comment-card change-card ${c.kind}`, 'aria-label': t(c.kind === 'insert' ? 'track.inserted' : 'track.deleted', { author: c.author || t('comment.anonymous') }) },
      h('p', { class: 'comment-meta' }, h('strong', {}, c.author || t('comment.anonymous')), ` · ${t(c.kind === 'insert' ? 'track.insertedShort' : 'track.deletedShort')}`, date && !Number.isNaN(date.getTime()) ? ` · ${date.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}` : ''),
      h(c.kind === 'insert' ? 'ins' : 'del', { class: 'change-text' }, c.text.length > 120 ? `${c.text.slice(0, 120)}…` : c.text),
    );
    card.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      const view = this.view();
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, c.from, c.to)).scrollIntoView());
      view.focus();
    });
    if (!this.readOnly()) {
      card.append(h('div', { class: 'comment-actions' }, button(t('track.accept'), () => this.one(c, true)), button(t('track.reject'), () => this.one(c, false), { className: 'danger' })));
    }
    return card;
  }

  private one(c: Change, accept: boolean): void {
    const view = this.view();
    // The change as it is now (the text may have moved since the list was drawn).
    const now = changesOf(view.state.doc).find((x) => x.kind === c.kind && x.from === c.from && x.to === c.to);
    if (now) view.dispatch(decide(view.state, now, accept));
  }

  private all(accept: boolean): void {
    const view = this.view();
    view.dispatch(decideAll(view.state, accept));
  }
}
