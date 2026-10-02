/**
 * LaTeX import (TEX-003, TEX-004): the common subset of `article` documents.
 * Unsupported constructs are kept as visible source text.
 */
import { addResource, cleanFormat, cleanMeta, cleanPageSetup, emptyDocument, normalizeRuns, type Align, type Block, type Paragraph, type ParagraphStyle, type RichDocument, type Run, type TableCell, type TextFormat, type SeqKind, seqKindOf, crossTargets, allParagraphs, isRefRun, resolveAnchors } from './model';

type Node =
  | { k: 'text'; v: string }
  | { k: 'par' }
  | { k: 'break' }
  | { k: 'math'; display: boolean; latex: string }
  | { k: 'group'; body: Node[] }
  | { k: 'cmd'; name: string; star: boolean; opt?: string; args: string[]; raw: string }
  | { k: 'env'; name: string; opt?: string; args: string[]; body: string; raw: string };

/** Commands with a known signature: [optional argument?, number of mandatory arguments]. */
const ARITY: Record<string, [boolean, number]> = {
  section: [true, 1], subsection: [true, 1], subsubsection: [true, 1], paragraph: [true, 1], subparagraph: [true, 1], chapter: [true, 1], part: [true, 1],
  textbf: [false, 1], textit: [false, 1], emph: [false, 1], textsl: [false, 1], underline: [false, 1], uline: [false, 1], sout: [false, 1], st: [false, 1],
  texttt: [false, 1], textsc: [false, 1], textrm: [false, 1], textsf: [false, 1], textup: [false, 1], textmd: [false, 1], textnormal: [false, 1],
  url: [false, 1], href: [false, 2], includegraphics: [true, 1], title: [true, 1], author: [true, 1], date: [false, 1],
  footnote: [true, 1], label: [false, 1], ref: [false, 1], eqref: [false, 1], cite: [true, 1], caption: [true, 1],
  textcolor: [true, 2], color: [true, 1], colorbox: [true, 2], mbox: [false, 1], fbox: [false, 1], makebox: [true, 1],
  vspace: [false, 1], hspace: [false, 1], item: [true, 0], documentclass: [true, 1], usepackage: [true, 1],
  c: [false, 1], v: [false, 1], H: [false, 1], u: [false, 1], k: [false, 1], r: [false, 1], d: [false, 1], b: [false, 1],
  thanks: [false, 1], phantom: [false, 1], hyperref: [true, 1], newpage: [false, 0], clearpage: [false, 0],
  fancyhead: [true, 1], fancyfoot: [true, 1], lhead: [false, 1], chead: [false, 1], rhead: [false, 1], lfoot: [false, 1], cfoot: [false, 1], rfoot: [false, 1],
  fancyhf: [true, 1], pageref: [false, 1],
  captionof: [true, 2], autoref: [false, 1], cref: [false, 1], Cref: [false, 1], nameref: [false, 1], vref: [false, 1],
};

const FANCY = new Set(['fancyhead', 'fancyfoot', 'lhead', 'chead', 'rhead', 'lfoot', 'cfoot', 'rfoot']);

const ACCENTS: Record<string, string> = {
  "'": '́', '`': '̀', '^': '̂', '"': '̈', '~': '̃', '=': '̄', '.': '̇',
  c: '̧', v: '̌', H: '̋', u: '̆', k: '̨', r: '̊', d: '̣', b: '̱',
};

const SYMBOLS: Record<string, string> = {
  '%': '%', '&': '&', $: '$', '#': '#', _: '_', '{': '{', '}': '}', ' ': ' ', ',': ' ', ';': ' ', ':': ' ', '!': '', '@': '', '-': '', '/': '',
  i: 'ı', j: 'ȷ', o: 'ø', O: 'Ø', ss: 'ß', ae: 'æ', AE: 'Æ', oe: 'œ', OE: 'Œ', aa: 'å', AA: 'Å', l: 'ł', L: 'Ł',
  ldots: '…', dots: '…', textellipsis: '…', textbackslash: '\\', textasciitilde: '~', textasciicircum: '^', textbar: '|',
  textless: '<', textgreater: '>', textendash: '–', textemdash: '—', textquoteleft: '‘', textquoteright: '’', textquotedblleft: '“',
  textquotedblright: '”', S: '§', P: '¶', copyright: '©', textregistered: '®', texttrademark: '™', euro: '€', pounds: '£', textdegree: '°',
  LaTeX: 'LaTeX', TeX: 'TeX', LaTeXe: 'LaTeX2e', quad: ' ', qquad: '  ', enspace: ' ', thinspace: ' ', nobreakspace: ' ',
};

