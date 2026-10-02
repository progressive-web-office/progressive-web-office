/**
 * Accessibility check of a text document (DOC-030): pictures without
 * alternative text, skipped heading levels, empty headings, tables without
 * header row, vague link texts, low-contrast text, missing title or language.
 */
import type { Node as PmNode } from 'prosemirror-model';
import type { DocumentMeta } from './model';
import { schema } from './pm/schema';

export type IssueKind = 'alt' | 'altFileName' | 'headingSkip' | 'headingEmpty' | 'tableHeader' | 'linkText' | 'contrast' | 'title' | 'language';

export interface Issue {
  kind: IssueKind;
  /** Where it is (a node's position), when it is in the text. */
  pos?: number;
  /** Details shown with the message (a heading level, a link text, a ratio). */
  detail?: string;
}

const VAGUE_LINKS = /^(click here|here|link|more|read more|this|ici|cliquez ici|cliquer ici|lien|plus|en savoir plus|ceci|点击这里|这里|链接)$/i;
const FILE_NAME = /^(img|image|dsc|dcim|pxl|screenshot|capture|photo|scan)[\s_-]*\d*|\.(png|jpe?g|gif|webp|svg|bmp)$/i;

/** Relative luminance of `#rrggbb` (WCAG 2). */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two colours. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

export function checkAccessibility(doc: PmNode, meta: DocumentMeta): Issue[] {
  const issues: Issue[] = [];
  if (!meta.title?.trim()) issues.push({ kind: 'title' });
  if (!meta.language?.trim()) issues.push({ kind: 'language' });
  let lastLevel = 0;
  const contrastSeen = new Set<string>();
  doc.descendants((node, pos) => {
    if (node.type === schema.nodes.paragraph) {
      const m = /^h(\d)$/.exec(node.attrs.style as string);
      if (m) {
        const level = Number(m[1]);
        if (!node.textContent.trim()) issues.push({ kind: 'headingEmpty', pos });
        else if (level > lastLevel + 1) issues.push({ kind: 'headingSkip', pos, detail: `${lastLevel ? `H${lastLevel}` : '—'} → H${level}` });
        if (node.textContent.trim()) lastLevel = level;
      }
      // Link texts and coloured text.
      let link: { href: string; text: string; pos: number } | undefined;
      const flush = (): void => {
        if (link && (VAGUE_LINKS.test(link.text.trim()) || /^(https?:\/\/|www\.)\S+$/i.test(link.text.trim()))) issues.push({ kind: 'linkText', pos: link.pos, detail: link.text.trim() });
        link = undefined;
      };
      node.forEach((child, offset) => {
        const href = schema.marks.link!.isInSet(child.marks)?.attrs.href as string | undefined;
        if (child.isText && href) {
          if (link?.href === href) link.text += child.text ?? '';
          else {
            flush();
            link = { href, text: child.text ?? '', pos: pos + 1 + offset };
          }
        } else flush();
        const color = schema.marks.color!.isInSet(child.marks)?.attrs.hex as string | undefined;
        const background = (schema.marks.highlight!.isInSet(child.marks)?.attrs.hex as string | undefined) ?? '#ffffff';
        if (child.isText && color && /^#[0-9a-f]{6}$/i.test(color) && /^#[0-9a-f]{6}$/i.test(background)) {
          const ratio = contrast(color, background);
          const key = `${color}/${background}`;
          if (ratio < 4.5 && !contrastSeen.has(key)) {
            contrastSeen.add(key);
            issues.push({ kind: 'contrast', pos: pos + 1 + offset, detail: `${ratio.toFixed(1)}:1` });
          }
        }
      });
      flush();
      return true;
    }
    if (node.type === schema.nodes.image) {
      const alt = node.attrs.alt as string | null;
      if (alt === null || alt === undefined) issues.push({ kind: 'alt', pos });
      else if (alt && FILE_NAME.test(alt.trim())) issues.push({ kind: 'altFileName', pos, detail: alt });
      return false;
    }
    if (node.type.name === 'table') {
      const first = node.firstChild;
      const header = !!first && first.childCount > 0 && Array.from({ length: first.childCount }, (_, i) => first.child(i)).every((c) => c.type.name === 'table_header');
      if (!header) issues.push({ kind: 'tableHeader', pos });
      return true;
    }
    return true;
  });
  return issues;
}
