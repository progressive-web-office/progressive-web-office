/**
 * ProseMirror schema for text documents (DOC-018). It mirrors the format-neutral
 * model (`../model.ts`) one to one so that conversions are lossless:
 *
 * - paragraphs are flat, like in the model and in DOCX/ODT: a list item is a
 *   paragraph with `listOrdered`/`listLevel` attributes, a quote or code block
 *   a paragraph with that style;
 * - text formatting is marks; `\n` line breaks are `hard_break` nodes;
 * - images, equations, diagrams and code cells are inline atoms;
 * - tables come from prosemirror-tables (cells hold paragraphs).
 */
import { Schema, type DOMOutputSpec, type Mark, type Node as PmNode } from 'prosemirror-model';
import { tableNodes } from 'prosemirror-tables';
import type { Align, CellOutput, ParagraphStyle } from '../model';

const STYLES: ParagraphStyle[] = ['normal', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'quote', 'code'];
const ALIGNS: Align[] = ['left', 'center', 'right', 'justify'];

function paragraphAttrs(dom: HTMLElement, style: ParagraphStyle): Record<string, unknown> {
  const align = ALIGNS.find((a) => a === (dom.style.textAlign || dom.dataset.align)) ?? null;
  const list = dom.dataset.list;
  return {
    style,
    align,
    listOrdered: list === 'ol' ? true : list === 'ul' ? false : null,
    listLevel: Number(dom.dataset.level ?? 0) || 0,
  };
}

function paragraphDom(node: PmNode): DOMOutputSpec {
  const { style, align, listOrdered, listLevel } = node.attrs as { style: ParagraphStyle; align: Align | null; listOrdered: boolean | null; listLevel: number };
  const tag = style === 'normal' ? 'p' : style === 'quote' ? 'blockquote' : style === 'code' ? 'pre' : style;
  const attrs: Record<string, string> = {};
  if (align) attrs.style = `text-align: ${align}`;
  if (align) attrs['data-align'] = align;
  if (listOrdered !== null) {
    attrs.class = 'list-item';
    attrs['data-list'] = listOrdered ? 'ol' : 'ul';
    attrs['data-level'] = String(listLevel);
  }
  return [tag, attrs, 0];
}

const json = (value: unknown): string => JSON.stringify(value);