/** Commands ignored on import (layout only). */
const IGNORED = new Set([
  'maketitle', 'noindent', 'indent', 'centering', 'raggedright', 'raggedleft', 'hfill', 'vfill', 'smallskip', 'medskip',
  'bigskip', 'newpage', 'clearpage', 'pagebreak', 'nopagebreak', 'vspace', 'hspace', 'protect', 'relax', 'small', 'large', 'Large',
  'LARGE', 'huge', 'Huge', 'normalsize', 'footnotesize', 'scriptsize', 'tiny', 'selectfont', 'color', 'hline', 'toprule', 'midrule',
  'bottomrule', 'phantom', 'nonumber', 'notag', 'documentclass', 'usepackage', 'thispagestyle', 'pagestyle',
]);

const MATH_ENVS = new Set(['equation', 'equation*', 'displaymath', 'math', 'gather', 'gather*', 'multline', 'multline*']);
const ALIGN_ENVS = new Set(['align', 'align*', 'eqnarray', 'eqnarray*', 'flalign', 'flalign*', 'alignat', 'alignat*']);
const VERBATIM_ENVS = new Set(['verbatim', 'verbatim*', 'lstlisting', 'minted', 'Verbatim', 'comment']);
const TRANSPARENT_ENVS = new Set(['document', 'table', 'table*', 'figure', 'figure*', 'minipage', 'abstract', 'small', 'footnotesize', 'adjustbox', 'samepage']);

class Parser {
  private pos = 0;
  constructor(private readonly src: string) {}

  parse(): Node[] {
    return this.nodes(null);
  }

  private nodes(stop: '}' | null): Node[] {
    const out: Node[] = [];
    let text = '';
    const flushText = (): void => {
      if (text) out.push({ k: 'text', v: text });
      text = '';
    };
    const s = this.src;
    while (this.pos < s.length) {
      const c = s[this.pos]!;
      if (c === '}' && stop === '}') {
        this.pos++;
        break;
      }
      if (c === '%') {
        flushText();
        while (this.pos < s.length && s[this.pos] !== '\n') this.pos++;
        this.pos++;
        while (s[this.pos] === ' ' || s[this.pos] === '\t') this.pos++;
        continue;
      }
      if (c === '\n') {
        let j = this.pos + 1;
        while (s[j] === ' ' || s[j] === '\t' || s[j] === '\r') j++;
        if (s[j] === '\n') {
          flushText();
          out.push({ k: 'par' });
          while (/\s/.test(s[j] ?? '')) j++;
          this.pos = j;
        } else {
          text += ' ';
          this.pos++;
        }
        continue;
      }
      if (c === '{') {
        flushText();
        this.pos++;
        out.push({ k: 'group', body: this.nodes('}') });
        continue;
      }
      if (c === '$') {
        flushText();
        const display = s[this.pos + 1] === '$';
        const delim = display ? '$$' : '$';
        const end = this.findUnescaped(delim, this.pos + delim.length);
        if (end < 0) {
          text += c;
          this.pos++;
          continue;
        }
        out.push({ k: 'math', display, latex: s.slice(this.pos + delim.length, end).trim() });
        this.pos = end + delim.length;
        continue;
      }
      if (c === '\\') {
        const next = s[this.pos + 1] ?? '';
        if (next === '(' || next === '[') {
          flushText();
          const close = next === '(' ? '\\)' : '\\]';
          const end = s.indexOf(close, this.pos + 2);
          if (end >= 0) {
            out.push({ k: 'math', display: next === '[', latex: s.slice(this.pos + 2, end).trim() });
            this.pos = end + 2;
            continue;
          }
        }
        if (next === '\\') {
          flushText();
          out.push({ k: 'break' });
          this.pos += 2;
          if (s[this.pos] === '*') this.pos++;
          this.skipOptional();
          this.skipSpaces();
          continue;
        }
        flushText();
        out.push(this.command());
        continue;
      }
      text += c;
      this.pos++;
    }
    flushText();
    return out;
  }

  private findUnescaped(delim: string, from: number): number {
    let i = from;
    for (;;) {
      i = this.src.indexOf(delim, i);
      if (i < 0) return -1;
      if (this.src[i - 1] !== '\\') return i;
      i++;
    }
  }

  private skipSpaces(): void {
    while (this.src[this.pos] === ' ' || this.src[this.pos] === '\t' || (this.src[this.pos] === '\n' && this.src[this.pos + 1] !== '\n')) this.pos++;
  }

  private skipOptional(): void {
    if (this.src[this.pos] === '[') this.balanced('[', ']');
  }

