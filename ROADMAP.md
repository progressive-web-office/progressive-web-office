# Roadmap

Development phases are **milestones**. Following Semantic Versioning for
initial development, phases 0 to 12 are `0.0.1` to `0.0.13` in the
changelog; phase 13 is the first minor release, `0.1.0`.

| Phase | Milestone | Scope | Status |
|-------|-----------|-------|--------|
| 0 | 0.0.1 | Foundations: TypeScript/Vite scaffold, PWA shell (manifest, service worker, offline), start screen, open/drop, format detection, docs + `llms.txt`, `justfile`, governance files | ✅ |
| 1 | 0.0.2 | Text documents: `.docx`, `.odt`, `.md`, `.mdz` (wflixu/mdz 1.1.0 compatible) read/edit/write, WYSIWYG editor, images, links, plain ZIP → MDZ import | ✅ |
| 2 | 0.0.3 | Spreadsheets: `.xlsx`, `.ods`, `.csv` read/edit/write, formula engine, multiple sheets, insert/delete rows & columns | ✅ |
| 3 | 0.0.4 | PDF: viewer (navigation, zoom, text selection), form filling, handwritten signatures | ✅ |
| 4 | 0.0.5 | Presentations: `.pptx`, `.odp` read/edit/write, slide sorter, slideshow | ✅ |
| 5 | 0.0.6 | Polish: recent files, autosave drafts, end-to-end tests | ✅ |
| 6 | 0.0.7 | Mathematical equations: MathLive editor, `$…$` in Markdown/MDZ, MathML in ODT, OMML in DOCX | ✅ |
| 7 | 0.0.8 | Internationalisation: English, French, Simplified Chinese | ✅ |
| 8 | 0.0.9 | Printing: page setup, print preview, per-kind print layouts | ✅ |
| 9 | 0.0.10 | LaTeX: `.tex` export (ZIP with images), import, `$…$` typing, equations in sheets and slides | ✅ |
| 10 | 0.0.11 | Git repositories: GitHub and GitLab browse, open, commit | ✅ |
| 11 | 0.0.12 | Device-to-device exchange with QRShare (Web Share, share target) | ✅ |
| 12 | 0.0.13 | AI assistant (Claude) with document tools; WebMCP tools for external agents | ✅ |
| 13 | 0.1.0 | QRShare app handoff (send and receive files between the two apps in the browser); light/dark/system theme; document properties and Markdown front matter; Mermaid diagrams; sandboxed Python/JavaScript code cells; Grist connector; choice of AI provider (Claude, OpenAI, Mistral, Albert, Ollama, OpenAI-compatible); Nextcloud / WebDAV; spreadsheet charts; real-time collaboration (documents, spreadsheets) with presence and shared versions; ProseMirror word processor (find/replace, character and paragraph formatting, page breaks, footnotes, table of contents, header/footer, tables with merged cells, captions and cross-references, citations and bibliography, master documents); folder mode (side panel, search across documents, links between documents) | ✅ |

## Planned

Ideas not yet scheduled into a milestone, grouped by theme. Order within a
group is not a commitment.

### Spreadsheet

- ✅ Cell formatting (SHEET-014: bold, italic, underline, colours, fills,
  borders, alignment) and freeze panes (SHEET-017); next: fonts and sizes,
  merged cells
- ✅ Sort (SHEET-016) and autofilter (SHEET-018); next: fill handle,
  conditional formatting, data validation
- About a hundred more functions
- Executable notebooks: code cells (Python/JavaScript) that read and write
  the cells of an open workbook

### Word processor

- Named paragraph and character styles beyond headings
- Editing modes, switchable per document: visual (WYSIWYG), source
  (Markdown or LaTeX text with highlighting, side-by-side preview) and
  reading (no toolbar, larger text)
- ✅ Page numbering styles (DOC-029, 0.1.0)
- ✅ Templates and examples, the user's own templates in the browser, the
  template file formats (FILE-018 to FILE-020); next: templates kept in a
  folder
