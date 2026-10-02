---
description: EARS requirements with MoSCoW priorities and roadmap milestones.
---

<!-- Generated from specs/spec.md by scripts/sync-requirements.mjs — edit the source. -->

# Requirements specification

- Status: Draft v1 (2026-10-01)
- Notation: [EARS](https://alistairmavin.com/ears/) (Easy Approach to Requirements Syntax)
- Prioritisation: MoSCoW — **M**ust / **S**hould / **C**ould / **W**on't (this time)
- Milestones: see the [roadmap](https://github.com/s-celles/progressive-web-office/blob/main/ROADMAP.md) (0.0.x = development phases, not releases)

EARS templates used:

| Type | Template |
|------|----------|
| Ubiquitous | The system shall &lt;response&gt;. |
| Event-driven | When &lt;trigger&gt;, the system shall &lt;response&gt;. |
| State-driven | While &lt;state&gt;, the system shall &lt;response&gt;. |
| Unwanted | If &lt;condition&gt;, then the system shall &lt;response&gt;. |
| Optional | Where &lt;feature&gt;, the system shall &lt;response&gt;. |

Each requirement has an ID referenced from tests (`describe('REQ-xxx ...')`).

## 1. Vision

A simple, privacy-friendly office suite that runs **entirely in the browser**
as an installable Progressive Web App, written in TypeScript. It opens, edits
and saves word-processing documents (Word `.docx`, OpenDocument `.odt`, Markdown `.md`
and MDZ packages — zipped Markdown with embedded assets),
spreadsheets (Excel `.xlsx`, OpenDocument `.ods`, `.csv`), presentations
(PowerPoint `.pptx`, OpenDocument `.odp`) and displays PDF files. No document ever leaves the device.

## 2. Platform & architecture (PLT)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| PLT-001 | M | 0.0.1 | The system shall be implemented in TypeScript with strict type checking enabled. |
| PLT-002 | M | 0.0.1 | The system shall process all documents client-side and shall not send document content to any server, except to a destination the user explicitly configured and invoked (git hosting, AI assistant, QRShare hand-off). |
| PLT-003 | M | 0.0.1 | The system shall be installable as a Progressive Web App (web app manifest + service worker). |
| PLT-004 | M | 0.0.1 | While the device is offline, the system shall start and provide all features of previously loaded versions. |
| PLT-005 | S | 0.0.6 | When a new version of the application is available, the system shall inform the user and offer to reload. |
| PLT-006 | S | 0.0.6 | Where the browser supports the File Handling API, the system shall register as a handler for supported file types and open launched files. |
| PLT-007 | M | 0.0.1 | The system shall work in the latest two versions of Chromium-based browsers, Firefox and Safari. |
| PLT-008 | S | 0.0.1 | The system shall apply a Content-Security-Policy that forbids inline scripts and remote script sources. |

## 3. File management (FILE)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| FILE-001 | M | 0.0.1 | When the user selects "Open", the system shall let the user pick a local file of a supported type. |
| FILE-002 | M | 0.0.1 | When the user drops a file onto the application window, the system shall open it. |
| FILE-003 | M | 0.0.1 | The system shall detect the document format from the file content (magic bytes / package mimetype), falling back to the file extension. |
| FILE-004 | M | 0.0.1 | If the user opens a file of an unsupported or corrupt format, then the system shall display an explanatory error message and keep the current state unchanged. |
| FILE-005 | M | 0.0.2 | When the user selects "Save", the system shall serialise the document in its original format and deliver it to the user (File System Access API where available, download otherwise). |
| FILE-006 | S | 0.0.2 | When the user selects "Save as" with a target format, the system shall convert the document to that format (docx ↔ odt ↔ md ↔ mdz, xlsx ↔ ods ↔ csv, pptx ↔ odp; PDF is saved as PDF). |
| FILE-007 | M | 0.0.2 | When the user selects "New document", "New spreadsheet" or "New presentation", the system shall create an empty document of that kind. |
| FILE-008 | S | 0.0.6 | The system shall keep a list of recently opened files in browser storage (IndexedDB) and let the user reopen them. |
| FILE-009 | S | 0.0.6 | When the user removes a recent file entry, the system shall delete its stored content. |
| FILE-010 | S | 0.0.2 | While a document has unsaved modifications, the system shall show a modified indicator and warn before the page is closed. |
| FILE-011 | C | 0.0.6 | The system shall autosave a draft of the open document to browser storage every 30 seconds while it has unsaved modifications. |
| FILE-012 | M | 0.0.1 | If a file larger than 50 MB is opened, then the system shall refuse it with an explanatory message. |
| FILE-016 | S | 0.0.14 | The system shall prefer open standards: new documents, spreadsheets and presentations shall be created in OpenDocument formats (`.odt`, `.ods`, `.odp`) by default, and the open format shall be offered first when saving; the user shall be able to choose Microsoft Office formats instead, and the choice shall persist. Opening and saving every supported format shall remain available. |

## 4. Word processing (DOC)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| DOC-001 | M | 0.0.2 | When a `.docx` file is opened, the system shall display its paragraphs, headings (levels 1–6), text formatting (bold, italic, underline, strikethrough), lists and tables. |
| DOC-002 | M | 0.0.2 | When an `.odt` file is opened, the system shall display the same features as DOC-001. |
| DOC-003 | M | 0.0.2 | The system shall let the user edit text in a WYSIWYG editor. |
| DOC-004 | M | 0.0.2 | The system shall provide toolbar commands and keyboard shortcuts for bold (Ctrl+B), italic (Ctrl+I), underline (Ctrl+U), undo (Ctrl+Z) and redo (Ctrl+Y / Ctrl+Shift+Z). |
| DOC-005 | M | 0.0.2 | The system shall let the user set the paragraph style (normal, heading 1–3) and toggle bulleted / numbered lists. |
| DOC-006 | M | 0.0.2 | When a text document is saved as `.docx`, the system shall produce a file that Microsoft Word and LibreOffice open without repair prompts. |
| DOC-007 | M | 0.0.2 | When a text document is saved as `.odt`, the system shall produce a valid ODF 1.2+ package (with uncompressed `mimetype` first entry). |
| DOC-008 | M | 0.0.2 | When content is pasted into the editor, the system shall sanitise it to the supported subset (no scripts, no event handlers, no remote resources). |
| DOC-009 | S | 0.0.2 | The system shall let the user set paragraph alignment (left, centre, right, justify). |
| DOC-010 | S | 0.0.2 | The system shall display the word and character count of the document. |
| DOC-011 | S | 0.0.2 | Round-tripping (open → save in the same format → open) shall preserve the features listed in DOC-001. |
| DOC-012 | C | 0.0.6 | When the user selects "Print / Export PDF", the system shall open the browser print dialog with a print-optimised layout. |
| DOC-013 | S | 0.0.2 | The system shall display and preserve embedded images of `.docx`, `.odt` and `.mdz` documents, and let the user insert an image from a local file. |
| DOC-015 | S | 0.0.2 | The system shall support hyperlinks (display, insert, preserve on save). |
| DOC-016 | S | 0.0.2 | The system shall support block quotes, preformatted code blocks and inline code. |
| DOC-017 | S | 0.0.14 | The system shall let the user view and edit the document properties (title, author, date, subject, description, keywords, language, licence) and shall read and write them in every format that supports them: OOXML core properties, ODF `meta.xml`, MDZ manifest, Markdown front matter and LaTeX (`\title`, `\author`, `\date`, hyperref PDF properties). |
| DOC-018 | M | 0.0.14 | The text editor shall edit a structured document model through transactions (ProseMirror) rather than browser editing commands, with its own undo history, Markdown-style shortcuts (`# `, `- `, `1. `, `> `, ` ``` `), list indentation with Tab / Shift+Tab, and paste from other applications limited to the supported content; converting between the editor and the document model shall be lossless. |
| DOC-019 | S | 0.0.14 | The text editor shall find text (Ctrl+F) with match-case, whole-word and regular-expression options, highlight every match with a count, move between matches, and replace the current or all matches (Ctrl+H) in one undoable step, keeping the surrounding formatting. |
| DOC-020 | M | 0.0.14 | The text editor shall set the font, size, text colour and highlight of the selection, a paragraph's left and first-line indents, spacing before and after and line spacing, and clear direct formatting; these shall be kept in DOCX and ODT (direct formatting only, not the values that come from the paragraph style). |
| DOC-021 | M | 0.0.14 | The text editor shall insert page breaks (Ctrl+Enter), distinct from horizontal lines, that start a new page when printing and are kept in DOCX (including breaks inside a paragraph and "page break before"), ODT, Markdown (`\newpage`) and LaTeX. |
| DOC-022 | M | 0.0.14 | The text editor shall insert footnotes (Ctrl+Alt+F) at the cursor, numbered automatically in reading order, listed under the page and printed at the end, edited by clicking the number (inline Markdown: formatting, links, equations, several paragraphs); they shall be kept in DOCX (footnotes part), ODT (text:note), Markdown (`[^n]`, also `^[…]` on import) and LaTeX (`\footnote`). |
| DOC-023 | S | 0.0.14 | The text editor shall insert a table of contents generated from Heading 1–3, updated as headings change, whose entries go to their heading; it shall be kept as an updatable table of contents in DOCX (TOC field recomputed by Word on opening) and ODT, as `[[_TOC_]]` in Markdown (also `[TOC]` on import) and `\tableofcontents` in LaTeX. |
| DOC-024 | S | 0.0.14 | The text editor shall define a header and a footer, each with left, centre and right zones that may contain the page number, page count, title and date; they shall be shown around the page while editing, printed on every page, and kept in DOCX (header/footer parts with fields), ODT (master page), LaTeX (fancyhdr) and Markdown (front matter). |
| DOC-025 | S | 0.0.14 | While the cursor is in a table, the text editor shall offer commands to insert and delete rows and columns, merge and split cells, toggle a header row and delete the table; merged cells and the header row shall be kept in DOCX (gridSpan, vMerge, tblHeader), ODT (spanned and covered cells, header rows), HTML and LaTeX (\multicolumn, \multirow), and Markdown shall keep the header row. |
| DOC-026 | S | 0.0.14 | The text editor shall number figures, tables and equations in document order through captions, and insert cross-references to them and to headings that follow renumbering and show `??` when their target is missing; numbers and references shall be kept in DOCX (SEQ and REF fields, bookmarks), ODT (sequences, bookmark references), LaTeX (\captionof, equation, \label, \ref, \eqref, \nameref) and Markdown (anchors, links, \tag), and read back from these formats. |
| DOC-027 | S | 0.0.14 | The text editor shall keep a bibliography of sources imported from BibTeX, insert citations of one or more sources with an optional page, numbered in citation order or by author and year, and a list of the cited references that follows the citations; sources and citations shall be kept in DOCX (Word sources, CITATION and BIBLIOGRAPHY fields), ODT (bibliography marks and index), LaTeX (\cite, BibTeX file) and Markdown (pandoc citations and references), and read back from these formats and from Zotero and Mendeley citations in Word files. |
| DOC-018 | S | 0.0.14 | When a Markdown file starts with a YAML front matter, the system shall read the document properties from it and keep the keys it does not interpret unchanged on save; when saving Markdown with properties, it shall write them as front matter. |
| DOC-014 | W | — | Track changes, comments, footnotes, headers/footers editing and mail merge. |

## 4b. Markdown & MDZ packages (MD)

MDZ is the ZIP-based Markdown package format specified by the
[wflixu/mdz](https://github.com/wflixu/mdz) project (spec v1.1.0, MIT):
`index.md` + `manifest.json` + `assets/{images,videos,audio,files}/`,
extension `.mdz`, MIME type `application/x-mdz`. This project implements it
as a compatible producer/consumer and contributes a JSON Schema for the
manifest (`schemas/mdz-manifest-1.schema.json`), to be proposed upstream.

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| MD-001 | M | 0.0.2 | When a `.md` / `.markdown` file is opened, the system shall parse it as CommonMark with GFM tables and strikethrough, and display it in the WYSIWYG editor. |
| MD-002 | M | 0.0.2 | When a document is saved as `.md`, the system shall serialise headings, emphasis, strikethrough, inline code, links, images, lists (nested), block quotes, code blocks and tables as Markdown. |
| MD-003 | M | 0.0.2 | The Markdown parser shall treat raw HTML as text, so that opening a Markdown file never executes script. |
| MD-004 | M | 0.0.2 | The system shall read and write MDZ packages conforming to wflixu/mdz specification v1.1.0: a ZIP archive with a UTF-8 `index.md`, a `manifest.json` and an optional `assets/` folder. |
| MD-005 | M | 0.0.2 | When saving MDZ, the system shall write a manifest with `version` "1.1.0", `title`, `date` (ISO 8601), `filename` and one `assets` entry (`id`, `path`, `type`, optional `alt`) per embedded asset, valid against the project JSON Schema. |
| MD-006 | M | 0.0.2 | If an MDZ package has no `index.md`, a missing or malformed `manifest.json`, a manifest invalid against the schema, or a major `version` other than 1, then the system shall refuse it with an explanatory message. |
| MD-007 | M | 0.0.2 | If an MDZ path (manifest asset path or link target) is absolute, contains `..` segments or a backslash, then the system shall not resolve it (zip-slip protection). |
| MD-008 | M | 0.0.2 | When a document with images is saved as MDZ, the system shall store each distinct image once under `assets/images/` (content-addressed file name) and reference it with a `./assets/images/...` relative link. |
| MD-009 | S | 0.0.2 | When an MDZ package is re-saved, the system shall preserve unknown manifest fields (including `x-*` extensions), `author`, and asset files it does not display (videos, audio, files). |
| MD-010 | S | 0.0.2 | Where an MDZ manifest uses a newer 1.x version or unknown fields, the system shall open it and ignore the unknown fields. |
| MD-011 | C | — | Import of TextBundle (`.textpack`) packages. |
| MD-012 | S | 0.0.2 | The documentation shall describe MDZ support, its compatibility with wflixu/mdz and publish the JSON Schema. |
| MD-014 | M | 0.0.2 | When a plain ZIP archive containing Markdown file(s) and images but no MDZ manifest is opened, the system shall import it as a document and resolve relative image links inside the archive. |
| MD-016 | M | 0.0.2 | When such a ZIP contains exactly one Markdown file, the system shall use it as the entry document. |
| MD-017 | M | 0.0.2 | When such a ZIP contains several Markdown files, the system shall ask the user to choose the entry document, pre-selecting `index.md`, else `README.md`, else the first file in alphabetical order; if the user cancels, then the system shall not open the archive. |
| MD-015 | M | 0.0.2 | When an imported plain ZIP is saved, the system shall produce a conforming `.mdz` package (generated `manifest.json`, `index.md`, images moved to `assets/images/` with rewritten links). |
| MD-013 | C | — | Upstream collaboration with wflixu/mdz: propose the JSON Schema, an optional uncompressed `mimetype` first entry for magic-byte detection, and path-safety rules. |

## 4c. Mathematical equations (MATH)

Equation editing uses [MathLive](https://cortexjs.io/mathlive/) (MIT), whose
`<math-field>` web component offers WYSIWYG editing of LaTeX with a virtual
keyboard. Equations are stored as LaTeX in the document model.

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| MATH-001 | M | 0.0.7 | The system shall let the user insert an inline or display equation in a text document and edit it in a MathLive math field (keyboard, virtual keyboard and LaTeX input). |
| MATH-002 | M | 0.0.7 | The system shall render equations in the document view without network access (fonts bundled with the application). |
| MATH-003 | M | 0.0.7 | When a document is saved as Markdown or MDZ, the system shall write inline equations as `$…$` and display equations as `$$…$$`, and parse them back when reading. |
| MATH-004 | M | 0.0.7 | When a document is saved as ODT, the system shall embed each equation as a MathML formula object (with the LaTeX source as annotation), and read MathML formula objects back. |
| MATH-005 | M | 0.0.7 | When a document is saved as DOCX, the system shall write equations as Office Math (OMML) for the supported subset (fractions, scripts, roots, sums/integrals, matrices, Greek letters, operators) and read OMML back into LaTeX. |
| MATH-006 | C | — | Equation support in presentations and spreadsheet cell comments. |
| MATH-007 | W | — | Computer-algebra features (solving, plotting). |

## 4d. Diagrams (DIAG)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| DIAG-001 | M | 0.0.14 | The system shall let the user insert a Mermaid diagram in a text document and edit its source in a dialog with a live preview and starter templates (flowchart, sequence, class, state, entity-relationship, Gantt, pie, mind map). |
| DIAG-002 | M | 0.0.14 | The system shall render diagrams in the document view, in print and in exports without network access, loading the diagram engine only when a document contains or inserts a diagram; when the source is invalid, the system shall show the error and keep the source unchanged. |
| DIAG-003 | M | 0.0.14 | The system shall render diagrams in Mermaid's strict security mode, as images, so that diagram source cannot run scripts or load remote content. |
| DIAG-004 | M | 0.0.14 | When a document is saved as Markdown or MDZ, the system shall write each diagram as a fenced ```` ```mermaid ```` code block, and parse such blocks back into diagrams when reading. |
| DIAG-005 | M | 0.0.14 | When a document is saved as DOCX or ODT, the system shall embed each diagram as a PNG picture whose title is `mermaid` and whose description holds the Mermaid source, and read such pictures back as editable diagrams. |
| DIAG-006 | S | 0.0.14 | When a document is saved as LaTeX, the system shall include each diagram as a PNG graphic preceded by its Mermaid source in comments. |
| DIAG-007 | S | 0.0.14 | When a diagram cannot be rendered while saving, the system shall write its source as text so that no content is lost. |
| DIAG-008 | C | — | Other diagram languages (PlantUML, Graphviz) and freehand diagrams (draw.io). |

## 4e. Code cells (CODE)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| CODE-001 | M | 0.0.14 | The system shall let the user insert Python or JavaScript code cells in a text document and edit their code. |
| CODE-002 | M | 0.0.14 | When the user asks to run a cell (or all cells), the system shall run it with Python (Pyodide, served by the application and cached for offline use after its first use) or JavaScript; Python cells of a document shall share one interpreter. |
| CODE-003 | M | 0.0.14 | The system shall run code only in an isolated sandbox (opaque-origin iframe and worker) that has no network access and no access to the application's page, storage, keys or other documents, and shall let the user stop a running cell at any time. |
| CODE-004 | M | 0.0.14 | Before the first run in an open document, the system shall explain what running the code implies and ask for confirmation; code shall never run when a document is opened. |
| CODE-005 | M | 0.0.14 | The system shall keep the last output of each cell (printed text, errors, matplotlib figures) in the document and display it without running the code again; changing the code shall clear the stale output. |
| CODE-006 | M | 0.0.14 | When a document is saved as Markdown or MDZ, the system shall write each cell as a fenced block with the `{run}` attribute (e.g. ```` ```python {run} ````), followed by its output as a ```` ```text {output} ```` block and its figures as images titled `output`, and read them back. |
| CODE-007 | S | 0.0.14 | When a document is saved as DOCX, ODT or LaTeX, the system shall write each cell as its code followed by its last output (text and pictures). |
| CODE-008 | S | 0.0.14 | Where Python code imports packages that are not in the standard library (numpy, matplotlib…), the system shall download them from the Pyodide CDN on first use, verify them against the hashes of the bundled lock file, and cache them for offline use. |
| CODE-009 | C | — | Other languages (R, Julia…), interactive widgets, and sharing data between cells and the document's tables. |
| CODE-010 | W | — | Running code automatically when a document is opened. |

## 5. Spreadsheets (SHEET)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| SHEET-001 | M | 0.0.3 | When an `.xlsx` file is opened, the system shall display every worksheet with its cell values (text, numbers, booleans) and formulas. |
| SHEET-002 | M | 0.0.3 | When an `.ods` file is opened, the system shall display the same content as SHEET-001. |
| SHEET-003 | M | 0.0.3 | When a `.csv` file is opened, the system shall detect the delimiter (comma, semicolon, tab) and display a single worksheet. |
| SHEET-004 | M | 0.0.3 | The system shall let the user select a cell and edit its content via the cell or a formula bar. |
| SHEET-005 | M | 0.0.3 | The system shall let the user navigate cells with arrow keys, Tab, Shift+Tab and Enter. |
| SHEET-006 | M | 0.0.3 | When a cell content starts with `=`, the system shall evaluate it as a formula supporting arithmetic (+ − × ÷ ^ unary −, parentheses), comparison operators, `&` concatenation, cell references, ranges and the functions SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, IF, ROUND, ABS, AND, OR, NOT, CONCAT, LEN, UPPER, LOWER. |
| SHEET-007 | M | 0.0.3 | When a cell changes, the system shall recompute all dependent formulas. |
| SHEET-008 | M | 0.0.3 | If a formula is invalid, refers to itself (directly or indirectly) or divides by zero, then the system shall display an error value (`#ERROR!`, `#CYCLE!`, `#DIV/0!`, `#NAME?`, `#VALUE!`) instead of failing. |
| SHEET-009 | M | 0.0.3 | When a spreadsheet is saved as `.xlsx`, `.ods` or `.csv`, the system shall write values and formulas in that format. |
| SHEET-010 | S | 0.0.3 | The system shall let the user add, rename and switch worksheets. |
| SHEET-011 | S | 0.0.3 | The system shall let the user insert and delete rows and columns. |
| SHEET-012 | S | 0.0.3 | Where formulas are written to `.ods`, the system shall translate references to OpenFormula syntax (`of:=SUM([.A1:.B2])`) and back when reading. |
| SHEET-013 | C | 0.0.6 | The system shall support copy / paste of cell ranges as tab-separated text. |
| SHEET-014 | C | — | Cell formatting (fonts, colours, number formats, borders). |
| SHEET-015 | W | — | Pivot tables, macros. |
| SHEET-020 | M | 0.0.14 | The system shall let the user insert column, bar, line, pie and scatter charts drawn from a range of a sheet (first column: categories or x values; other columns: series; optional header row with series names), proposing the selection or the block of data around the active cell; charts shall update when the data changes and follow inserted or deleted rows and columns. |
| SHEET-021 | M | 0.0.14 | The system shall draw charts as accessible SVG (title, legend for several series, value tooltips) with a colour-blind-checked categorical palette, and let the user move, resize, edit and delete them with the mouse or the keyboard. |
| SHEET-022 | M | 0.0.14 | When a workbook is saved as XLSX or ODS, the system shall write its charts as native charts (DrawingML chart parts; ODF chart objects anchored in their cell) that Excel and LibreOffice display, and read them back. |
| SHEET-023 | S | 0.0.14 | The system shall let the user copy a chart as a PNG image (to paste it into a document or a slide), and print charts with their sheet. |

## 6. Presentations (PRES)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| PRES-001 | M | 0.0.5 | When a `.pptx` file is opened, the system shall display every slide with its text boxes (positioned and sized), basic shapes (rectangle, ellipse) with solid fills, and images. |
| PRES-002 | M | 0.0.5 | When an `.odp` file is opened, the system shall display the same content as PRES-001. |
| PRES-003 | M | 0.0.5 | Where a `.pptx` placeholder shape has no explicit position, the system shall inherit position and size from the slide layout, then from the slide master. |
| PRES-004 | M | 0.0.5 | The system shall display slide thumbnails and let the user select the current slide. |
| PRES-005 | M | 0.0.5 | The system shall let the user edit the text of text boxes and shapes with bold / italic / underline formatting. |
| PRES-006 | M | 0.0.5 | The system shall let the user add, duplicate, delete and reorder slides, and add text boxes. |
| PRES-007 | M | 0.0.5 | When the user starts the slideshow, the system shall display slides full screen, advance with →, Space, PageDown or click, go back with ←, PageUp, and exit with Escape. |
| PRES-008 | M | 0.0.5 | When a presentation is saved as `.pptx` or `.odp`, the system shall write slides, shapes, text and images in that format. |
| PRES-009 | S | 0.0.5 | The system shall let the user move and resize shapes with the pointer, and delete the selected shape. |
| PRES-010 | S | 0.0.5 | The system shall preserve slide speaker notes text when reading and writing. |
| PRES-011 | C | — | Slide transitions and animations. |
| PRES-012 | W | — | Embedded video/audio, SmartArt, charts editing, legacy `.ppt`. |

## 7. PDF (PDF)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| PDF-001 | M | 0.0.4 | When a `.pdf` file is opened, the system shall render its pages in the browser. |
| PDF-002 | M | 0.0.4 | The system shall let the user navigate pages (next, previous, go to page) and display "page n / total". |
| PDF-003 | M | 0.0.4 | The system shall let the user zoom in, zoom out and fit to width. |
| PDF-004 | M | 0.0.4 | The PDF renderer shall run with JavaScript evaluation in PDF content disabled. |
| PDF-005 | S | 0.0.4 | The system shall render a selectable text layer so that text can be copied. |
| PDF-006 | C | — | Text search inside the PDF. |
| PDF-008 | M | 0.0.4 | When a PDF containing AcroForm fields is opened, the system shall display editable controls for its text fields, checkboxes, radio groups and drop-down / list fields over the rendered pages. |
| PDF-009 | M | 0.0.4 | When the user saves a PDF with filled fields, the system shall write the field values into the PDF (and regenerate their appearances) so that other PDF readers display them. |
| PDF-010 | S | 0.0.4 | The system shall offer, next to the regular save that keeps form fields editable, a "Flattened PDF" save that writes a copy in which the filled fields are part of the page and can no longer be edited, without changing the open document. |
| PDF-011 | M | 0.0.4 | The system shall let the user create a handwritten signature by drawing it (mouse, touch or stylus) or importing an image, and place, move and resize it on any page. |
| PDF-012 | M | 0.0.4 | When the user saves a PDF with placed signatures, the system shall embed them as images at the chosen positions. |
| PDF-013 | S | 0.0.4 | The system shall let the user add free text (e.g. a date or name) anywhere on a page. |
| PDF-014 | C | — | The system shall remember the user's signature in browser storage, only after explicit consent. |
| PDF-015 | M | 0.0.4 | If a PDF is encrypted or uses XFA forms, then the system shall display it read-only and explain why it cannot be filled. |
| PDF-007 | W | — | General PDF content editing; cryptographic digital signatures (PAdES / certificates). |

## 8. User interface & accessibility (UI)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| UI-001 | M | 0.0.1 | The system shall display a start screen offering "New document", "New spreadsheet", "New presentation", "Open file" and (when available) recent files. |
| UI-002 | M | 0.0.1 | The system shall be operable with the keyboard only, with visible focus indicators. |
| UI-003 | M | 0.0.1 | Every interactive control shall have an accessible name. |
| UI-004 | S | 0.0.1 | The system shall follow the operating system light / dark colour scheme preference. |
| UI-005 | S | 0.0.1 | The layout shall remain usable from 360 px wide screens to desktop screens. |
| UI-006 | S | 0.0.1 | While an operation takes longer than 300 ms, the system shall show a progress indication. |
| UI-007 | M | 0.0.8 | The user interface shall be available in English, French and Simplified Chinese. |
| UI-008 | M | 0.0.8 | When the application starts, the system shall select the interface language from the browser preferences (fallback English) and let the user change it; the choice shall persist. |
| UI-009 | M | 0.0.8 | Every user-visible string shall come from a translation catalog; a test shall fail if a key is missing in any language. |
| UI-010 | S | 0.0.8 | The system shall set the `lang` attribute of the document to the selected language. |
| UI-011 | S | 0.0.14 | The system shall let the user choose a light, dark or system theme (following the operating system preference by default); the choice shall persist and apply to native controls. Document pages and slides shall stay light, as on paper. |
| UI-012 | S | 0.0.14 | The system shall offer an About window, from the toolbar and the start screen, showing the version, the git commit and date of the build, the licence, whether the app is installed and works offline, a QR code of the app address to open it on another device (shown full screen when activated), and links to the documentation, source code, changelog, requirements and problem reports; it shall copy these details for a problem report. |
| UI-013 | S | 0.0.14 | The system shall display its version and the short git commit of the build (e.g. `v0.0.13 (6cae6fc)`) in the toolbar and on the start screen, as QRShare does; activating it shall open the About window. |

## 9. Quality (QA)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| QA-001 | M | 0.0.1 | Every format reader/writer and the formula engine shall be covered by unit tests written before the implementation (TDD). |
| QA-002 | M | 0.0.1 | The project shall provide `just` recipes for install, dev, test, build, docs and the full check. |
| QA-003 | M | 0.0.1 | Documentation shall build without warnings and produce `llms.txt` and `llms-full.txt`. |
| QA-004 | S | 0.0.4 | An end-to-end smoke test shall open each supported format in a real browser. |
| QA-005 | M | 0.0.1 | The project shall follow Semantic Versioning and document notable changes in `CHANGELOG.md` (Keep a Changelog). |

## 9b. Printing (PRINT)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| PRINT-001 | M | 0.0.9 | When the user selects "Print", the system shall show a print preview of the document with the chosen page settings before opening the browser print dialog. |
| PRINT-002 | M | 0.0.9 | The system shall let the user choose the paper size (A4, Letter, A3, A5), orientation and margins; the choice shall persist. |
| PRINT-003 | M | 0.0.9 | Text documents shall print paginated with headings kept with the following paragraph, tables and images not split when possible, and rendered equations. |
| PRINT-004 | M | 0.0.9 | Spreadsheets shall print the used range of the current sheet (or of all sheets) with optional grid lines and row/column headings, repeating column headings on every page. |
| PRINT-005 | M | 0.0.9 | Presentations shall print one slide per page (landscape), or several slides per page as handouts, optionally with speaker notes. |
| PRINT-006 | S | 0.0.9 | Printing a PDF shall print the PDF with the filled fields, signatures and texts added by the user. |
| PRINT-007 | S | 0.0.9 | The print preview shall offer "Save as PDF" guidance through the browser dialog (no server). |

## 9c. LaTeX (TEX)

LaTeX formulas are a first-class feature (MATH requirements are raised from
Should to **Must**).

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| TEX-001 | M | 0.0.10 | When a text document is exported as `.tex`, the system shall produce a compilable LaTeX `article` (UTF-8, `amsmath`, `graphicx`, `hyperref`, `ulem`) with sections, formatting, lists, tables, links, quotes, verbatim code and equations (`$…$`, `\[…\]`). |
| TEX-002 | M | 0.0.10 | When a document containing images is exported to LaTeX, the system shall produce a ZIP project (`main.tex` + `images/`). |
| TEX-003 | M | 0.0.10 | When a `.tex` file (or a ZIP containing one) is opened, the system shall import the supported subset: sectioning, `\textbf`/`\textit`/`\emph`/`\underline`/`\sout`/`\texttt`, `itemize`/`enumerate`, `tabular`, `\href`/`\url`, `quote`, `verbatim`, `\includegraphics`, inline and display math (`$`, `$$`, `\(\)`, `\[\]`, `equation`, `align`), and `\title`/`\author`. |
| TEX-004 | M | 0.0.10 | If a LaTeX construct is not supported on import, then the system shall keep its source text visible instead of dropping it. |
| TEX-005 | M | 0.0.10 | The user shall be able to type `$…$` in the document editor to create an inline equation. |
| TEX-006 | S | 0.0.10 | Spreadsheet cells and presentation text boxes shall support LaTeX equations (`$…$`) rendered with MathLive. |

## 9d. Git repositories (GIT)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| GIT-001 | M | 0.0.11 | The system shall let the user connect GitHub (github.com or Enterprise API URL) and GitLab (gitlab.com or self-hosted URL) accounts with a personal access token stored only in this browser. |
| GIT-002 | M | 0.0.11 | The system shall let the user browse repositories, branches and folders and open any supported file. |
| GIT-003 | M | 0.0.11 | When a document opened from a repository is saved, the system shall commit it to the same path and branch with a user-editable commit message (default: conventional commit). |
| GIT-004 | M | 0.0.11 | If the file changed in the repository since it was opened, then the system shall refuse to overwrite it and offer to save on a new branch or as a copy. |
| GIT-005 | S | 0.0.11 | The system shall let the user save a new document to a chosen repository path, optionally on a new branch. |
| GIT-006 | S | 0.0.11 | The token shall never be written to documents, logs or exported files, and the user shall be able to forget it. |
| GIT-007 | C | — | Pull/merge request creation from the editor. |

## 9e. Device-to-device exchange with QRShare (SHARE)

[QRShare](https://github.com/s-celles/QRShare) (AGPL-3.0) transfers files
between devices through animated QR codes (air-gapped) or WebRTC. Integration
is done at application level (URLs and Web Share). Both projects are licensed
under the GNU AGPL-3.0 or later, so QRShare code may be reused if a native
integration is ever needed.

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| SHARE-001 | M | 0.0.12 | When the user chooses "Send to another device", the system shall hand the current file (saved in its format) to QRShare: through the Web Share API when available (QRShare is a share target), otherwise by downloading it and opening QRShare's send screen. |
| SHARE-002 | M | 0.0.12 | Where the document is text and small enough, the system shall open QRShare's `#/send?data=…&policy=…` route directly. |
| SHARE-003 | M | 0.0.12 | The system shall register as a Web Share Target for supported files, so that files received in QRShare (or any app) can be opened directly in Progressive Web Office. |
| SHARE-004 | M | 0.0.12 | The system shall let the user choose the transfer policy (air-gapped only, prefer air-gapped, any) and the QRShare URL. |
| SHARE-005 | S | 0.0.12 | When the user chooses "Receive from another device", the system shall open QRShare's receive screen. |
| SHARE-007 | S | 0.0.14 | When a document that is not small text is sent to another device, the system shall hand the file to QRShare in the browser (app handoff protocol v1, `postMessage`, posted only to the configured QRShare origin) without downloading it; if QRShare does not answer, then the system shall fall back to a download and QRShare's "Prepare a transfer" screen. |
| SHARE-008 | S | 0.0.14 | When the user receives from another device, the system shall give QRShare a return address so that a received file can be opened directly in Progressive Web Office, accepting files only from the configured QRShare origin. |
| SHARE-009 | S | 0.0.14 | The system shall build a link that contains the open document itself (text documents as Markdown, other documents in their format, compressed and base64url-encoded in the URL fragment), let the user copy it, and warn when it is long enough to be cut by some apps. |
| SHARE-010 | S | 0.0.14 | When the application is opened with such a link, the system shall rebuild and open the document — the fragment is never sent to a server — remove the fragment from the address, and report a damaged link. |
| SHARE-006 | C | — | Native, embedded implementation of the QRShare frame protocol (licences are compatible: both AGPL-3.0-or-later). |

## 9f. AI assistant and agent integration (AI)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| AI-001 | M | 0.0.13 | Where the user has configured an AI provider, the system shall provide an assistant panel that can read and modify the open document through tools (documents, spreadsheets, presentations). |
| AI-002 | M | 0.0.13 | The system shall ask for explicit consent before sending any document content to the AI provider, and display which provider and model are used. |
| AI-003 | M | 0.0.13 | Every change made by the assistant shall be undoable and visible (the assistant reports each tool action). |
| AI-004 | M | 0.0.13 | The API key shall be stored only in this browser and only if the user chooses so; it shall never be sent anywhere but to the provider API. |
| AI-005 | S | 0.0.13 | The assistant shall be able to write LaTeX equations, spreadsheet formulas and slide content. |
| AI-006 | S | 0.0.13 | Where the browser exposes an agent tool API (WebMCP `navigator.modelContext`), the system shall register the same document tools so that external AI agents can drive the application, with user confirmation for modifications. |
| AI-007 | M | 0.0.14 | The system shall let the user choose the AI provider of the assistant — Anthropic (Claude), OpenAI, Mistral AI, Albert (French State), a local Ollama server, or any server offering the OpenAI chat completions API — with its own key, model and (for local and custom servers) API address, kept per provider; local servers on `localhost` shall be reachable over HTTP. |
| AI-008 | M | 0.0.14 | The system shall give every provider the same document tools, confirmations and undo, ask consent again when the provider, address or model changes, and start a new conversation when the provider changes. |
| AI-009 | C | — | Several assistants in one conversation (e.g. one model drafts, another reviews). |

## 9g. Grist (GRIST)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| GRIST-001 | M | 0.0.14 | The system shall let the user add Grist accounts (server address and API key), check them when added, store them only in this browser, and forget them. |
| GRIST-002 | M | 0.0.14 | The system shall let the user browse the team sites and documents of a Grist account and open a document as a workbook: one sheet per table, the column labels in the first row, the record ids in the first column, formula columns with their computed values and dates as dates. |
| GRIST-003 | M | 0.0.14 | When the user saves a workbook opened from Grist, the system shall send only the changes: changed cells of editable columns, new rows (without an id), and — after confirmation — deleted rows; it shall then reload the document so that new rows get their ids and formulas their values. |
| GRIST-004 | M | 0.0.14 | The system shall not write formula columns, the id column, or columns of complex types (references, lists, attachments), which are shown as text. |
| GRIST-005 | M | 0.0.14 | If the Grist server cannot be reached or refuses a request, the system shall say whether the address/HTTPS/CORS setup or the API key is the likely cause, and link to the server setup guide. |
| GRIST-006 | C | — | Python code cells reading Grist tables; writing documents of the text editor to Grist. |

## 9h. Cloud storage: Nextcloud and WebDAV (DAV)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| DAV-001 | M | 0.0.14 | The system shall let the user add cloud accounts — a Nextcloud / ownCloud server address with user name and app password, or the full address of any WebDAV server — check them when added, store them only in this browser, and forget them. |
| DAV-002 | M | 0.0.14 | The system shall let the user browse the folders of a cloud account and open any supported file. |
| DAV-003 | M | 0.0.14 | When a document opened from the cloud is saved, the system shall write it back to the same file; the user shall also be able to save any open document to a chosen cloud folder and file name, the extension choosing the format. |
| DAV-004 | M | 0.0.14 | The system shall never overwrite a file that changed on the server since it was read, nor an existing file when saving a new one (conditional requests with ETags); it shall offer to save a copy next to it (default) or to replace the file. |
| DAV-005 | M | 0.0.14 | If the server cannot be reached or refuses the credentials, the system shall say whether the address/HTTPS/CORS setup or the credentials are the likely cause, and link to the server setup guide. |
| DAV-006 | C | — | Nextcloud login flow (no app password to copy), sharing links, and a recent-files list per account. |

## 9i. Real-time collaboration (COLLAB)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| COLLAB-001 | M | 0.0.14 | The system shall let the user start a real-time session on an open text document or spreadsheet and invite others with a link carrying a random room name and secret; opening the link shall join the session. The document shall travel directly between browsers (WebRTC, end-to-end encrypted), public Nostr relays only introducing the browsers to each other, with no server storing the document. |
| COLLAB-002 | M | 0.0.14 | While in a session, the system shall share every edit with the other participants within a second; concurrent edits of different cells or paragraphs shall all be kept, and every participant shall converge to the same content. A participant who joins late or comes back online shall receive what they missed. |
| COLLAB-003 | M | 0.0.14 | The system shall show who is in the session — each participant with a friendly compound name (e.g. "Swift Crimson Falcon") and a matching colour, which the user can change — and where each one is working (selected cell, current paragraph). |
| COLLAB-004 | M | 0.0.14 | The system shall let any participant save named versions, shared with everyone and kept with their author and date, and restore one for everyone as a new edit, after saving the current state as a version. |
| COLLAB-005 | M | 0.0.14 | Each participant shall keep the session's document and version history on their device (IndexedDB), so that reloading the page rejoins the session with them, even when nobody else is online. |
| COLLAB-006 | M | 0.0.14 | The collaboration protocol, history and presence shall come from the `@scelles/collab` package, shared with QRShare (no duplicated implementation). |
| COLLAB-007 | S | — | Collaboration on presentations, comments and suggested changes (track changes), and a character-level text merge with remote carets. |

## 10. Out of scope (Won't, this time)

- A collaboration server, user accounts, or storage of documents on a server we operate.
- Legacy binary formats (`.doc`, `.xls`).
