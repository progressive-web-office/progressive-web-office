---
description: EARS requirements with MoSCoW priorities and roadmap milestones.
---

<!-- Generated from specs/spec.md by scripts/sync-requirements.mjs — edit the source. -->

::: v-pre
# Requirements specification

- Status: Draft v1 (2026-10-01)
- Notation: [EARS](https://alistairmavin.com/ears/) (Easy Approach to Requirements Syntax)
- Prioritisation: MoSCoW — **M**ust / **S**hould / **C**ould / **W**on't (this time)
- Milestones: see the [roadmap](https://github.com/s-celles/progressive-web-office/blob/main/ROADMAP.md) (0.0.x = development phases; 0.1.0 = first minor release)

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
| FILE-016 | S | 0.1.0 | The system shall prefer open standards: new documents, spreadsheets and presentations shall be created in OpenDocument formats (`.odt`, `.ods`, `.odp`) by default, and the open format shall be offered first when saving; the user shall be able to choose Microsoft Office formats instead, and the choice shall persist. Opening and saving every supported format shall remain available. |
| FOLDER-001 | S | 0.1.0 | When the user opens a local folder, the system shall list its documents by sub-folder in a side panel, open the one the user selects and, where the File System Access API is available, save it back into the folder (read-only elsewhere); the folder shall be offered again on the start screen, with a way to forget it; *Save as* shall write a new file chosen by the user, outside the folder. |
| FOLDER-002 | S | 0.1.0 | The system shall search a word in all the text documents of the open folder (Markdown, LaTeX, text, BibTeX, Word, OpenDocument), ignoring case and accents, list the documents with extracts, and open a result at its first match. |
| FILE-017 | S | 0.1.0 | When the user shows a document read-only, the system shall show it with a visible read-only banner, refuse edits and in-place saving, and offer to edit a copy; documents from read-only sources (read-only folder, shared link) shall open read-only. |
| FILE-018 | S | 0.1.0 | The system shall offer a gallery of templates and examples (letter, report, meeting minutes, exercise sheet, budget, grade book, invoice, talk, an example document showing the word processor's features, a lab report whose Python cells open with their output and figures already drawn, and a workbook of measurements with charts), in the interface language (English content for languages without a translation); a document created from a template shall be a new, untitled document in the preferred format. |
| FILE-019 | S | 0.1.0 | The system shall let the user save the open document as a template kept in the browser (IndexedDB), list these templates first in the gallery, start a new document from one, and delete them. |
| FILE-020 | S | 0.1.0 | The system shall open the template formats `.ott`, `.ots`, `.otp`, `.dotx`, `.xltx` and `.potx` as new, untitled documents not tied to the template's location (folder, server), and shall save the open document as a template file of its kind, with the template media type (ODF `mimetype` and manifest, OOXML main part content type). |
| FILE-021 | S | 0.2.0 | When the user opens a ZIP archive that is not a document (OpenDocument, Office Open XML, MDZ, a single LaTeX project, a ZIP of Markdown notes), the system shall show it as a folder in the side panel, decompressing each file only when it is opened (archives up to 1 GB, files up to 200 MB), leaving out junk entries and paths leaving the archive, show archives inside the archive as folders (up to 8 levels), keep changes made in it (including in nested archives) in memory, let the user download the archive with its changes and ask before closing a changed archive; files the system cannot show shall be offered for download. |
| FILE-022 | S | 0.2.0 | The system shall open text and source files (plain text, C, C++, Python, Java, JavaScript, TypeScript, R, MATLAB, SQL and other languages, recognised by extension or name) in a code editor with line numbers, syntax colouring for the language, folding, search and go to line, read UTF-8 or else Windows-1252, save them under their own name in UTF-8 keeping their byte order mark and line ends, and print them with line numbers. |
| FILE-023 | S | 0.2.0 | The system shall show pictures (PNG, JPEG, GIF, WebP, BMP, AVIF, ICO, SVG without running scripts) fitted to the window or at their own size, with their dimensions. |
| FILE-024 | S | 0.2.0 | The system shall let the user comment a line of a source file (toolbar or Ctrl+Alt+M): the comment shall be written above the line as a comment of the file's language (`// REVIEW(Author): text`, block syntax where the language has no line comments), with the author asked once; such lines shall be highlighted and listed in a panel to go to or delete them. |
| FILE-025 | S | 0.2.0 | When a document is saved (file, folder, WebDAV, Git), the system shall keep a copy in the browser (IndexedDB), skipping a copy identical to the previous one and keeping the last 30 per document location; it shall list them, keep the current state as a named version, open a version in place of the content (the document keeping its location), download it or delete it. |
| FILE-026 | S | 0.2.0 | When the user clicks the name of the open file, the system shall let them type a new name, the extension being shown apart and kept (not doubled when typed again; names files cannot have refused); Enter or leaving the field renames, Escape cancels. A file of the open folder or archive shall be renamed there (refused when the folder is read-only or the name is taken, the panel and links following it); another file keeps the new name for its next save, in the recent files too; the versions of the file follow it; files of a repository, Grist or a server keep their name. |
| FOLDER-004 | S | 0.1.0 | The system shall provide a file explorer built on a storage-independent `StorageProvider` interface (list, read, write, mkdir, move, remove; capabilities write and persistent access) that depends on nothing else in the application, with providers for local folders and the browser's private storage (OPFS), and shall let the user create, rename, move (drag and drop) and delete files and folders, the open document following a rename or a move. |
| FOLDER-006 | S | 0.1.0 | When the user opens a folder, the system shall let them choose a folder of the device, the browser's private storage (OPFS, kept across visits and shared with the other apps of the same origin) or a Nextcloud / WebDAV account, and the explorer shall create, rename, move and delete files and folders there too. |
| FOLDER-007 | C | — | The file explorer shall also browse Git repositories (GitHub, GitLab), each change being a commit. |
| FOLDER-005 | S | 0.1.0 | When the open folder holds linked Markdown notes, the system shall read and keep the notes' YAML front matter, follow `[[note]]`, `[[note#heading]]` and `[[note|alias]]` links (by name, nearest first, then by alias), offer to create a missing note, show picture embeds `![[image.png]]` from the folder, list the backlinks of the open note, and update links when a note is renamed. |
| FOLDER-003 | S | 0.1.0 | When the user Ctrl+clicks a link to a file of the open folder in a text document, the system shall open that document; links to web pages shall open in a new tab. |

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
| DOC-017 | S | 0.1.0 | The system shall let the user view and edit the document properties (title, author, date, subject, description, keywords, language, licence) and shall read and write them in every format that supports them: OOXML core properties, ODF `meta.xml`, MDZ manifest, Markdown front matter and LaTeX (`\title`, `\author`, `\date`, hyperref PDF properties). |
| DOC-018 | M | 0.1.0 | The text editor shall edit a structured document model through transactions (ProseMirror) rather than browser editing commands, with its own undo history, Markdown-style shortcuts (`# `, `- `, `1. `, `> `, ` ``` `), list indentation with Tab / Shift+Tab, and paste from other applications limited to the supported content; converting between the editor and the document model shall be lossless. |
| DOC-019 | S | 0.1.0 | The text editor shall find text (Ctrl+F) with match-case, whole-word and regular-expression options, highlight every match with a count, move between matches, and replace the current or all matches (Ctrl+H) in one undoable step, keeping the surrounding formatting. |
| DOC-020 | M | 0.1.0 | The text editor shall set the font, size, text colour and highlight of the selection, a paragraph's left and first-line indents, spacing before and after and line spacing, and clear direct formatting; these shall be kept in DOCX and ODT (direct formatting only, not the values that come from the paragraph style). |
| DOC-021 | M | 0.1.0 | The text editor shall insert page breaks (Ctrl+Enter), distinct from horizontal lines, that start a new page when printing and are kept in DOCX (including breaks inside a paragraph and "page break before"), ODT, Markdown (`\newpage`) and LaTeX. |
| DOC-022 | M | 0.1.0 | The text editor shall insert footnotes (Ctrl+Alt+F) at the cursor, numbered automatically in reading order, listed under the page and printed at the end, edited by clicking the number (inline Markdown: formatting, links, equations, several paragraphs); they shall be kept in DOCX (footnotes part), ODT (text:note), Markdown (`[^n]`, also `^[…]` on import) and LaTeX (`\footnote`). |
| DOC-023 | S | 0.1.0 | The text editor shall insert a table of contents generated from Heading 1–3, updated as headings change, whose entries go to their heading; it shall be kept as an updatable table of contents in DOCX (TOC field recomputed by Word on opening) and ODT, as `[[_TOC_]]` in Markdown (also `[TOC]` on import) and `\tableofcontents` in LaTeX. |
| DOC-024 | S | 0.1.0 | The text editor shall define a header and a footer, each with left, centre and right zones that may contain the page number, page count, title and date; they shall be shown around the page while editing, printed on every page, and kept in DOCX (header/footer parts with fields), ODT (master page), LaTeX (fancyhdr) and Markdown (front matter). |
| DOC-025 | S | 0.1.0 | While the cursor is in a table, the text editor shall offer commands to insert and delete rows and columns, merge and split cells, toggle a header row and delete the table; merged cells and the header row shall be kept in DOCX (gridSpan, vMerge, tblHeader), ODT (spanned and covered cells, header rows), HTML and LaTeX (\multicolumn, \multirow), and Markdown shall keep the header row. |
| DOC-026 | S | 0.1.0 | The text editor shall number figures, tables and equations in document order through captions, and insert cross-references to them and to headings that follow renumbering and show `??` when their target is missing; numbers and references shall be kept in DOCX (SEQ and REF fields, bookmarks), ODT (sequences, bookmark references), LaTeX (\captionof, equation, \label, \ref, \eqref, \nameref) and Markdown (anchors, links, \tag), and read back from these formats. |
| DOC-027 | S | 0.1.0 | The text editor shall keep a bibliography of sources imported from BibTeX, insert citations of one or more sources with an optional page, numbered in citation order or by author and year, and a list of the cited references that follows the citations; sources and citations shall be kept in DOCX (Word sources, CITATION and BIBLIOGRAPHY fields), ODT (bibliography marks and index), LaTeX (\cite, BibTeX file) and Markdown (pandoc citations and references), and read back from these formats and from Zotero and Mendeley citations in Word files. |
| DOC-030 | S | — | The text editor shall offer switchable editing modes for a document: visual (WYSIWYG), source (the Markdown or LaTeX text, highlighted, with a live preview) and reading (no toolbar); the choice shall persist per document kind. |
| DOC-031 | S | 0.2.0 | While typing in a text document with typography on (the default, a setting kept by the browser), the system shall replace straight quotes with the curly quotes of the document's language (French « » with no-break spaces, English, German…), `'` after a letter with an apostrophe, `--` and `---` with en and em dashes, `...` with an ellipsis, and in French put a narrow no-break space before `; ! ?` and a no-break space before `:`, except in code, web addresses and times; Backspace shall undo a correction. |
| DOC-032 | S | 0.2.0 | The system shall transform the selected text, or the whole document, keeping its formatting: curly or straight quotes, French spacing, dashes and ellipsis, removal of double spaces and invisible characters, joining of lines that do not end a sentence (with words cut by a hyphen put back together), sentence case, title case, upper and lower case. |
| DOC-033 | S | 0.2.0 | The system shall show on demand the reading ease of each paragraph of a text document (Flesch for English, Kandel–Moles for French), as a coloured mark with the score and words per sentence, and the document's score in the status bar. |
| DOC-034 | S | 0.2.0 | The system shall let the user set a word goal per document, shown with its progress in the status bar, keep the words written each day (the last 14 days shown), and run a focus timer (25 or 5 minutes) shown in the status bar. |
| DOC-035 | S | 0.2.0 | The system shall offer a focus mode (toolbars and panels hidden, other paragraphs dimmed, Escape to leave) and a typewriter mode (the line of the cursor kept in the middle of the screen). |
| DOC-029 | S | 0.1.0 | The system shall number pages in a chosen style (decimal, lower or upper roman numerals, lower or upper letters), with ready-made forms (`1`, `1/10`, `- 1 -`, `Page 1 of 10`), starting from a chosen number and optionally without header and footer on the first page (title page); shown on screen, printed, and kept in DOCX, ODT, LaTeX and Markdown. |
| DOC-030 | S | 0.2.0 | The system shall check the accessibility of a text document and list, with a way to each one and a fix where possible: pictures without alternative text or with a file name as text, skipped heading levels, empty headings, tables without a header row, links with vague texts or bare addresses, coloured text with a contrast ratio below 4.5:1 (WCAG), and a missing title or language. |
| DOC-028 | S | 0.1.0 | The text editor shall let a master document include sub-documents by path, kept as OpenDocument linked sections, Word sub-documents, LaTeX `\include` and Markdown include lines (mdBook syntax); when the user assembles it, the system shall save the master document with the content of its sub-documents, recursively, as one file in a chosen format, numbering, cross-references and bibliography running across them, and report missing or self-including sub-documents. |
| DOC-018 | S | 0.1.0 | When a Markdown file starts with a YAML front matter, the system shall read the document properties from it and keep the keys it does not interpret unchanged on save; when saving Markdown with properties, it shall write them as front matter. |
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
| MD-018 | M | 0.1.0 | When a Markdown note opened from a folder or an archive links pictures (`![](path)`, `<img src>`, `![[name]]`, with encoded or plain names), the system shall display them, write them back as relative links when the note is saved into its folder, and include them when the note is exported (MDZ, DOCX, ODT, standalone Markdown); pictures that cannot be found shall be reported. |
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
| DIAG-001 | M | 0.1.0 | The system shall let the user insert a Mermaid diagram in a text document and edit its source in a dialog with a live preview and starter templates (flowchart, sequence, class, state, entity-relationship, Gantt, pie, mind map). |
| DIAG-002 | M | 0.1.0 | The system shall render diagrams in the document view, in print and in exports without network access, loading the diagram engine only when a document contains or inserts a diagram; when the source is invalid, the system shall show the error and keep the source unchanged. |
| DIAG-003 | M | 0.1.0 | The system shall render diagrams in Mermaid's strict security mode, as images, so that diagram source cannot run scripts or load remote content. |
| DIAG-004 | M | 0.1.0 | When a document is saved as Markdown or MDZ, the system shall write each diagram as a fenced ```` ```mermaid ```` code block, and parse such blocks back into diagrams when reading. |
| DIAG-005 | M | 0.1.0 | When a document is saved as DOCX or ODT, the system shall embed each diagram as a PNG picture whose title is `mermaid` and whose description holds the Mermaid source, and read such pictures back as editable diagrams. |
| DIAG-006 | S | 0.1.0 | When a document is saved as LaTeX, the system shall include each diagram as a PNG graphic preceded by its Mermaid source in comments. |
| DIAG-007 | S | 0.1.0 | When a diagram cannot be rendered while saving, the system shall write its source as text so that no content is lost. |
| DIAG-008 | C | — | Other diagram languages (PlantUML, Graphviz) and freehand diagrams (draw.io). |

## 4e. Code cells (CODE)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| CODE-001 | M | 0.1.0 | The system shall let the user insert Python or JavaScript code cells in a text document and edit their code. |
| CODE-002 | M | 0.1.0 | When the user asks to run a cell (or all cells), the system shall run it with Python (Pyodide, served by the application and cached for offline use after its first use) or JavaScript; Python cells of a document shall share one interpreter. |
| CODE-003 | M | 0.1.0 | The system shall run code only in an isolated sandbox (opaque-origin iframe and worker) that has no network access and no access to the application's page, storage, keys or other documents, and shall let the user stop a running cell at any time. |
| CODE-004 | M | 0.1.0 | Before the first run in an open document, the system shall explain what running the code implies and ask for confirmation; code shall never run when a document is opened. |
| CODE-005 | M | 0.1.0 | The system shall keep the last output of each cell (printed text, errors, matplotlib figures) in the document and display it without running the code again; changing the code shall clear the stale output. |
| CODE-006 | M | 0.1.0 | When a document is saved as Markdown or MDZ, the system shall write each cell as a fenced block with the `{run}` attribute (e.g. ```` ```python {run} ````), followed by its output as a ```` ```text {output} ```` block and its figures as images titled `output`, and read them back. |
| CODE-007 | S | 0.1.0 | When a document is saved as DOCX, ODT or LaTeX, the system shall write each cell as its code followed by its last output (text and pictures). |
| CODE-008 | S | 0.1.0 | Where Python code imports packages that are not in the standard library (numpy, matplotlib…), the system shall download them from the Pyodide CDN on first use, verify them against the hashes of the bundled lock file, and cache them for offline use. |
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
| SHEET-014 | S | 0.2.0 | The system shall let the user format the selected cells (bold, italic, underline, text colour, fill colour, borders, horizontal alignment) from the toolbar or with Ctrl+B/I/U, clear the formatting (Ctrl+Space) while keeping values and number formats, show the formatting on screen and in print, and keep it in XLSX (fonts, fills, borders, alignment) and ODS (cell styles), including formatted empty cells. |
| SHEET-015 | W | — | Pivot tables, macros. |
| SHEET-016 | S | 0.1.0 | The system shall let the user sort the rows of a range (the selection, or the filled block around the active cell) by one column, ascending or descending, keeping an optional header row in place: numbers before text, text compared without case or accents, empty cells last, by computed values, with formulas translated as they move; one undo step restores the order. |
| SHEET-017 | S | 0.1.0 | The system shall let the user freeze the rows above and the columns left of the active cell (the first row from A1), which stay in view while the sheet scrolls, unfreeze them, and keep frozen panes in XLSX (`pane state="frozen"`) and ODS (`settings.xml`). |
| SHEET-018 | S | 0.2.0 | The system shall keep the autofilter of a sheet (its range and, per column, the values shown) when reading and writing XLSX (`autoFilter`, hidden rows, `_xlnm._FilterDatabase`) and ODS (database range with filter buttons, `table:visibility="filter"`), and let the user turn it on for a range and choose the values shown in each column, the other rows being hidden. |
| SHEET-020 | M | 0.1.0 | The system shall let the user insert column, bar, line, pie and scatter charts drawn from a range of a sheet (first column: categories or x values; other columns: series; optional header row with series names), proposing the selection or the block of data around the active cell; charts shall update when the data changes and follow inserted or deleted rows and columns. |
| SHEET-021 | M | 0.1.0 | The system shall draw charts as accessible SVG (title, legend for several series, value tooltips) with a colour-blind-checked categorical palette, and let the user move, resize, edit and delete them with the mouse or the keyboard. |
| SHEET-022 | M | 0.1.0 | When a workbook is saved as XLSX or ODS, the system shall write its charts as native charts (DrawingML chart parts; ODF chart objects anchored in their cell) that Excel and LibreOffice display, and read them back. |
| SHEET-023 | S | 0.1.0 | The system shall let the user copy a chart as a PNG image (to paste it into a document or a slide), and print charts with their sheet. |
| SHEET-024 | S | 0.2.0 | The system shall evaluate the mathematical (`EXP`, `LN`, `LOG`, `LOG10`, `SIGN`, `SUMSQ`), trigonometric (`SIN`, `COS`, `TAN`, `ASIN`, `ACOS`, `ATAN`, `ATAN2`, `SINH`, `COSH`, `TANH`, `DEGREES`, `RADIANS`) and statistical functions (`VAR`, `VARP`, `STDEV`, `STDEVP`, `SLOPE`, `INTERCEPT`, `RSQ`, `CORREL`) of spreadsheets, a result outside the real numbers being `#NUM!`. |

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
| PRES-013 | S | 0.1.0 | The system shall let the user choose the slide size (16:9, 4:3, A4, Letter) and orientation (landscape, portrait) of a presentation, moving and resizing shapes and text sizes with the slides (undoable), keep the size in ODP and PPTX (with the orientation declared in ODP), and print in the orientation of the slides by default. |

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
| PDF-016 | S | 0.2.0 | The system shall let the user fit the PDF pages to the width of the view or show whole pages (fit to the height and the width), and show 1, 2, 3, 4 or 6 pages side by side, the fit applying to the whole row; the choice shall be kept for the next PDF. |
| PDF-017 | S | 0.2.0 | The system shall find a text in the pages of a PDF (Ctrl+F), ignoring case and accents, highlight every match and the current one, show their count, and go to the next and previous matches. |
| PDF-018 | S | 0.2.0 | The system shall let the user highlight the selected text of a PDF and place notes on its pages, each with a comment, an author (asked once) and a date, listed in an annotations panel with the annotations already in the file; saving shall write them as standard PDF annotations (`/Highlight` with quadrilaterals, `/Text`) with appearance streams, shown by other PDF readers. |
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
| UI-011 | S | 0.1.0 | The system shall let the user choose a light, dark or system theme (following the operating system preference by default); the choice shall persist and apply to native controls. Document pages and slides shall stay light, as on paper. |
| UI-012 | S | 0.1.0 | The system shall offer an About window, from the toolbar and the start screen, showing the author, the version, the git commit and date of the build, the licence, whether the app is installed and works offline, a QR code of the app address to open it on another device (shown full screen when activated), and links to the documentation, source code, changelog, requirements and problem reports; it shall copy these details for a problem report. |
| UI-013 | S | 0.1.0 | The system shall display its version and the short git commit of the build (e.g. `v0.0.13 (6cae6fc)`) in the toolbar and on the start screen, as QRShare does; activating it shall open the About window. |
| UI-015 | C | — | On a phone, the system shall dock a contextual toolbar above the on-screen keyboard with the essential commands for the selection, the other commands under "More", and offer a full-screen writing mode. |
| UI-014 | S | 0.1.0 | On a narrow screen (phone), the system shall keep the header on one line, with Save visible and the other file actions in a menu, and lay out each editing toolbar as a single row that scrolls horizontally, so that the document stays visible above the on-screen keyboard. |
| UI-016 | M | 0.1.0 | The system shall let the user type any font size from 1 to 999 pt (rounded to the half point) in text documents and presentations, with the usual sizes offered as suggestions and the arrow keys stepping through them and beyond; in a presentation, a size typed while editing a text box shall apply to the selected text only. |
| UI-017 | S | 0.1.0 | The About window shall list the open-source components the application ships with (its runtime dependencies), each with the exact version installed at build time, its licence and a link to its project page, and the copied details for a problem report shall include these versions. |
| UI-018 | S | 0.2.0 | The system shall offer a command palette (Ctrl+Shift+P and a header button) listing the buttons and menu entries of the screen, filtered by the words typed (in any order, ignoring case and accents), run with Enter and navigable with the arrow keys, in three columns: the command, its keyboard shortcuts when it has some, and where it is; the commands of the view (such as the review mode and the review actions) shall be listed even when no button shows them, and some commands shall also be found by keywords in other languages (the review mode by "correction", "relecture", "proofreading"…). |

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
| SHARE-005 | S | 0.0.12 | When the user chooses "Receive from another device", the system shall open QRShare's scanner that recognises what it is shown: a static QR code (an invitation or document link), animated QR codes or CIMBAR codes. |
| SHARE-007 | S | 0.1.0 | When a document that is not small text is sent to another device, the system shall hand the file to QRShare in the browser (app handoff protocol v1, `postMessage`, posted only to the configured QRShare origin) without downloading it; if QRShare does not answer, then the system shall fall back to a download and QRShare's "Prepare a transfer" screen. |
| SHARE-008 | S | 0.1.0 | When the user receives from another device, the system shall give QRShare a return address so that a received file can be opened directly in Progressive Web Office, accepting files only from the configured QRShare origin. |
| SHARE-009 | S | 0.1.0 | The system shall build a link that contains the open document itself (text documents as Markdown, other documents in their format, compressed and base64url-encoded in the URL fragment), let the user copy it, and warn when it is long enough to be cut by some apps. |
| SHARE-010 | S | 0.1.0 | When the application is opened with such a link, the system shall rebuild and open the document — the fragment is never sent to a server — remove the fragment from the address, and report a damaged link. |
| SHARE-006 | C | — | Native, embedded implementation of the QRShare frame protocol (licences are compatible: QRShare is BSD-3-Clause since 0.5.0, Progressive Web Office AGPL-3.0-or-later). |
| SHARE-011 | S | 0.1.0 | When the user gives the address of a document on a web server, the system shall check that it can be downloaded and make a link (with its QR code) that opens it read-only in the application, optionally pinned to that version by its SHA-256 fingerprint; when the linked file has changed, or cannot be read (CORS, HTTP error, over 50 MB), the system shall say so and not show it. |
| SHARE-012 | S | 0.1.0 | Where QRShare announces the handoff protocol v2 in its manifest (`versions` containing 2, `features` `mode` and `reply-opener`), the system shall be able to ask QRShare for a given send mode (e.g. animated QR codes, skipping the choice) and, when receiving, to get the received file back in its own window, from QRShare's origin only, after the user's click in QRShare. |
| SHARE-013 | M | 0.2.0 | Before opening a file handed over by another app (QRShare, the system share sheet), the system shall check that it is a file it opens and that its content is what its name says (a PDF named `.docx`, a program, an empty file are refused with an explanation, never offered for download); a file from QRShare shall be opened only after the user has seen where it comes from (the QRShare address), its name, size and format. |

## 9f. AI assistant and agent integration (AI)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| AI-001 | M | 0.0.13 | Where the user has configured an AI provider, the system shall provide an assistant panel that can read and modify the open document through tools (documents, spreadsheets, presentations). |
| AI-002 | M | 0.0.13 | The system shall ask for explicit consent before sending any document content to the AI provider, and display which provider and model are used. |
| AI-003 | M | 0.0.13 | Every change made by the assistant shall be undoable and visible (the assistant reports each tool action). |
| AI-004 | M | 0.0.13 | The API key shall be stored only in this browser and only if the user chooses so; it shall never be sent anywhere but to the provider API. |
| AI-005 | S | 0.0.13 | The assistant shall be able to write LaTeX equations, spreadsheet formulas and slide content. |
| AI-006 | S | 0.0.13 | Where the browser exposes an agent tool API (WebMCP `navigator.modelContext`), the system shall register the same document tools so that external AI agents can drive the application, with user confirmation for modifications. |
| AI-007 | M | 0.1.0 | The system shall let the user choose the AI provider of the assistant — Anthropic (Claude), OpenAI, Mistral AI, Albert (French State), a local Ollama server, or any server offering the OpenAI chat completions API — with its own key, model and (for local and custom servers) API address, kept per provider; local servers on `localhost` shall be reachable over HTTP. |
| AI-008 | M | 0.1.0 | The system shall give every provider the same document tools, confirmations and undo, ask consent again when the provider, address or model changes, and start a new conversation when the provider changes. |
| AI-009 | C | — | Several assistants in one conversation (e.g. one model drafts, another reviews). |

## 9g. Grist (GRIST)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| GRIST-001 | M | 0.1.0 | The system shall let the user add Grist accounts (server address and API key), check them when added, store them only in this browser, and forget them. |
| GRIST-002 | M | 0.1.0 | The system shall let the user browse the team sites and documents of a Grist account and open a document as a workbook: one sheet per table, the column labels in the first row, the record ids in the first column, formula columns with their computed values and dates as dates. |
| GRIST-003 | M | 0.1.0 | When the user saves a workbook opened from Grist, the system shall send only the changes: changed cells of editable columns, new rows (without an id), and — after confirmation — deleted rows; it shall then reload the document so that new rows get their ids and formulas their values. |
| GRIST-004 | M | 0.1.0 | The system shall not write formula columns, the id column, or columns of complex types (references, lists, attachments), which are shown as text. |
| GRIST-005 | M | 0.1.0 | If the Grist server cannot be reached or refuses a request, the system shall say whether the address/HTTPS/CORS setup or the API key is the likely cause, and link to the server setup guide. |
| GRIST-006 | C | — | Python code cells reading Grist tables; writing documents of the text editor to Grist. |

## 9h. Cloud storage: Nextcloud and WebDAV (DAV)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| DAV-001 | M | 0.1.0 | The system shall let the user add cloud accounts — a Nextcloud / ownCloud server address with user name and app password, or the full address of any WebDAV server — check them when added, store them only in this browser, and forget them. |
| DAV-002 | M | 0.1.0 | The system shall let the user browse the folders of a cloud account and open any supported file. |
| DAV-003 | M | 0.1.0 | When a document opened from the cloud is saved, the system shall write it back to the same file; the user shall also be able to save any open document to a chosen cloud folder and file name, the extension choosing the format. |
| DAV-004 | M | 0.1.0 | The system shall never overwrite a file that changed on the server since it was read, nor an existing file when saving a new one (conditional requests with ETags); it shall offer to save a copy next to it (default) or to replace the file. |
| DAV-005 | M | 0.1.0 | If the server cannot be reached or refuses the credentials, the system shall say whether the address/HTTPS/CORS setup or the credentials are the likely cause, and link to the server setup guide. |
| DAV-006 | C | — | Nextcloud login flow (no app password to copy), sharing links, and a recent-files list per account. |

## 9i. Real-time collaboration (COLLAB)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| COLLAB-001 | M | 0.1.0 | The system shall let the user start a real-time session on an open text document or spreadsheet and invite others with a link carrying a random room name and secret; opening the link shall join the session. The document shall travel directly between browsers (WebRTC, end-to-end encrypted), public Nostr relays only introducing the browsers to each other, with no server storing the document. |
| COLLAB-002 | M | 0.1.0 | While in a session, the system shall share every edit with the other participants within a second; concurrent edits of different cells or paragraphs shall all be kept, and every participant shall converge to the same content. A participant who joins late or comes back online shall receive what they missed. |
| COLLAB-003 | M | 0.1.0 | The system shall show who is in the session — each participant with a friendly compound name (e.g. "Swift Crimson Falcon") and a matching colour, which the user can change — and where each one is working (selected cell, current paragraph). |
| COLLAB-004 | M | 0.1.0 | The system shall let any participant save named versions, shared with everyone and kept with their author and date, and restore one for everyone as a new edit, after saving the current state as a version. |
| COLLAB-005 | M | 0.1.0 | Each participant shall keep the session's document and version history on their device (IndexedDB), so that reloading the page rejoins the session with them, even when nobody else is online. |
| COLLAB-006 | M | 0.1.0 | The collaboration protocol, history and presence shall come from the `@scelles/collab` package, shared with QRShare (no duplicated implementation). |
| COLLAB-008 | S | 0.1.0 | The system shall let several people edit a text document on devices of which at least one is fully offline, merging their changes character by character (CRDT) through passes of animated QR codes handed to QRShare (handoff protocol v2), or files of codes: one device shows its state vector, the other shows only the updates missing from it, which are validated on an isolated copy (schema, limits, properties) before being applied, after the user saw a summary and accepted; frames shall be versioned, size-limited, optionally compressed and signed (Ed25519) by trusted devices, and every import logged. A device without the document's history shall join the history of the other device instead of starting its own. |
| COLLAB-009 | S | 0.2.0 | The collaboration bar shall tell where the connection is — the relays cannot be reached, looking for the others, receiving the document, connected — and, after 20 seconds without anyone, what to check (the other page open, a network blocking direct connections, the same Wi-Fi, a TURN server, synchronisation without a network); the settings shall let the user set the relays and a TURN server. |
| COLLAB-010 | S | 0.2.0 | Participants shall introduce themselves (application, protocol version, kind of document) when they meet; when another app, version or kind of document joins, the bar shall warn that its changes are not trusted. |
| COLLAB-007 | S | — | Collaboration on presentations, comments shared during a real-time session, suggested changes (track changes), and a character-level text merge with remote carets. |

## 9k. Review: comments (REV)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| REV-001 | S | 0.2.0 | The system shall let the user comment the selected text of a text document, or the word at the cursor (toolbar or Ctrl+Alt+M), signing comments with a name asked once (by default the collaboration name) and the date; it shall highlight commented text, list the threads beside the page in the order of their text, select a comment's text when its thread is clicked, mark the thread under the cursor, and let the user reply, resolve, reopen and delete a comment (delete being undoable); comments whose text was deleted shall not be saved. |
| REV-002 | S | 0.2.0 | The system shall read and write Word comments: ranges (`commentRangeStart`, `commentRangeEnd`, `commentReference`), `comments.xml` (author, initials, date, paragraphs) and `commentsExtended.xml` (replies, resolved state). |
| REV-003 | S | 0.2.0 | The system shall read and write OpenDocument annotations: `office:annotation` with `office:annotation-end` for ranges (a comment without end being put on the word before it), author, date and initials, LibreOffice's replies (`loext:parent-name`) and resolved state (`loext:resolved`). |
| REV-004 | S | 0.2.0 | The system shall read and write comments in Markdown with CriticMarkup: the commented text as `{==text==}` followed by `{>>Author: comment<<}`, replies following their comment, a comment without highlighted text being put on the word before it. |
| REV-005 | S | 0.2.0 | The system shall let the user track changes in a text document: while on, typed text shall be recorded as an insertion and deleted text kept, struck out, as a deletion, each with its author (asked once) and date (deleting tracked inserted text removing it); changes shall be shown in the text and listed in a panel to be accepted or rejected one by one or all at once, and kept in DOCX (`w:ins`, `w:del`/`w:delText`), ODT (`text:tracked-changes`, changed regions) and Markdown (CriticMarkup `{++ ++}`, `{-- --}`); LaTeX exports shall accept them. |

## 9m. Reading and reviewing (REVIEW)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| REVIEW-001 | S | 0.2.0 | The system shall offer a review mode for text documents (toolbar or Ctrl+Alt+R) that lays the document out as pages like a PDF file (page breaks starting new pages), with no change to the text but comments still possible, and the same page controls as the PDF viewer: page number, previous and next, zoom, whole page or width, 1 to 4 pages side by side, and a choice between scrolling the pages and showing one spread at a time without scrolling (also offered by the PDF viewer); the choices shall be remembered. |
| REVIEW-002 | S | 0.2.0 | While reading a PDF file or reviewing a text document, the system shall turn the pages with single keys outside the fields (k/n/Page Down/Space/→ next, j/p/Page Up/Shift+Space/← previous, g/Home first, G/End last) and offer shortcuts to zoom (+ −), fit the width (w) or the page (h, 0), set the pages side by side (1–4), switch the flow (s), comment (c), go to the next and previous comment (] [), find (/), go full screen (f) and list the shortcuts (?). |
| REVIEW-003 | S | 0.2.0 | Page by page, the mouse wheel shall turn the pages when the spread has nothing more to scroll. |
| REVIEW-004 | S | 0.2.0 | The system shall offer a full screen without distractions (f, Esc to leave) showing only the pages, the review bar and the comments. |
| REVIEW-005 | S | 0.2.0 | The PDF viewer shall offer the same review mode button and shortcut (Ctrl+Alt+R): the highlight and note tools named in the toolbar, the form and signature tools hidden, and the annotations panel shown, explaining how to annotate while it is empty. |

## 9n. Settings (SET)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| SET-001 | S | 0.2.0 | The system shall offer a settings window (⚙ in the header, and the command palette by "settings", "paramètres"…) with its settings grouped by category — general (language, theme, the user's name, the format family of new files), reading and review, writing (typography as you type), printing (paper, orientation, margins) — each kept in the browser as soon as it changes. |
| SET-002 | S | 0.2.0 | The reading and review settings shall set how PDF files and text documents in review mode open: pages side by side, fit to the width or to the whole page, scrolling or page by page, and whether PDF files and text documents open in review mode; the choices made in the toolbar shall become the new defaults unless the user turns this off. |

## 9j. Images and drawing (IMG)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| IMG-001 | C | — | The system shall offer minimal photo editing of a picture (crop, rotate, resize, brightness and contrast, blur a region, arrows, text and highlights), keeping the original until saved. |
| IMG-002 | C | — | The system shall offer minimal vector drawing (shapes, lines and arrows, text, freehand), saved as SVG and editable again in documents and presentations. |
| IMG-003 | S | 0.2.0 | When the user inserts or pastes a picture, the system shall offer to give it a caption (numbered as a figure) and an alternative text, and shall list the pictures without alternative text. |

## 9l. Teaching (TEACH)

| ID | Pri | Phase | Requirement |
|----|-----|-------|-------------|
| TEACH-001 | S | 0.2.0 | The system shall let the user mark paragraphs of a text document as solutions, shown framed and labelled, hide or show them on screen and in print, and save copies without them (the exercise sheet) in ODT, DOCX and Markdown; solutions shall be kept as Word content controls (tag `pwo:solution`, alias Solution), ODF sections named Solution*n*, and Markdown fenced divs (`::: solution`, `::: {.solution}`). |
| TEACH-002 | S | 0.2.0 | The system shall generate N random variants of a text document: `{{X=rand(a..b[, step])}}`, `{{X=choice(…)}}` and `{{X=expression}}` define values drawn per variant with a seeded generator, `{{X}}` and `{{=expression[\|digits]}}` show values and computed results (arithmetic and common functions, no code run), numbers being formatted for the document's language; the result shall be a ZIP of the sheets (without solutions), their answer keys and a CSV of the values, in ODT, DOCX or Markdown. |

## 10. Out of scope (Won't, this time)

- A collaboration server, user accounts, or storage of documents on a server we operate.
- Legacy binary formats (`.doc`, `.xls`).
:::