- Master documents, next steps: numbering and table of contents running
  across sub-documents while editing, cross-references to targets in other
  sub-documents
- Mail merge: a document combined with a CSV file or a workbook gives N
  documents or one PDF
- Form fields (text, check box, list), exported as a fillable PDF
- Grammar checking with LanguageTool (public or self-hosted instance)
- Visual comparison of two versions of a document
- Reading and review mode: clickable outline, focus mode, read aloud
  (Web Speech)

### Files

- ✅ ZIP archives opened as folders, nested archives included (FILE-021);
  source and text files in a code editor (FILE-022); pictures (FILE-023)
- Next: comments on lines of source files, PDF annotations

### Review and collaboration

- ✅ Comments in text documents (REV-001 to REV-004: DOCX, ODT, Markdown);
  next: comments shared in real-time sessions, comments on spreadsheet
  cells, track changes (REV-005)
- ✅ Asynchronous collaboration without a network for text documents
  (COLLAB-008, 0.1.0): character-level merge through passes of animated QR
  codes with QRShare, signed frames, trusted devices, an import log
- Offline synchronisation of spreadsheets, images sent once by SHA-256
  (blob frames), the Yjs history embedded in ODT and DOCX files

### Images and drawing

- Minimal photo editing: crop, rotate, resize, brightness / contrast,
  blur or pixelate a region, annotations (arrows, text, highlights)
- Minimal vector drawing: shapes, lines and arrows, text, freehand, layers;
  saved as SVG and kept editable in documents and slides
- Caption images easily: a caption and alt text when inserting or pasting a
  picture, numbered as figures (cross-references), and a check for pictures
  without alt text

### Presentations

- Layouts, bullets, presenter mode, alignment guides

### Teaching

- Exercise sheets and answer keys from one document (blocks marked as
  "solution" shown or hidden)
- Random variants: parameterised values (`{{R=rand(1..10)}}`) give each
  student a different version, with its computed answer key
- Quiz export to Moodle XML and AMC (Auto Multiple Choice)
- Hand out and collect work in class over QRShare / peer-to-peer
  collaboration, without a learning platform
- Block diagrams and Bode / Nyquist plots from a transfer function
- Kiosk / exam mode: a locked instance with no network, no AI and no
  external copy-paste

### PDF and trust

- ✅ Whole-page zoom and 2 or more pages side by side (PDF-016)
- Direct PDF export (no print dialog), PDF/A and tagged (accessible) PDF
- Local electronic signatures and signature verification (WebCrypto,
  basic PAdES)
- Text search in PDF

### Files and fidelity

- Real-file corpus (Word and LibreOffice documents) with an automatic
  fidelity report in CI; preserve unknown content on save
- ✅ File explorer: a storage-independent module (`src/fs/`, a
  `StorageProvider` interface: list, read, write, mkdir, move, remove) with
  providers for local folders (File System Access API), the browser's
  private storage (OPFS), WebDAV / Nextcloud and Git repositories; create,
  rename, move and delete files and folders; designed to be extracted as a
  library shared with QRShare
- ✅ Read-only opening: open any document read-only (viewing without
  accidental edits, files from a read-only folder or link), with a visible
  banner and "Edit a copy"
- ✅ Note vaults: a folder of linked Markdown notes with YAML front matter
  (tags, aliases, any key kept), `[[wiki links]]`, `[[note#heading]]`,
  `[[note|alias]]`, `![[embeds]]`, backlinks, and links that follow renames
- Crash recovery from an operation log in IndexedDB, beyond autosave
- TextBundle import; upstream MDZ collaboration

### Cross-cutting

- Phones: a contextual toolbar docked above the keyboard (the essential
  buttons for the selection, the rest under "More"), toolbars that can be
  hidden, and a full-screen writing mode

- ✅ Templates (FILE-018 to FILE-020); local version history, command
  palette
- Accessibility checker
- Encrypted share links