  /** Read a balanced group starting at the current opening character; returns its inner text. */
  private balanced(open: string, close: string): string {
    const s = this.src;
    let depth = 0;
    const start = this.pos + 1;
    for (; this.pos < s.length; this.pos++) {
      const c = s[this.pos];
      if (c === '\\') {
        this.pos++;
        continue;
      }
      if (c === open || (open === '[' && c === '{')) depth++;
      else if (c === close || (open === '[' && c === '}')) {
        depth--;
        if (depth === 0) {
          this.pos++;
          return s.slice(start, this.pos - 1);
        }
      }
    }
    return s.slice(start);
  }

  private mandatory(): string {
    this.skipSpaces();
    const c = this.src[this.pos];
    if (c === '{') return this.balanced('{', '}');
    if (c === '\\') {
      const m = /^\\([A-Za-z]+|.)/.exec(this.src.slice(this.pos));
      this.pos += m ? m[0].length : 1;
      return m ? m[0] : '';
    }
    this.pos++;
    return c ?? '';
  }

  private command(): Node {
    const s = this.src;
    const start = this.pos;
    this.pos++;
    const m = /^([A-Za-z]+|.)/.exec(s.slice(this.pos));
    const name = m ? m[1]! : '';
    this.pos += name.length;
    const letters = /^[A-Za-z]+$/.test(name);
    let star = false;
    if (letters && s[this.pos] === '*') {
      star = true;
      this.pos++;
    }
    if (name === 'begin') return this.environment(start);
    if (name === 'verb' || name === 'lstinline') {
      const delim = s[this.pos]!;
      const end = s.indexOf(delim, this.pos + 1);
      const body = s.slice(this.pos + 1, end < 0 ? undefined : end);
      this.pos = end < 0 ? s.length : end + 1;
      return { k: 'cmd', name: 'verb', star, args: [body], raw: s.slice(start, this.pos) };
    }
    if (!letters && ACCENTS[name]) {
      return { k: 'cmd', name, star, args: [this.mandatory()], raw: s.slice(start, this.pos) };
    }
    const sig = ARITY[name];
    if (sig) {
      let opt: string | undefined;
      const save = this.pos;
      this.skipSpaces();
      if (sig[0] && s[this.pos] === '[') opt = this.balanced('[', ']');
      else this.pos = sig[1] ? this.pos : save;
      const args: string[] = [];
      for (let i = 0; i < sig[1]; i++) args.push(this.mandatory());
      const node: Node = { k: 'cmd', name, star, args, raw: s.slice(start, this.pos) };
      if (opt !== undefined) node.opt = opt;
      return node;
    }
    if (letters) {
      // Unknown command: only arguments written right after it belong to it.
      const args: string[] = [];
      let opt: string | undefined;
      if (s[this.pos] === '[') opt = this.balanced('[', ']');
      while (s[this.pos] === '{') args.push(this.balanced('{', '}'));
      if (!args.length && !opt && (s[this.pos] === ' ' || s[this.pos] === '\t')) {
        // a control word swallows the following spaces
        while (s[this.pos] === ' ' || s[this.pos] === '\t') this.pos++;
      }
      const node: Node = { k: 'cmd', name, star, args, raw: s.slice(start, this.pos) };
      if (opt !== undefined) node.opt = opt;
      return node;
    }
    return { k: 'cmd', name, star, args: [], raw: s.slice(start, this.pos) };
  }

  private environment(start: number): Node {
    const s = this.src;
    const name = this.mandatory().trim();
    let opt: string | undefined;
    const args: string[] = [];
    if (s[this.pos] === '[') opt = this.balanced('[', ']');
    if (/^(tabular\*?|tabularx|longtable|array|minipage|minted|adjustbox)$/.test(name)) {
      if (name === 'tabularx' || name === 'tabular*' || name === 'adjustbox') args.push(this.mandatory());
      if (name === 'minipage' && s[this.pos] === '[') this.balanced('[', ']');
      args.push(this.mandatory());
    }
    const bodyStart = this.pos;
    const beginTag = `\\begin{${name}}`;
    const endTag = `\\end{${name}}`;
    let depth = 1;
    let i = this.pos;
    let bodyEnd = s.length;
    while (i < s.length) {
      const nb = s.indexOf(beginTag, i);
      const ne = s.indexOf(endTag, i);
      if (ne < 0) break;
      if (nb >= 0 && nb < ne && !VERBATIM_ENVS.has(name)) {
        depth++;
        i = nb + beginTag.length;
      } else {
        depth--;
        i = ne + endTag.length;
        if (depth === 0) {
          bodyEnd = ne;
          break;
        }
      }
    }
    this.pos = depth === 0 ? i : s.length;
    const node: Node = { k: 'env', name, args, body: s.slice(bodyStart, bodyEnd), raw: s.slice(start, this.pos) };
    if (opt !== undefined) node.opt = opt;
    return node;
  }
}

const parse = (src: string): Node[] => new Parser(src).parse();

