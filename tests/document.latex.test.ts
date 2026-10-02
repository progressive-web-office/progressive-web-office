import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8, zipSync, strToU8 } from 'fflate';
import { writeLatex, escapeLatex } from '../src/document/latex-writer';
import { readLatex } from '../src/document/latex-reader';
import { readDocument, writeDocument } from '../src/document/io';
import { detectFormat } from '../src/core/format';
import { emptyDocument, paragraph, type Block, type RichDocument } from '../src/document/model';
import { PNG_1PX, richSample } from './fixtures';

const strip = (blocks: Block[]) =>
  JSON.parse(JSON.stringify(blocks).replace(/,"width":\d+(,"height":\d+)?/g, '').replace(/"align":"justify",?/g, '').replace(/,"alt":"[^"]*"/g, '').replace(/"image":"[0-9a-f]+"/g, '"image":"K"'));

describe('TEX-001 LaTeX export', () => {
  it('escapes special characters', () => {
    expect(escapeLatex('50% of $5 & #1_a {b} ~ ^ \\')).toBe('50\\% of \\$5 \\& \\#1\\_a \\{b\\} \\textasciitilde{} \\textasciicircum{} \\textbackslash{}');
  });

  it('writes a compilable article with structure, formatting, lists, tables and math', () => {
    const doc = richSample();
    doc.blocks.push({ type: 'paragraph', style: 'normal', runs: [{ text: 'Area ' }, { math: '\\pi r^2' }] }, { type: 'paragraph', style: 'normal', runs: [{ math: 'E=mc^2', display: true }] });
    const { tex, images } = writeLatex(doc);
    expect(tex).toMatch(/^\\documentclass\{article\}/);
    for (const pkg of ['amsmath', 'graphicx', 'hyperref', 'ulem']) expect(tex).toContain(pkg);
    expect(tex).toContain('\\title{Sample}');
    expect(tex).toContain('\\section{Main title}');
    expect(tex).toContain('\\subsection{Section}');
    expect(tex).toContain('\\textbf{bold}');
    expect(tex).toContain('\\href{https://example.org/}{link}');
    expect(tex).toMatch(/\\begin\{itemize\}\s*\\item first\s*\\begin\{itemize\}\s*\\item nested/);
    expect(tex).toContain('\\begin{enumerate}');
    expect(tex).toMatch(/\\begin\{tabular\}\{\|l\|l\|\}/);
    expect(tex).toContain('\\begin{verbatim}\nconst x = 1;\n\\end{verbatim}');
    expect(tex).toContain('$\\pi r^2$');
    expect(tex).toContain('\\[E=mc^2\\]');
    expect(tex).toMatch(/\\includegraphics\[width=[\d.]+\\linewidth\]\{images\/[0-9a-f]+\.png\}/);
    expect(tex.trim().endsWith('\\end{document}')).toBe(true);
    expect(images.size).toBe(1);
  });

  it('TEX-002 exports a ZIP project with main.tex and images', () => {
    const bytes = writeDocument(richSample(), 'texzip');
    const zip = unzipSync(bytes);
    expect(Object.keys(zip)).toContain('main.tex');
    expect(Object.keys(zip).some((p) => /^images\/[0-9a-f]+\.png$/.test(p))).toBe(true);
    expect(detectFormat('x.zip', bytes)).toBe('texzip');
  });

  it('round-trips the rich sample through LaTeX', async () => {
    const doc = richSample();
    const back = await readDocument('texzip', writeDocument(doc, 'texzip'));
    expect(strip(back.blocks)).toEqual(strip(doc.blocks));
    expect(back.meta.title).toBe('Sample');
  });
});

describe('TEX-003 LaTeX import', () => {
  const read = (body: string) => readLatex(`\\documentclass{article}\n\\usepackage{amsmath}\n\\title{T}\\author{A}\n\\begin{document}\n\\maketitle\n${body}\n\\end{document}`).blocks;

  it('reads sectioning, formatting, special characters and paragraphs', () => {
    expect(read("\\section{Intro}\nSome \\textbf{bold} and \\emph{it} text,\nsame paragraph. 50\\% ``quoted'' --- dash~here.\n\n\\subsection*{Next} \\texttt{code} \\underline{u} \\sout{s}")).toEqual([
      paragraph('Intro', { style: 'h1' }),
      {
        type: 'paragraph',
        style: 'normal',
        runs: [{ text: 'Some ' }, { text: 'bold', bold: true }, { text: ' and ' }, { text: 'it', italic: true }, { text: ' text, same paragraph. 50% “quoted” — dash here.' }],
      },
      paragraph('Next', { style: 'h2' }),
      { type: 'paragraph', style: 'normal', runs: [{ text: 'code', code: true }, { text: ' ' }, { text: 'u', underline: true }, { text: ' ' }, { text: 's', strike: true }] },
    ]);
  });

  it('reads lists, tables, links, quotes, verbatim and math', () => {
    const blocks = read(`\\begin{itemize}
  \\item one
  \\begin{enumerate}\\item sub\\end{enumerate}
  \\item two
\\end{itemize}
\\begin{tabular}{|l|c|}\\hline a & \\textbf{b} \\\\ \\hline 1 & 2 \\\\ \\hline\\end{tabular}

See \\href{https://x.org}{site} and \\url{https://y.org}.

\\begin{quote}Wise words\\end{quote}
\\begin{verbatim}
x = {1}
\\end{verbatim}
Inline $a^2$ and \\(b\\).
\\begin{equation}\\label{eq:1} E = mc^2 \\end{equation}
\\[ \\int_0^1 x\\,dx \\]
\\begin{align} a &= b \\\\ c &= d \\end{align}`);
    expect(blocks).toEqual([
      paragraph('one', { list: { ordered: false, level: 0 } }),
      paragraph('sub', { list: { ordered: true, level: 1 } }),
      paragraph('two', { list: { ordered: false, level: 0 } }),
      {
        type: 'table',
        rows: [
          [{ blocks: [paragraph('a')] }, { blocks: [{ type: 'paragraph', style: 'normal', runs: [{ text: 'b', bold: true }] }] }],
          [{ blocks: [paragraph('1')] }, { blocks: [paragraph('2')] }],
        ],
      },
      { type: 'paragraph', style: 'normal', runs: [{ text: 'See ' }, { text: 'site', link: 'https://x.org' }, { text: ' and ' }, { text: 'https://y.org', link: 'https://y.org', code: true }, { text: '.' }] },
      paragraph('Wise words', { style: 'quote' }),
      paragraph('x = {1}', { style: 'code' }),
      { type: 'paragraph', style: 'normal', runs: [{ text: 'Inline ' }, { math: 'a^2' }, { text: ' and ' }, { math: 'b' }, { text: '.' }] },
      { type: 'paragraph', style: 'normal', id: 'eq:1', runs: [{ math: 'E = mc^2', display: true }, { seq: 'equation' }] }, // DOC-026: numbered
      { type: 'paragraph', style: 'normal', runs: [{ math: '\\int_0^1 x\\,dx', display: true }] },
      { type: 'paragraph', style: 'normal', runs: [{ math: '\\begin{aligned}a &= b \\\\ c &= d\\end{aligned}', display: true }, { seq: 'equation' }] },
    ] satisfies Block[]);
  });

  it('reads title/author and accents', () => {
    const doc = readLatex("\\title{Caf\\'e na\\\"ive}\\author{Ada}\\begin{document}\\'Etude \\c{c}a\\end{document}");
    expect(doc.meta).toEqual({ title: 'Café naïve', author: 'Ada' });
    expect(doc.blocks).toEqual([paragraph('Étude ça')]);
  });

  it('TEX-004 keeps unsupported constructs visible as source', () => {
    const blocks = read('Before \\weirdcommand[opt]{arg} after.\n\n\\begin{tikzpicture}\\draw (0,0) -- (1,1);\\end{tikzpicture}');
    expect(blocks).toEqual([
      paragraph('Before \\weirdcommand[opt]{arg} after.'),
      paragraph('\\begin{tikzpicture}\\draw (0,0) -- (1,1);\\end{tikzpicture}', { style: 'code' }),
    ]);
  });

  it('resolves \\includegraphics inside a ZIP project and detects .tex files', async () => {
    const bytes = zipSync({
      'paper/main.tex': strToU8('\\documentclass{article}\\begin{document}\\includegraphics[width=0.5\\linewidth]{fig/p}\\end{document}'),
      'paper/fig/p.png': PNG_1PX,
    });
    expect(detectFormat('paper.zip', bytes)).toBe('texzip');
    const doc = await readDocument('texzip', bytes);
    expect(doc.resources.size).toBe(1);
    expect(detectFormat('a.tex', strToU8('\\section{x}'))).toBe('tex');
  });

  it('exports plain .tex too', () => {
    const doc: RichDocument = { ...emptyDocument(), blocks: [paragraph('Hi')] };
    expect(strFromU8(writeDocument(doc, 'tex'))).toContain('Hi');
  });
});
