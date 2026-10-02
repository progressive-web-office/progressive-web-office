/**
 * Comments panel of the word processor (REV-001): the threads beside the
 * page in the order of their text, to add, answer, resolve and delete.
 */
import type { Node as PmNode } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import type { EditorView as PmView } from 'prosemirror-view';
import { button, h } from '../app/dom';
import { t } from '../i18n';
import { initialsOf, newCommentId } from './comments';
import type { DocComment, RichDocument } from './model';
import { schema } from './pm/schema';

const AUTHOR_KEY = 'pwo.comments.author';
const COLLAB_KEY = 'pwo.collab.identity';

/** The name comments are signed with: chosen once, else the collaboration name. */
export function commentAuthor(): string {
  try {
    const own = localStorage.getItem(AUTHOR_KEY);
    if (own) return own;
    const collab = JSON.parse(localStorage.getItem(COLLAB_KEY) ?? 'null') as { name?: string } | null;
    return collab?.name ?? '';
  } catch {
    return '';
  }
}

function saveAuthor(name: string): void {
  try {
    localStorage.setItem(AUTHOR_KEY, name);
  } catch {
    /* private mode: asked again next time */
  }
}

/** Where each comment's text is in the editor. */
export function commentRanges(doc: PmNode): Map<string, { from: number; to: number; quote: string }> {
  const out = new Map<string, { from: number; to: number; quote: string }>();
  doc.descendants((node, pos) => {
    if (!node.isText) return true;
    for (const m of node.marks) {
      if (m.type !== schema.marks.comment) continue;
      const id = m.attrs.id as string;
      const r = out.get(id);
      const end = pos + node.nodeSize;
      if (!r) out.set(id, { from: pos, to: end, quote: node.text ?? '' });
      else {
        r.quote += (pos > r.to ? ' ' : '') + (node.text ?? '');
        r.to = end;
      }
    }
    return false;
  });
  return out;
}

export interface CommentHost {
  view(): PmView;
  doc: RichDocument;
  readOnly(): boolean;
  /** The comments changed (not the text): mark the document modified. */
  changed(): void;
}

export class CommentPanel {
  readonly element: HTMLElement;
  private readonly list = h('div', { class: 'comment-threads' });
  private readonly style = h('style');
  private active: string | undefined;
  private composing: HTMLElement | undefined;

  constructor(private readonly host: CommentHost) {
    this.element = h(
      'aside',
      { class: 'doc-comments', 'aria-label': t('comment.panel'), hidden: true },
      h('h2', {}, t('comment.panel')),
      this.list,
      this.style,
    );
  }

  private get comments(): DocComment[] {
    return (this.host.doc.comments ??= []);
  }

  /** Rebuild the threads from the text (after a change, an undo, a remote edit). */
  refresh(): void {
    const ranges = commentRanges(this.host.view().state.doc);
    const roots = [...ranges.keys()].map((id) => this.comments.find((c) => c.id === id && !c.parent)).filter((c): c is DocComment => !!c);
    this.element.hidden = !roots.length && !this.composing;
    const cards = roots.map((c) => this.card(c, ranges.get(c.id)!.quote));
    this.list.replaceChildren(...(this.composing ? [this.composing] : []), ...cards);
    // The text of resolved comments is not highlighted; the active one is.
    const resolved = roots.filter((c) => c.resolved).map((c) => `.doc-page [data-comment="${CSS.escape(c.id)}"]`);
    this.style.textContent =
      (resolved.length ? `${resolved.join(',')} { background: none; border-bottom: 1px dotted var(--muted); }` : '') +
      (this.active ? `.doc-page [data-comment="${CSS.escape(this.active)}"] { background: var(--comment-active); }` : '');
  }

  /** The cursor moved: the thread under it becomes active. */
  selectionChanged(): void {
    const { $from } = this.host.view().state.selection;
    const mark = $from.marks().find((m) => m.type === schema.marks.comment) ?? $from.nodeAfter?.marks.find((m) => m.type === schema.marks.comment);
    const id = mark?.attrs.id as string | undefined;
    if (id === this.active) return;
    this.active = id;
    this.refresh();
  }