function typography(text: string): string {
  return text
    .replace(/---/g, '—')
    .replace(/--/g, '–')
    .replace(/``/g, '“')
    .replace(/''/g, '”')
    .replace(/`/g, '‘')
    .replace(/~/g, ' ')
    .replace(/[ \t\r\n]+/g, ' ');
}

export interface LatexReadOptions {
  /** Resolve an \includegraphics path (without or with extension). */
  resolveImage?: (path: string) => { data: Uint8Array; mediaType: string; name?: string } | undefined;
}

interface Ctx {
  style: ParagraphStyle;
  align?: Align;
  listDepth: number;
  ordered: boolean;
  inList: boolean;
}

const HEADING_LEVEL: Record<string, ParagraphStyle> = {
  part: 'h1', chapter: 'h1', section: 'h1', subsection: 'h2', subsubsection: 'h3', paragraph: 'h4', subparagraph: 'h5',
};

class Builder {
  readonly blocks: Block[] = [];
  private current: Paragraph | null = null;
  private listInfo: { ordered: boolean; level: number } | undefined;

  constructor(
    private readonly doc: RichDocument,
    private readonly opts: LatexReadOptions,
  ) {}

  /** Floats being read (figure, table), for their captions (DOC-026). */
  private floats: SeqKind[] = [];
  /** The last heading, caption or equation: what a \label names. */
  private lastTarget: Paragraph | undefined;

  flush(): void {
    const p = this.current;
    if (!p) return;
    this.current = null;
    p.runs = normalizeRuns(p.runs);
    const first = p.runs[0];
    if (first && 'text' in first) {
      first.text = first.text.replace(/^ +/, '');
      if (!first.text) p.runs.shift();
    }
    const last = p.runs[p.runs.length - 1];
    if (last && 'text' in last) {
      last.text = last.text.replace(/[ \n]+$/, '');
      if (!last.text) p.runs.pop();
    }
    if (!p.runs.length && !p.list) return;
    this.blocks.push(p);
  }

  private open(ctx: Ctx): Paragraph {
    if (!this.current) {
      this.current = { type: 'paragraph', style: ctx.style, runs: [] };
      if (ctx.align && ctx.align !== 'left') this.current.align = ctx.align;
      if (ctx.inList && this.listInfo) this.current.list = { ...this.listInfo };
    }
    return this.current;
  }

  private text(t: string, fmt: TextFormat, ctx: Ctx): void {
    if (!t) return;
    if (!this.current && !t.trim()) return;
    this.open(ctx).runs.push({ text: t, ...cleanFormat(fmt) });
  }

  private run(run: Run, ctx: Ctx): void {
    this.open(ctx).runs.push(run);
  }

  /** Runs of an argument (used for headings, cells, titles). */
  /** \\fancyhead[L]{…}, \\cfoot{…}… into the document's page setup (DOC-024). */
  furniture(name: string, raw: string): void {
    const m = /^\\\w+(?:\[([LCRE,O]*)\])?\{([\s\S]*)\}$/.exec(raw.trim());
    if (!m) return;
    const kind = /head/.test(name) ? 'header' : 'footer';
    const short = /^[lcr]/.exec(name)?.[0].toUpperCase();
    const where = (m[1] ?? short ?? 'C').replace(/[EO,]/g, '') || 'C';
    const text = m[2]!
      .replace(/\\(thepage|today|thetitle)\{\}/g, '\\$1')
      .replace(/\\thepage\b/g, '{page}')
      .replace(/\\pageref\*?\{LastPage\}/g, '{pages}')
      .replace(/\\today\b/g, '{date}')
      .replace(/\\thetitle\b|\\@title\b/g, '{title}');
    const plain = text.replace(/\{(page|pages|date|title)\}/g, '\u0001$1\u0002');
    const value = this.plain(plain).replace(/\u0001(\w+)\u0002/g, '{$1}');
    const page = (this.doc.page ??= {});
    const zones = (page[kind] ??= {});
    for (const c of where) {
      const key = c === 'L' ? 'left' : c === 'R' ? 'right' : 'center';
      if (value) zones[key] = value;
      else delete zones[key];
    }
  }

  /** Runs of a LaTeX fragment; its paragraphs are joined with `paragraphSep`. */
  inlineRuns(src: string, fmt: TextFormat = {}, paragraphSep?: string): Run[] {
    const sub = new Builder(this.doc, this.opts);
    sub.walk(parse(src), fmt, { style: 'normal', listDepth: 0, ordered: false, inList: false });
    sub.flush();
    return sub.blocks.flatMap((b, i): Run[] => (b.type === 'paragraph' ? [...(i > 0 && paragraphSep ? [{ text: paragraphSep }] : []), ...b.runs] : []));
  }

  plain(src: string): string {
    return this.inlineRuns(src)
      .map((r) => ('text' in r ? r.text : ''))
      .join('')
      .trim();
  }

  walk(nodes: Node[], parentFmt: TextFormat, ctx: Ctx): void {
    let fmt = { ...parentFmt };
    let local = { ...ctx };
    for (const node of nodes) {
      switch (node.k) {
        case 'text':
          this.text(typography(node.v), fmt, local);
          break;
        case 'par':
          this.flush();
          break;
        case 'break':
          if (this.current) this.text('\n', fmt, local);
          break;
        case 'group':
          this.walk(node.body, fmt, local);
          break;
        case 'math':
          if (node.display) {
            this.flush();
            this.blocks.push({ type: 'paragraph', style: 'normal', runs: [{ math: node.latex, display: true }] });
          } else {
            this.run({ math: node.latex }, local);
          }
          break;
        case 'env':
          this.environment(node, fmt, local);
          break;
        case 'cmd': {
          const result = this.command(node, fmt, local);
          if (result) {
            fmt = result.fmt ?? fmt;
            local = result.ctx ?? local;
          }
          break;
        }
      }
    }
  }

  private command(node: Extract<Node, { k: 'cmd' }>, fmt: TextFormat, ctx: Ctx): { fmt?: TextFormat; ctx?: Ctx } | void {
    const { name, args } = node;
    const arg = (i: number, f: TextFormat = fmt): void => this.walk(parse(args[i] ?? ''), f, ctx);
    if (name === 'newpage' || name === 'clearpage' || name === 'pagebreak') {
      // DOC-021: page breaks between paragraphs.
      this.flush();
      if (this.blocks.length) this.blocks.push({ type: 'rule', page: true });
      return;
    }
    if (FANCY.has(name)) {
      // DOC-024: fancyhdr header and footer zones.
      this.furniture(name, node.raw);
      return;
    }
    if (name === 'tableofcontents') {
      this.flush();
      this.blocks.push({ type: 'toc' });
      return;
    }
    if (name === 'hrule' || (name === 'rule' && /\\(?:line|text)width/.test(args[0] ?? ''))) {
      // A full-width rule is a horizontal line.
      this.flush();
      this.blocks.push({ type: 'rule' });
      return;
    }
    if (HEADING_LEVEL[name]) {
      this.flush();
      const runs = normalizeRuns(this.inlineRuns(args[0] ?? '').map((r) => ('text' in r ? { ...r, text: r.text.replace(/\n/g, ' ') } : r)));
      const heading: Paragraph = { type: 'paragraph', style: HEADING_LEVEL[name]!, runs };
      this.blocks.push(heading);
      this.lastTarget = heading;
      return;
    }
    if (ACCENTS[name] && !/^[A-Za-z]{2,}$/.test(name)) {
      const base = this.plain(args[0] ?? '') || ' ';
      this.text((base[0] + ACCENTS[name]!).normalize('NFC') + base.slice(1), fmt, ctx);
      return;
    }
    switch (name) {
      case 'textbf':
        return void arg(0, { ...fmt, bold: true });
      case 'textit':
      case 'emph':
      case 'textsl':
        return void arg(0, { ...fmt, italic: !(name === 'emph' && fmt.italic) || undefined });
      case 'underline':
      case 'uline':
        return void arg(0, { ...fmt, underline: true });
      case 'sout':
      case 'st':
        return void arg(0, { ...fmt, strike: true });
      case 'texttt':
        return void arg(0, { ...fmt, code: true });
      case 'textsc':
      case 'textrm':
      case 'textsf':
      case 'textup':
      case 'textmd':
      case 'textnormal':
      case 'mbox':
      case 'fbox':
      case 'makebox':
        return void arg(0);
      case 'textcolor':
      case 'colorbox':
        return void arg(1);
      case 'verb':
        return void this.text(args[0] ?? '', { ...fmt, code: true }, ctx);
      case 'href':
        return void arg(1, { ...fmt, link: (args[0] ?? '').replace(/\\([%#&_~])/g, '$1') });
      case 'url': {
        const url = (args[0] ?? '').replace(/\\([%#&_~])/g, '$1');
        return void this.text(url, { ...fmt, link: url, code: true }, ctx);
      }
      case 'footnote': {
        // DOC-022: a real footnote; blank lines inside separate its paragraphs.
        const note = normalizeRuns(this.inlineRuns(args[0] ?? '', {}, '\n\n'));
        if (note.length) this.open(ctx).runs.push({ footnote: note });
        return;
      }
      case 'caption':
      case 'captionof': {
        // DOC-026: a numbered caption; its \label names it.
        this.flush();
        const kind = name === 'captionof' ? seqKindOf(args[0] ?? '') : (this.floats[this.floats.length - 1] ?? 'figure');
        const fr = this.doc.meta.language?.startsWith('fr');
        const word = kind === 'table' ? (fr ? 'Tableau' : 'Table') : kind === 'equation' ? (fr ? 'Équation' : 'Equation') : 'Figure';
        const runs = normalizeRuns(this.inlineRuns(args[name === 'captionof' ? 1 : 0] ?? '').map((r) => ('text' in r ? { ...r, text: r.text.replace(/\n/g, ' ') } : r)));
        const p: Paragraph = { type: 'paragraph', style: 'caption', runs: [{ text: `${word} ` }, { seq: kind }, ...(runs.length ? [{ text: ': ' }, ...runs] : [])] };
        if (ctx.align === 'center') p.align = 'center';
        this.blocks.push(p);
        this.lastTarget = p;
        return;
      }
      case 'label': {
        const target = this.lastTarget ?? this.current;
        if (target && !target.id && args[0]) target.id = args[0].trim();
        return;
      }
      case 'ref':
      case 'autoref':
      case 'cref':
      case 'Cref':
      case 'vref':
      case 'eqref':
      case 'nameref': {
        if (!args[0]) return;
        const p = this.open(ctx);
        // "Figure~\ref{x}": the reference shows the label itself.
        const last = p.runs[p.runs.length - 1];
        if (name === 'ref' && last && 'text' in last) last.text = last.text.replace(/(?:Figures?|Fig\.|Tables?|Tableaux?|Équations?|Equations?|Eqs?\.|Éq\.)[\s\u00a0]*$/i, '');
        return void p.runs.push({ ref: args[0].split(',')[0]!.trim() });
      }
      case 'includegraphics':
        return void this.image(node.opt, args[0] ?? '', ctx);
      case 'item': {
        if (!ctx.inList) return void this.text(node.raw, fmt, ctx);
        this.flush();
        this.listInfo = { ordered: ctx.ordered, level: Math.max(0, ctx.listDepth - 1) };
        this.open(ctx);
        if (node.opt !== undefined) {
          this.walk(parse(node.opt), { ...fmt, bold: true }, ctx);
          this.text(' ', fmt, ctx);
        }
        return;
      }
      case 'par':
        return void this.flush();
      case 'newline':
      case 'linebreak':
        return void this.text('\n', fmt, ctx);
      case 'today':
        return void this.text(new Date().toISOString().slice(0, 10), fmt, ctx);
      case 'bfseries':
      case 'bf':
        return { fmt: { ...fmt, bold: true } };
      case 'itshape':
      case 'it':
      case 'em':
      case 'slshape':
        return { fmt: { ...fmt, italic: true } };
      case 'ttfamily':
      case 'tt':
        return { fmt: { ...fmt, code: true } };
      case 'centering':
        if (this.current) this.current.align = 'center';
        return { ctx: { ...ctx, align: 'center' } };
      case 'title':
      case 'author':
      case 'date':
      case 'thanks':
        return;
      case 'cite':
        return void this.text(node.raw, fmt, ctx);
      default:
        if (name in SYMBOLS) return void this.text(SYMBOLS[name]!, fmt, ctx);
        if (IGNORED.has(name)) return;
        // TEX-004: keep the source of unsupported commands visible.
        return void this.text(node.raw, fmt, ctx);
    }
  }

  private image(opt: string | undefined, path: string, ctx: Ctx): void {
    const resolved = this.opts.resolveImage?.(path.trim());
    const run: Run = resolved ? { image: addResource(this.doc, resolved.data, resolved.mediaType, resolved.name) } : { image: '', src: path.trim() };
    const width = /width\s*=\s*([\d.]+)\s*(\\linewidth|\\textwidth|\\columnwidth|cm|mm|in|pt|px)?/.exec(opt ?? '');
    if (width) {
      const n = Number(width[1]);
      const unit = width[2] ?? 'pt';
      const px = unit.startsWith('\\') ? n * 600 : unit === 'cm' ? (n * 96) / 2.54 : unit === 'mm' ? (n * 96) / 25.4 : unit === 'in' ? n * 96 : unit === 'px' ? n : (n * 96) / 72;
      if (px > 0) run.width = Math.round(px);
    }
    this.run(run, ctx);
  }

  private environment(node: Extract<Node, { k: 'env' }>, fmt: TextFormat, ctx: Ctx): void {
    const { name, body } = node;
    if (MATH_ENVS.has(name) || ALIGN_ENVS.has(name)) {
      this.flush();
      let latex = body.replace(/\\(label|tag)\{[^}]*\}/g, '').replace(/\\(nonumber|notag)\b/g, '').trim();
      if (ALIGN_ENVS.has(name)) latex = `\\begin{aligned}${latex}\\end{aligned}`;
      // DOC-026: numbered environments get an equation number, their \label its anchor.
      const numbered = !name.endsWith('*') && name !== 'displaymath' && name !== 'math' && !/\\(nonumber|notag)\b/.test(body);
      const p: Paragraph = { type: 'paragraph', style: 'normal', runs: numbered ? [{ math: latex, display: true }, { seq: 'equation' }] : [{ math: latex, display: true }] };
      const label = /\\label\{([^}]*)\}/.exec(body)?.[1]?.trim();
      if (label) p.id = label;
      this.blocks.push(p);
      this.lastTarget = p;
      return;
    }
    if (VERBATIM_ENVS.has(name)) {
      this.flush();
      if (name === 'comment') return;
      const code = body.replace(/^\r?\n/, '').replace(/\r?\n$/, '');
      this.blocks.push({ type: 'paragraph', style: 'code', runs: code ? [{ text: code }] : [] });
      return;
    }
    const nodes = (): Node[] => parse(body);
    switch (name) {
      case 'itemize':
      case 'enumerate':
      case 'description': {
        this.flush();
        const saved = this.listInfo;
        this.walk(nodes(), fmt, { ...ctx, style: 'normal', inList: true, listDepth: ctx.listDepth + 1, ordered: name === 'enumerate' });
        this.flush();
        this.listInfo = saved;
        return;
      }
      case 'quote':
      case 'quotation':
      case 'verse':
        this.flush();
        this.walk(nodes(), fmt, { ...ctx, style: 'quote', inList: false });
        this.flush();
        return;
      case 'center':
      case 'flushright':
      case 'flushleft':
        this.flush();
        this.walk(nodes(), fmt, { ...ctx, align: name === 'center' ? 'center' : name === 'flushright' ? 'right' : 'left' });
        this.flush();
        return;
      case 'tabular':
      case 'tabular*':
      case 'tabularx':
      case 'longtable':
      case 'array':
        this.flush();
        this.table(body);
        return;
      default:
        if (TRANSPARENT_ENVS.has(name)) {
          this.flush();
          const float = /^figure/.test(name) ? 'figure' : /^table/.test(name) ? 'table' : undefined;
          if (float) this.floats.push(float);
          this.walk(nodes(), fmt, ctx);
          if (float) this.floats.pop();
          this.flush();
          return;
        }
        // TEX-004: unsupported environment kept as visible source.
        this.flush();
        this.blocks.push({ type: 'paragraph', style: 'code', runs: [{ text: node.raw }] });
    }
  }

  private table(body: string): void {
    const rows: string[][] = [];
    let depth = 0;
    let cell = '';
    let row: string[] = [];
    for (let i = 0; i < body.length; i++) {
      const c = body[i]!;
      if (c === '\\' && body[i + 1] === '\\' && depth === 0) {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
        i++;
        continue;
      }
      if (c === '\\') {
        cell += c + (body[i + 1] ?? '');
        i++;
        continue;
      }
      if (c === '{') depth++;
      if (c === '}') depth--;
      if (c === '&' && depth === 0) {
        row.push(cell);
        cell = '';
        continue;
      }
      cell += c;
    }
    if (cell.trim()) {
      row.push(cell);
      rows.push(row);
    }
    const clean = (s: string): string => s.replace(/\\(hline|toprule|midrule|bottomrule|endhead|endfoot|endfirsthead)\b/g, '').replace(/\\cline\{[^}]*\}/g, '').trim();
    // A double rule or a booktabs \midrule under the first row marks the header row (DOC-025).
    const kept = rows.filter((r) => r.map(clean).some((c) => c));
    const header = kept.length > 1 && /^\s*(?:\\hline\s*\\hline|\\midrule)/.test(kept[1]![0] ?? '');
    if (!kept.length) return;
    /** Columns still covered by a \multirow from a row above: column -> rows left. */
    const covered = new Map<number, number>();
    const out: TableCell[][] = kept.map((raw) => {
      const row: TableCell[] = [];
      let col = 0;
      for (let text of raw.map(clean)) {
        if (covered.get(col)) {
          // The empty placeholder under a \multirow (a \multicolumn when it is wide).
          const n = Math.max(1, Number(/^\\multicolumn\s*\{(\d+)\}/.exec(text)?.[1] ?? 1));
          for (let i = 0; i < n; i++) covered.set(col + i, Math.max(0, (covered.get(col + i) ?? 0) - 1));
          col += n;
          continue;
        }
        let colSpan = 1;
        let rowSpan = 1;
        const mc = /^\\multicolumn\s*\{(\d+)\}\s*\{[^}]*\}\s*\{([\s\S]*)\}$/.exec(text);
        if (mc) {
          colSpan = Math.max(1, Number(mc[1]));
          text = mc[2]!.trim();
        }
        const mr = /^\\multirow\s*\{(\d+)\}\s*\{[^}]*\}\s*\{([\s\S]*)\}$/.exec(text);
        if (mr) {
          rowSpan = Math.max(1, Number(mr[1]));
          text = mr[2]!.trim();
        }
        const cell: TableCell = { blocks: [{ type: 'paragraph', style: 'normal', runs: normalizeRuns(this.inlineRuns(text)) }] };
        if (colSpan > 1) cell.colSpan = colSpan;
        if (rowSpan > 1) {
          cell.rowSpan = rowSpan;
          for (let i = 0; i < colSpan; i++) covered.set(col + i, rowSpan - 1);
        }
        row.push(cell);
        col += colSpan;
      }
      return row;
    });
    this.blocks.push(header ? { type: 'table', rows: out, header } : { type: 'table', rows: out });
  }
}

/** `key={value}, key=value` pairs at the top level of a hyperref option list. */
function keyValues(src: string): [string, string][] {
  const out: [string, string][] = [];
  let depth = 0;
  let current = '';
  const push = (): void => {
    const m = /^\s*([A-Za-z]+)\s*=\s*([\s\S]*?)\s*$/.exec(current);
    if (m) out.push([m[1]!.toLowerCase(), m[2]!.replace(/^\{([\s\S]*)\}$/, '$1')]);
    current = '';
  };
  for (const ch of src) {
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (ch === ',' && depth === 0) push();
    else current += ch;
  }
  push();
  return out;
}

export function readLatex(source: string, opts: LatexReadOptions = {}): RichDocument {
  const doc = emptyDocument();
  const src = source.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const begin = src.indexOf('\\begin{document}');
  const end = src.lastIndexOf('\\end{document}');
  const body = begin >= 0 ? src.slice(begin + '\\begin{document}'.length, end > begin ? end : undefined) : src;
  const builder = new Builder(doc, opts);
  // Metadata from the whole source (preamble or body).
  for (const node of parse(src.slice(0, end > 0 ? end : undefined))) {
    if (node.k !== 'cmd' && node.k !== 'env') continue;
    if (node.k === 'env' && node.name === 'document') {
      for (const inner of parse(node.body)) {
        if (inner.k === 'cmd' && (inner.name === 'title' || inner.name === 'author')) {
          const v = builder.plain(inner.args[0] ?? '');
          if (v) doc.meta[inner.name] = v;
        }
      }
    }
    if (node.k === 'cmd' && (node.name === 'title' || node.name === 'author')) {
      const v = builder.plain((node.args[0] ?? '').replace(/\\thanks\{[^}]*\}/g, '').replace(/\\and\b/g, ', '));
      if (v) doc.meta[node.name] = v;
    }
    if (node.k === 'cmd' && FANCY.has(node.name)) builder.furniture(node.name, node.raw);
    if (node.k === 'cmd' && node.name === 'date') {
      const v = builder.plain(node.args[0] ?? '');
      if (v && !/\\today/.test(node.args[0] ?? '')) doc.meta.date = v;
    }
    // DOC-017: PDF properties set with \hypersetup{pdfsubject=…, pdfkeywords=…}.
    if (node.k === 'cmd' && node.name === 'hypersetup') {
      for (const [key, value] of keyValues(node.args.join(','))) {
        const v = builder.plain(value);
        if (!v) continue;
        if (key === 'pdftitle') doc.meta.title ??= v;
        else if (key === 'pdfauthor') doc.meta.author ??= v;
        else if (key === 'pdfsubject') doc.meta.subject = v;
        else if (key === 'pdfkeywords') doc.meta.keywords = v.split(',');
        else if (key === 'pdflang') doc.meta.language = v;
      }
    }
  }
  doc.meta = cleanMeta(doc.meta);
  const page = cleanPageSetup(doc.page);
  if (page) doc.page = page;
  else delete doc.page;
  builder.walk(parse(body), {}, { style: 'normal', listDepth: 0, ordered: false, inList: false });
  builder.flush();
  doc.blocks = builder.blocks.length ? builder.blocks : emptyDocument().blocks;
  // "(\ref{eq})": the reference to an equation already shows its parentheses.
  const { targets } = crossTargets(doc.blocks);
  for (const p of allParagraphs(doc.blocks)) {
    p.runs.forEach((r, i) => {
      const before = p.runs[i - 1];
      const after = p.runs[i + 1];
      if (isRefRun(r) && targets.get(r.ref)?.kind === 'equation' && before && 'text' in before && after && 'text' in after && before.text.endsWith('(') && after.text.startsWith(')')) {
        before.text = before.text.slice(0, -1);
        after.text = after.text.slice(1);
      }
    });
    p.runs = normalizeRuns(p.runs);
  }
  resolveAnchors(doc.blocks, new Map());
  return doc;
}
