---
description: Import and export LaTeX documents and projects; supported LaTeX subset; `$…$` equations everywhere.
---

# LaTeX

Progressive Web Office reads and writes LaTeX, so a document can move between
the editor and a TeX distribution (or an online LaTeX editor) without retyping.

## Export

Choose **LaTeX (.tex)** or **LaTeX project (.zip)** in the *Save as* list.

- **`.tex`** — a single, compilable `article`. Use it for documents without
  pictures.
- **LaTeX project (`.zip`)** — `main.tex` plus an `images/` folder holding
  every picture referenced by `\includegraphics`.

The preamble works with pdfLaTeX, XeLaTeX and LuaLaTeX (`iftex` selects
`inputenc`/`fontenc` or `fontspec`). When the document contains Chinese,
Japanese or Korean text, `xeCJK` is loaded: compile with XeLaTeX.

| Document element | LaTeX |
|------------------|-------|
| Title (document properties) | `\title{…}` + `\maketitle` |
| Heading 1 … 4 | `\section`, `\subsection`, `\subsubsection`, `\paragraph` |
| Bold, italic, underline, strike, code | `\textbf`, `\textit`, `\uline`, `\sout`, `\texttt` |
| Link | `\href{url}{text}` |
| Bulleted / numbered list | `itemize` / `enumerate` (nested) |
| Table | `tabular` with rules |
| Quote / code block | `quote` / `verbatim` |
| Centred / right-aligned paragraph | `center` / `flushright` |
| Inline / display equation | `$…$` / `\[…\]` |
| Picture | `\includegraphics[width=…\linewidth]{images/…}` |

## Import

Open a `.tex` file, or a `.zip` containing a LaTeX project. In a project, the
main file is the one with `\documentclass` (preferably `main.tex`);
`\input{…}` and `\include{…}` files are inlined and `\includegraphics`
pictures are found even when the extension is omitted.

Supported: sectioning commands (starred or not), `\textbf`, `\textit`,
`\emph`, `\underline`, `\sout`, `\texttt`, `\verb`, `itemize`, `enumerate`,
`description`, `tabular`, `\href`, `\url`, `quote`, `verbatim`,
`lstlisting`, `center`, `\includegraphics`, inline math (`$…$`, `\(…\)`),
display math (`$$…$$`, `\[…\]`, `equation`, `align`, `gather`…, labels
removed), `\title`, `\author`, accents (`\'e`, `\"i`, `\c{c}`…), TeX
ligatures (` `` `, `''`, `--`, `---`, `~`) and escaped characters.

Anything else is **kept as visible source text** (unknown commands inline,
unknown environments such as `tikzpicture` as code blocks), so nothing is
silently lost. Comments (`%`) are dropped.

## Equations outside text documents

Write `$…$` in a spreadsheet cell or a slide text box: the equation is
rendered with MathLive on screen, in slideshows and when printing. The cell or
text box still stores the LaTeX source, so files stay readable by other
applications. While a slide text box is being edited, its equations show as
`$…$` source.
