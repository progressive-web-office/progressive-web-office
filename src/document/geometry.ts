/**
 * DOC-046: the page as LaTeX's `geometry` package and Pandoc's front matter
 * say it — `a4paper,landscape,margin=2cm`, `top=25mm,left=3cm`,
 * `paperwidth=17cm,paperheight=24cm` — and back.
 */
import { defaultGeometry, PAPERS, paperName, type PageGeometry } from './model';
import { lengthPt } from './springs';

const mm = (text: string): number | undefined => {
  const pt = lengthPt(text);
  return pt === undefined ? undefined : Math.round(((pt * 25.4) / 72) * 10) / 10;
};
const len = (n: number): string => `${Math.round(n * 10) / 10}mm`;

/** `geometry` options for a page. */
export function geometryOptions(g: PageGeometry): string {
  const name = paperName(g);
  const opts: string[] = [];
  if (name) opts.push(`${name.toLowerCase()}paper`, ...(g.width > g.height ? ['landscape'] : []));
  else opts.push(`paperwidth=${len(g.width)}`, `paperheight=${len(g.height)}`);
  if (g.top === g.right && g.top === g.bottom && g.top === g.left) opts.push(`margin=${len(g.top)}`);
  else opts.push(`top=${len(g.top)}`, `right=${len(g.right)}`, `bottom=${len(g.bottom)}`, `left=${len(g.left)}`);
  return opts.join(',');
}

/** The page of `geometry` options (unknown ones are ignored), from `base` (the default page). */
export function parseGeometryOptions(text: string, base: PageGeometry = defaultGeometry()): PageGeometry {
  const g = { ...base };
  let landscape = false;
  for (const raw of text.split(',')) {
    const [key, value] = raw.split('=').map((s) => s.trim()) as [string, string | undefined];
    const paper = /^(a3|a4|a5|letter|legal)(?:paper)?$/i.exec(key);
    if (paper && value === undefined) {
      const name = Object.keys(PAPERS).find((n) => n.toLowerCase() === paper[1]!.toLowerCase())!;
      [g.width, g.height] = PAPERS[name]!;
      continue;
    }
    if (key === 'landscape') landscape = true;
    if (key === 'portrait') landscape = false;
    const v = value === undefined ? undefined : mm(value.replace(/^\{|\}$/g, ''));
    if (v === undefined) continue;
    switch (key) {
      case 'paperwidth':
        g.width = v;
        break;
      case 'paperheight':
        g.height = v;
        break;
      case 'margin':
        g.top = g.right = g.bottom = g.left = v;
        break;
      case 'hmargin':
        g.left = g.right = v;
        break;
      case 'vmargin':
        g.top = g.bottom = v;
        break;
      case 'top':
      case 'tmargin':
        g.top = v;
        break;
      case 'bottom':
      case 'bmargin':
        g.bottom = v;
        break;
      case 'left':
      case 'lmargin':
      case 'inner':
        g.left = v;
        break;
      case 'right':
      case 'rmargin':
      case 'outer':
        g.right = v;
        break;
    }
  }
  if (landscape !== g.width > g.height) [g.width, g.height] = [g.height, g.width];
  return g;
}