  private card(c: DocComment, quote: string): HTMLElement {
    const replies = this.comments.filter((r) => r.parent === c.id);
    const card = h(
      'article',
      { class: `comment-card${c.resolved ? ' resolved' : ''}${c.id === this.active ? ' active' : ''}`, 'data-comment-card': c.id, 'aria-label': t('comment.by', { author: c.author || t('comment.anonymous') }) },
      h('blockquote', { class: 'comment-quote', title: quote }, quote.length > 80 ? `${quote.slice(0, 80)}…` : quote),
      this.entry(c),
      ...replies.map((r) => this.entry(r, true)),
    );
    card.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button, textarea')) return;
      this.select(c.id);
    });
    if (!this.host.readOnly()) {
      card.append(
        h(
          'div',
          { class: 'comment-actions' },
          button(t('comment.reply'), () => this.compose(card, (text) => this.addReply(c.id, text))),
          button(t(c.resolved ? 'comment.reopen' : 'comment.resolve'), () => this.setResolved(c.id, !c.resolved)),
          button(t('comment.delete'), () => this.remove(c.id), { className: 'danger' }),
        ),
      );
    }
    return card;
  }

  private entry(c: DocComment, reply = false): HTMLElement {
    const date = c.date ? new Date(c.date) : undefined;
    return h(
      'div',
      { class: reply ? 'comment-entry reply' : 'comment-entry' },
      h('p', { class: 'comment-meta' }, h('strong', {}, c.author || t('comment.anonymous')), date && !Number.isNaN(date.getTime()) ? ` · ${date.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}` : ''),
      ...c.text.split('\n').map((line) => h('p', { class: 'comment-text' }, line)),
    );
  }

  /** A text box under `parent` (or at the top for a new comment); `done` gets the text. */
  private compose(parent: HTMLElement | null, done: (text: string) => void): void {
    this.composing?.remove();
    const area = h('textarea', { rows: '3', 'aria-label': t(parent ? 'comment.replyLabel' : 'comment.newLabel') });
    const finish = (text: string | null): void => {
      box.remove();
      if (this.composing === box) this.composing = undefined;
      if (text?.trim()) done(text.trim());
      this.refresh();
      if (!text) this.host.view().focus();
    };
    const box = h(
      'div',
      { class: 'comment-compose' },
      area,
      h('div', { class: 'comment-actions' }, button(t('comment.save'), () => finish(area.value), { className: 'primary' }), button(t('common.cancel'), () => finish(null))),
    );
    area.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        finish(area.value);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        finish(null);
      }
    });
    if (parent) parent.append(box);
    else {
      this.composing = box;
      this.element.hidden = false;
      this.list.prepend(box);
    }
    area.focus();
  }

  /** Comment the selection, or the word at the cursor (Ctrl+Alt+M). */
  add(): boolean {
    if (this.host.readOnly()) return false;
    const view = this.host.view();
    let { from, to } = view.state.selection;
    if (from === to) {
      const $pos = view.state.doc.resolve(from);
      const text = $pos.parent.textBetween(0, $pos.parent.content.size, undefined, '￼');
      const at = $pos.parentOffset;
      const start = at - (/[\p{L}\p{N}_'-]*$/u.exec(text.slice(0, at))?.[0].length ?? 0);
      const end = at + (/^[\p{L}\p{N}_'-]*/u.exec(text.slice(at))?.[0].length ?? 0);
      if (start === end) return false;
      from = $pos.start() + start;
      to = $pos.start() + end;
    }
    const range = { from, to };
    this.compose(null, (text) => this.create(range.from, range.to, text));
    return true;
  }

  private signature(): Pick<DocComment, 'author' | 'initials' | 'date'> {
    let author = commentAuthor();
    if (!author) {
      author = window.prompt(t('comment.yourName'), '')?.trim() ?? '';
      if (author) saveAuthor(author);
    }
    return { ...(author ? { author, initials: initialsOf(author) } : {}), date: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') };
  }

  private create(from: number, to: number, text: string): void {
    const id = newCommentId(this.host.doc);
    this.comments.push({ id, ...this.signature(), text });
    const view = this.host.view();
    view.dispatch(view.state.tr.addMark(from, to, schema.marks.comment!.create({ id })));
    this.active = id;
    this.refresh();
  }

  private addReply(parent: string, text: string): void {
    this.comments.push({ id: newCommentId(this.host.doc), ...this.signature(), text, parent });
    this.host.changed();
  }

  private setResolved(id: string, resolved: boolean): void {
    const c = this.comments.find((x) => x.id === id);
    if (!c) return;
    if (resolved) c.resolved = true;
    else delete c.resolved;
    this.host.changed();
    this.refresh();
  }

  /** Remove the comment from the text (undo brings it back); the list keeps it until saving. */
  private remove(id: string): void {
    const view = this.host.view();
    const r = commentRanges(view.state.doc).get(id);
    if (!r) return;
    view.dispatch(view.state.tr.removeMark(r.from, r.to, schema.marks.comment!.create({ id })));
    view.focus();
  }

  /** Select the commented text. */
  select(id: string): void {
    const view = this.host.view();
    const r = commentRanges(view.state.doc).get(id);
    if (!r) return;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, r.from, r.to)).scrollIntoView());
    view.focus();
  }
}
