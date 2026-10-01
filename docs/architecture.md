---
description: Source layout and design of Progressive Web Office.
---

# Architecture

Progressive Web Office is a dependency-light TypeScript application built with Vite.
All parsing and serialisation is done in the browser.

```
src/
  core/       format detection, ZIP (fflate) and XML (DOMParser) helpers
  app/        application shell, DOM helpers, PWA integration
  storage/    file open/save
  document/   rich-text model, DOCX/ODT/Markdown/MDZ readers & writers,
              model <-> DOM bridge, WYSIWYG editor
  sheet/      workbook model, formula engine, XLSX/ODS/CSV readers & writers,
              virtualized grid editor
  slides/     presentation model, PPTX/ODP readers & writers, slide editor,
              slideshow
  pdf/        pdf.js viewer, form/signature saving (pdf-lib), signature pad
  math/       MathLive loader, equation dialog, MathML/OMML/LaTeX converters
schemas/      JSON Schemas (MDZ manifest)
e2e/          Playwright end-to-end tests
```

## Text documents

All text formats are converted to and from one **format-neutral model**
(`src/document/model.ts`): a list of blocks (paragraphs with a style,
alignment and optional list level; tables; rules) made of runs (text with
bold/italic/underline/strike/code/link flags, or images referencing
content-addressed resources).

```
.docx ─┐                         ┌─> .docx
.odt  ─┼─> RichDocument <──> DOM ┼─> .odt
.md   ─┤      (model)   editor   ├─> .md
.mdz  ─┘                         └─> .mdz
```

The editor is a `contenteditable` page. Its DOM is converted back to the model
by `domToBlocks()`, which only understands the supported subset — the same
function sanitises pasted HTML.

## Shell and views

`App` (`src/app/app.ts`) owns the header, the start screen, the status bar and
the open/save flow. Each document family is handled by an **editor view**
implementing the `EditorView` interface (`src/app/views.ts`). Views are loaded
with dynamic `import()` so that, for example, the PDF engine is only
downloaded when a PDF is opened.

## Format detection

`detectFormat()` inspects the content first:

1. `%PDF-` signature → PDF
2. ZIP signature → OpenDocument `mimetype` entry, MDZ layout
   (`index.md` + `manifest.json`) or OOXML `[Content_Types].xml`
3. otherwise the extension is used for text formats (`.csv`, `.tsv`, `.md`)

## Security

- No document content is sent over the network, except to the git hosting
  API the user explicitly connected (and commits to).
- A strict Content-Security-Policy is injected in production builds
  (no inline scripts, no remote scripts; HTTPS `fetch` only for user-chosen
  APIs).
- Git access tokens live in `localStorage` only, are sent only to their own
  API URL and are removed with **Forget**.
- The AI assistant sends document content to Anthropic only after explicit
  consent; its API key is used for the current session only (never stored)
  unless the user chooses to save it in the browser. The SDK is loaded lazily, only when the assistant is used.
- AI tools validate every model-provided input before running; WebMCP tool
  calls that modify a document need the user's approval.
- The UI is built with DOM APIs (no `innerHTML` with untrusted content).

## Spreadsheets

A workbook is a list of sheets holding **sparse** cells (`Map` keyed by
`row,col`). A cell stores a literal value and optionally a formula in Excel A1
syntax; ODS formulas are translated from/to OpenFormula on read/write.

The formula engine (`src/sheet/formula.ts`, `src/sheet/engine.ts`) tokenizes
and parses formulas into an AST, evaluates them lazily with a per-cell cache
(invalidated on edit) and detects circular references. Reference rewriting
(copy translation, row/column insertion and deletion) works on the token
stream so that string literals are never altered.

The grid only renders the visible rows (plus overscan) between two spacer
rows, so large sheets stay responsive.

## PDF

Rendering uses **pdf.js** (`pdfjs-dist`, legacy build for broader browser
support) in a Web Worker. A Vite plugin serves and emits pdf.js runtime assets
(CMaps, standard fonts, ICC profiles, WebAssembly decoders) under `pdfjs/` so
that nothing is fetched from a CDN.

Forms and signatures are handled by **pdf-lib** (`@pdfme/pdf-lib`, a
maintained fork): `inspectPdf()` lists AcroForm fields with their widget
rectangles in PDF coordinates; the viewer overlays HTML controls converted with
the pdf.js viewport. `applyEdits()` writes field values (regenerating
appearances), optional flattening, signature images and free text.

## Presentations

A presentation is a list of slides holding absolutely positioned **shapes**
(text, rectangle, ellipse, image) in CSS pixels. Text reuses the rich-text
paragraph model (with run font size and colour), so the same DOM bridge powers
in-place text editing.

The PPTX reader resolves placeholder geometry through the slide → layout →
master chain and theme colours; the writer emits a minimal package (one master,
one blank layout, a theme, and a notes master when needed). The ODP
reader/writer maps shapes to `draw:frame`/`draw:rect`/`draw:ellipse` with
deduplicated automatic styles.

## Equations

Equations are `MathRun`s holding LaTeX. MathLive is imported lazily — only
when a document contains or inserts an equation — and provides rendering, the
`<math-field>` editor and LaTeX → MathML conversion. `src/math/convert.ts`
converts MathML → OMML (Word) and OMML/MathML → LaTeX, so that the model stays
LaTeX-based while each format gets its native representation. Rendered
MathLive markup is sanitised before insertion (no links, scripts or event
handlers).
