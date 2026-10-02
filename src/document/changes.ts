/**
 * Tracked changes (REV-005): while tracking, typed text is marked as an
 * insertion and deleted text is kept, marked as a deletion, until someone
 * accepts or rejects the change.
 */
import type { Mark, Node as PmNode, Slice } from 'prosemirror-model';
import { TextSelection, type EditorState, type Transaction } from 'prosemirror-state';
import { ReplaceStep, type MapResult, type Mappable } from 'prosemirror-transform';
import { allParagraphs, isTextRun, normalizeRuns, type Revision, type RichDocument } from './model';
import { schema } from './pm/schema';

/** Transactions that must not be tracked (accepting, rejecting, remote edits). */
export const UNTRACKED = 'pwo-untracked';

const attrsOf = (by: Revision): { author: string | null; date: string | null } => ({ author: by.author ?? null, date: by.date ?? null });

type PosMap = (pos: number, assoc?: number) => number;

function mappable(map: PosMap): Mappable {
  return {
    map: (pos, assoc = 1) => map(pos, assoc),
    mapResult: (pos, assoc = 1) => ({ pos: map(pos, assoc), deleted: false, deletedBefore: false, deletedAfter: false, deletedAcross: false }) as unknown as MapResult,
  };
}

/** The same edit, with deletions kept as marked text and insertions marked. */
/**
 * The change mark just before or after `from`..`to` of the same kind and
 * author: typing or deleting on, a moment later, extends that change
 * rather than starting another one.
 */
function neighbour(doc: PmNode, from: number, to: number, mark: Mark): Mark | undefined {
  const same = (node: PmNode | null | undefined): Mark | undefined => {
    const m = node?.isText ? mark.type.isInSet(node.marks) : undefined;
    return m && m.attrs.author === mark.attrs.author ? m : undefined;
  };
  return same(doc.resolve(from).nodeBefore) ?? same(doc.resolve(to).nodeAfter);
}

export function trackTransaction(state: EditorState, tr: Transaction, by: Revision): Transaction {
  if (!tr.docChanged) return tr;
  const out = state.tr;
  const ins = schema.marks.insertion!.create(attrsOf(by));
  const del = schema.marks.deletion!.create(attrsOf(by));
  /** Positions of the edit's current document in `out`'s. */
  let toOut: PosMap = (pos) => pos;
  tr.steps.forEach((step, i) => {
    const before = tr.docs[i]!;
    const replace = step instanceof ReplaceStep ? (step as unknown as { from: number; to: number; slice: Slice }) : undefined;
    // Joining paragraphs (no text removed) and structural steps go through as they are.
    const onlyStructure = replace && !replace.slice.size && !before.textBetween(replace.from, replace.to, '', '￼');
    if (!replace || onlyStructure) {
      const start = out.steps.length;
      const mapped = step.map(mappable(toOut));
      if (mapped) out.maybeStep(mapped);
      const outMap = out.mapping.slice(start);
      const inverse = step.getMap().invert();
      const prev = toOut;
      toOut = (p, assoc = 1) => outMap.map(prev(inverse.map(p, assoc), assoc), assoc);
      return;
    }
    const { from, to, slice } = replace;
    const start = out.steps.length;
    const oFrom = toOut(from, -1);
    const oTo = Math.max(oFrom, toOut(to, 1));
    if (oTo > oFrom) {
      // Text inserted while tracking is removed for good; atoms too; other text is struck out.
      const gone: [number, number][] = [];
      out.doc.nodesBetween(oFrom, oTo, (node, pos) => {
        if (!node.isInline) return true;
        if (!node.isText || schema.marks.insertion!.isInSet(node.marks)) gone.push([Math.max(pos, oFrom), Math.min(pos + node.nodeSize, oTo)]);
        return false;
      });
      out.addMark(oFrom, oTo, neighbour(out.doc, oFrom, oTo, del) ?? del);
      for (const [a, b] of gone.reverse()) out.delete(a, b);
    }
    const at = out.mapping.slice(start).map(oTo, -1);
    let insStart = at;
    if (slice.size) {
      const k = out.steps.length;
      out.replace(at, at, slice);
      const end = out.mapping.slice(k).map(at, 1);
      insStart = out.mapping.slice(k).map(at, -1);
      out.removeMark(insStart, end, schema.marks.deletion!);
      out.addMark(insStart, end, neighbour(out.doc, insStart, end, ins) ?? ins);
    }
    const outMap = out.mapping.slice(start);
    const prev = toOut;
    const added = slice.size;
    const removed = to - from;
    const deletePoint = outMap.map(oFrom, -1);
    toOut = (p, assoc = 1) => {
      if (p < from) return outMap.map(prev(p, assoc), assoc);
      if (p <= from + added) return added ? insStart + (p - from) : deletePoint;
      return outMap.map(prev(p - added + removed, assoc), assoc);
    };
  });
  const size = out.doc.content.size;
  const clamp = (n: number): number => Math.max(0, Math.min(size, n));
  try {
    out.setSelection(TextSelection.create(out.doc, clamp(toOut(tr.selection.anchor)), clamp(toOut(tr.selection.head))));
  } catch {
    /* the default mapped selection */
  }
  if (tr.scrolledIntoView) out.scrollIntoView();
  out.setMeta('addToHistory', tr.getMeta('addToHistory') ?? true);
  return out;
}

