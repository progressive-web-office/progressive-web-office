/**
 * Springs in the editor (DOC-042). A paragraph holding horizontal springs is
 * laid out as a flexible line, its springs growing in proportion to their
 * weight. Vertical springs share the free height of their page: the editor
 * shows the document as one long page, so a page is what lies between page
 * breaks, and the free height that of its last page.
 */
import { Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import type { Node as PmNode } from 'prosemirror-model';

/** Paragraphs holding a horizontal spring get the class `has-hfill`. */
export function springsPlugin(): Plugin {
  const decorate = (doc: PmNode): DecorationSet => {
    const decos: Decoration[] = [];
    doc.descendants((node, pos) => {
      if (!node.isTextblock) return true;
      let found = false;
      node.forEach((c) => void (found ||= c.type.name === 'hfill'));
      if (found) decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'has-hfill' }));
      return false;
    });
    return DecorationSet.create(doc, decos);
  };
  return new Plugin({
    state: {
      init: (_, state) => decorate(state.doc),
      apply: (tr, old) => (tr.docChanged ? decorate(tr.doc) : old),
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
    },
  });
}

/** The top-level nodes of the document with their elements. */
function topLevel(view: EditorView): { node: PmNode; dom: HTMLElement }[] {
  const out: { node: PmNode; dom: HTMLElement }[] = [];
  view.state.doc.forEach((node, offset) => {
    const dom = view.nodeDOM(offset);
    if (dom instanceof HTMLElement) out.push({ node, dom });
  });
  return out;
}

/** Vertical extent of an element, margins included. */
function extent(el: HTMLElement): { top: number; bottom: number } {
  const r = el.getBoundingClientRect();
  const s = getComputedStyle(el);
  return { top: r.top - (parseFloat(s.marginTop) || 0), bottom: r.bottom + (parseFloat(s.marginBottom) || 0) };
}

/**
 * Lay the page out as it will be printed (DOC-042, DOC-046): the text flows
 * from the top of the text area, a printed page holding `pageHeight` CSS
 * pixels of it. Spaces of a share of the page get their height; on each page
 * (what lies between page breaks) the vertical springs share the free height
 * up to the end of the page, and a page break without springs before it
 * takes that height itself, so that what follows starts at the top of the
 * next page — where the page boundaries are drawn. Returns whether something
 * changed.
 */
export function layoutSprings(view: EditorView, pageHeight: number): boolean {
  const nodes = topLevel(view);
  if (!nodes.length || !(pageHeight > 0)) return false;
  const springs = nodes.filter((n) => n.node.type.name === 'space' && n.node.attrs.stretch);
  const breaks = nodes.filter((n) => n.node.type.name === 'horizontal_rule' && n.node.attrs.page);
  const before = [...springs.map((s) => s.dom.style.height), ...breaks.map((b) => b.dom.style.marginBottom)];
  let changed = false;
  // Spaces of a share of the page height.
  for (const n of nodes) {
    const fraction = n.node.type.name === 'space' && !n.node.attrs.stretch ? (n.node.attrs.fraction as number | null) : null;
    if (!fraction) continue;
    const height = `${Math.round(fraction * pageHeight)}px`;
    if (n.dom.style.height !== height) {
      n.dom.style.height = height;
      changed = true;
    }
  }
  for (const s of springs) s.dom.style.height = '0px';
  for (const b of breaks) b.dom.style.marginBottom = '';
  // The top of the text area: where the first page's text starts.
  const root = view.dom as HTMLElement;
  let pageStart = root.getBoundingClientRect().top + (parseFloat(getComputedStyle(root).paddingTop) || 0);
  let start = 0;
  for (let i = 0; i <= nodes.length; i++) {
    const isBreak = i < nodes.length && nodes[i]!.node.type.name === 'horizontal_rule' && nodes[i]!.node.attrs.page;
    if (i < nodes.length && !isBreak) continue;
    const page = nodes.slice(start, i);
    const brk = isBreak ? nodes[i]! : undefined;
    start = i + 1;
    const mine = page.filter((n) => n.node.type.name === 'space' && n.node.attrs.stretch);
    if (!mine.length && !brk) continue;
    const last = brk ?? page[page.length - 1];
    if (!last) continue;
    const bottom = extent(last.dom).bottom;
    const used = bottom - pageStart;
    const pages = Math.max(1, Math.ceil((used - 0.5) / pageHeight));
    const end = pageStart + pages * pageHeight;
    const free = Math.max(0, end - bottom);
    if (mine.length) {
      const total = mine.reduce((n, s) => n + (s.node.attrs.stretch as number), 0);
      for (const s of mine) s.dom.style.height = `${Math.floor((free * (s.node.attrs.stretch as number)) / total)}px`;
    } else if (brk) {
      const own = parseFloat(getComputedStyle(brk.dom).marginBottom) || 0;
      brk.dom.style.marginBottom = `${Math.floor(own + free)}px`;
    }
    pageStart = end;
  }
  const after = [...springs.map((s) => s.dom.style.height), ...breaks.map((b) => b.dom.style.marginBottom)];
  return changed || after.some((v, i) => v !== before[i]);
}

/**
 * The heights of the vertical springs and the positions of the horizontal
 * ones as shown, in points, in the order of the document: kept in files
 * without springs.
 */
export function measureSprings(view: EditorView): { spaces: number[]; fills: number[] } {
  const spaces: number[] = [];
  const fills: number[] = [];
  const pt = (px: number): number => Math.round(px * 0.75 * 10) / 10;
  view.state.doc.descendants((node, pos) => {
    if (node.type.name === 'space') {
      const dom = view.nodeDOM(pos);
      spaces.push((node.attrs.stretch || node.attrs.fraction) && dom instanceof HTMLElement ? pt(dom.getBoundingClientRect().height) : (node.attrs.size as number) ?? 0);
      return false;
    }
    if (node.type.name === 'hfill') {
      const dom = view.nodeDOM(pos);
      const para = dom instanceof HTMLElement ? dom.closest('p, h1, h2, h3, h4, h5, h6, pre') : null;
      fills.push(dom instanceof HTMLElement && para ? pt(dom.getBoundingClientRect().right - para.getBoundingClientRect().left - (parseFloat(getComputedStyle(para).paddingLeft) || 0)) : -1);
    }
    return true;
  });
  return { spaces, fills };
}