export const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      attrs: { style: { default: 'normal' }, align: { default: null }, listOrdered: { default: null }, listLevel: { default: 0 } },
      parseDOM: [
        ...STYLES.filter((s) => /^h\d$/.test(s)).map((s) => ({ tag: s, getAttrs: (d: HTMLElement) => paragraphAttrs(d, s) })),
        { tag: 'blockquote', getAttrs: (d: HTMLElement) => paragraphAttrs(d, 'quote') },
        { tag: 'pre', preserveWhitespace: 'full' as const, getAttrs: (d: HTMLElement) => paragraphAttrs(d, 'code') },
        { tag: 'p', getAttrs: (d: HTMLElement) => paragraphAttrs(d, 'normal') },
      ],
      toDOM: paragraphDom,
    },
    horizontal_rule: { group: 'block', parseDOM: [{ tag: 'hr' }], toDOM: () => ['hr'] },
    ...tableNodes({ tableGroup: 'block', cellContent: 'paragraph+', cellAttributes: {} }),
    text: { group: 'inline' },
    hard_break: { inline: true, group: 'inline', selectable: false, parseDOM: [{ tag: 'br' }], toDOM: () => ['br'] },
    image: {
      inline: true,
      group: 'inline',
      draggable: true,
      attrs: { image: { default: '' }, src: { default: null }, alt: { default: null }, title: { default: null }, width: { default: null }, height: { default: null } },
      parseDOM: [
        {
          tag: 'img[data-resource]',
          getAttrs: (d: HTMLElement) => {
            const img = d as HTMLImageElement;
            return { image: img.dataset.resource ?? '', alt: img.getAttribute('alt'), title: img.getAttribute('title'), width: Number(img.getAttribute('width')) || null, height: Number(img.getAttribute('height')) || null };
          },
        },
      ],
      toDOM: (n) => ['img', { 'data-resource': n.attrs.image, alt: n.attrs.alt ?? '', ...(n.attrs.title ? { title: n.attrs.title } : {}), ...(n.attrs.width ? { width: String(n.attrs.width) } : {}), ...(n.attrs.height ? { height: String(n.attrs.height) } : {}) }],
    },
    math: {
      inline: true,
      group: 'inline',
      atom: true,
      attrs: { math: { default: '' }, display: { default: false } },
      parseDOM: [{ tag: 'span.math', getAttrs: (d: HTMLElement) => ({ math: d.dataset.latex ?? '', display: d.dataset.display === 'true' }) }],
      toDOM: (n) => ['span', { class: n.attrs.display ? 'math display' : 'math', 'data-latex': n.attrs.math, ...(n.attrs.display ? { 'data-display': 'true' } : {}) }, n.attrs.display ? `$$${n.attrs.math}$$` : `$${n.attrs.math}$`],
    },
    diagram: {
      inline: true,
      group: 'inline',
      atom: true,
      attrs: { diagram: { default: '' }, lang: { default: 'mermaid' } },
      parseDOM: [{ tag: 'span.diagram', getAttrs: (d: HTMLElement) => ({ diagram: d.dataset.source ?? '', lang: d.dataset.diagram ?? 'mermaid' }) }],
      toDOM: (n) => ['span', { class: 'diagram', 'data-diagram': n.attrs.lang, 'data-source': n.attrs.diagram }, n.attrs.diagram],
    },
    code_cell: {
      inline: true,
      group: 'inline',
      atom: true,
      attrs: { cell: { default: '' }, lang: { default: 'python' }, output: { default: null } },
      parseDOM: [
        {
          tag: 'span.code-cell[data-cell]',
          getAttrs: (d: HTMLElement) => ({ cell: d.dataset.cell ?? '', lang: d.dataset.lang ?? 'python', output: d.dataset.output ? (JSON.parse(d.dataset.output) as CellOutput) : null }),
        },
      ],
      toDOM: (n) => ['span', { class: 'code-cell', 'data-lang': n.attrs.lang, 'data-cell': n.attrs.cell, ...(n.attrs.output ? { 'data-output': json(n.attrs.output) } : {}) }, n.attrs.cell],
    },
  },
  // The order is the nesting order: links outermost.
  marks: {
    link: {
      attrs: { href: {} },
      inclusive: false,
      parseDOM: [{ tag: 'a[href]', getAttrs: (d: HTMLElement) => ({ href: d.getAttribute('href') }) }],
      toDOM: (m: Mark) => ['a', { href: m.attrs.href, rel: 'noopener noreferrer' }, 0],
    },
    bold: { parseDOM: [{ tag: 'strong' }, { tag: 'b' }, { style: 'font-weight=bold' }, { style: 'font-weight=700' }], toDOM: () => ['strong', 0] },
    italic: { parseDOM: [{ tag: 'em' }, { tag: 'i' }, { style: 'font-style=italic' }], toDOM: () => ['em', 0] },
    underline: { parseDOM: [{ tag: 'u' }, { style: 'text-decoration=underline' }], toDOM: () => ['u', 0] },
    strike: { parseDOM: [{ tag: 's' }, { tag: 'del' }, { tag: 'strike' }, { style: 'text-decoration=line-through' }], toDOM: () => ['s', 0] },
    code: { parseDOM: [{ tag: 'code' }], toDOM: () => ['code', 0] },
    size: {
      attrs: { pt: {} },
      parseDOM: [{ style: 'font-size', getAttrs: (v: string) => (/^[\d.]+pt$/.test(v) ? { pt: parseFloat(v) } : false) }],
      toDOM: (m: Mark) => ['span', { style: `font-size: ${m.attrs.pt}pt` }, 0],
    },
    color: {
      attrs: { hex: {} },
      parseDOM: [{ tag: 'span[data-color]', getAttrs: (d: HTMLElement) => ({ hex: d.dataset.color }) }],
      toDOM: (m: Mark) => ['span', { style: `color: ${m.attrs.hex}`, 'data-color': m.attrs.hex }, 0],
    },
  },
});