export interface Change {
  kind: 'insert' | 'delete';
  from: number;
  to: number;
  text: string;
  author?: string;
  date?: string;
}

/** The tracked changes of a document, in order: neighbouring text of one change is one change. */
export function changesOf(doc: PmNode): Change[] {
  const out: Change[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return true;
    const mark: Mark | undefined = node.marks.find((m) => m.type === schema.marks.insertion || m.type === schema.marks.deletion);
    if (!mark) return false;
    const kind = mark.type === schema.marks.insertion ? 'insert' : 'delete';
    const last = out[out.length - 1];
    const author = (mark.attrs.author as string | null) ?? undefined;
    const date = (mark.attrs.date as string | null) ?? undefined;
    if (last && last.kind === kind && last.to === pos && last.author === author && last.date === date) {
      last.to = pos + node.nodeSize;
      last.text += node.text ?? '';
    } else out.push({ kind, from: pos, to: pos + node.nodeSize, text: node.text ?? '', ...(author ? { author } : {}), ...(date ? { date } : {}) });
    return false;
  });
  return out;
}

/** Accept or reject a change. */
export function decide(state: EditorState, change: Change, accept: boolean): Transaction {
  const tr = state.tr.setMeta(UNTRACKED, true);
  const type = change.kind === 'insert' ? schema.marks.insertion! : schema.marks.deletion!;
  if ((change.kind === 'insert') === accept) tr.removeMark(change.from, change.to, type);
  else tr.delete(change.from, change.to);
  return tr;
}

/** Accept or reject every change. */
export function decideAll(state: EditorState, accept: boolean): Transaction {
  const tr = state.tr.setMeta(UNTRACKED, true);
  for (const change of changesOf(state.doc).reverse()) {
    const type = change.kind === 'insert' ? schema.marks.insertion! : schema.marks.deletion!;
    if ((change.kind === 'insert') === accept) tr.removeMark(change.from, change.to, type);
    else tr.delete(change.from, change.to);
  }
  return tr;
}

/** The document with every change accepted, for formats without tracked changes. */
export function acceptAll(doc: RichDocument): RichDocument {
  const copy: RichDocument = { ...doc, blocks: structuredClone(doc.blocks) };
  for (const p of allParagraphs(copy.blocks)) {
    if (!p.runs.some((r) => isTextRun(r) && (r.inserted || r.deleted))) continue;
    p.runs = normalizeRuns(
      p.runs
        .filter((r) => !(isTextRun(r) && r.deleted))
        .map((r) => {
          if (!isTextRun(r) || !r.inserted) return r;
          const { inserted: _, ...rest } = r;
          return rest;
        }),
    );
  }
  return copy;
}

/** Whether a document has tracked changes. */
export const hasChanges = (doc: RichDocument): boolean => allParagraphs(doc.blocks).some((p) => p.runs.some((r) => isTextRun(r) && (r.inserted || r.deleted)));
