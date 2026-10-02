# Roadmap

Development phases are **milestones**, not releases. Following Semantic
Versioning for initial development, phase *n* is tagged `0.0.(n+1)` in the
changelog.

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
| 13 | 0.0.14 | QRShare app handoff (send and receive files between the two apps in the browser); light/dark/system theme; document properties and Markdown front matter; Mermaid diagrams; sandboxed Python/JavaScript code cells; Grist connector; choice of AI provider (Claude, OpenAI, Mistral, Albert, Ollama, OpenAI-compatible); Nextcloud / WebDAV; spreadsheet charts; real-time collaboration (documents, spreadsheets) with presence and shared versions; ProseMirror word processor (find/replace, character and paragraph formatting, page breaks, footnotes, table of contents, header/footer, tables with merged cells) | ⏳ |

## Planned

Ideas not yet scheduled into a milestone, grouped by theme. Order within a
group is not a commitment.

### Spreadsheet

- Cell formatting (number formats, fonts, borders, fills), freeze panes
- Sort and filter, fill handle, conditional formatting, data validation
- About a hundred more functions
- Executable notebooks: code cells (Python/JavaScript) that read and write
  the cells of an open workbook

### Word processor

- Named paragraph and character styles beyond headings
- Cross-references with automatic numbering of figures, tables and
  equations ("see figure 3", "equation (2)")
- Bibliography from BibTeX / CSL, written as `\cite` in LaTeX and as
  fields in Word
- Mail merge: a document combined with a CSV file or a workbook gives N
  documents or one PDF
- Form fields (text, check box, list), exported as a fillable PDF
- Grammar checking with LanguageTool (public or self-hosted instance)
- Visual comparison of two versions of a document
- Reading and review mode: clickable outline, focus mode, read aloud
  (Web Speech)

### Review and collaboration

- Comments and track changes (ODF and DOCX), on top of real-time
  collaboration

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

- Direct PDF export (no print dialog), PDF/A and tagged (accessible) PDF
- Local electronic signatures and signature verification (WebCrypto,
  basic PAdES)
- Text search in PDF

### Files and fidelity

- Real-file corpus (Word and LibreOffice documents) with an automatic
  fidelity report in CI; preserve unknown content on save
- Folder mode: open a local directory (File System Access API) as a
  project, with links between documents and global search
- Crash recovery from an operation log in IndexedDB, beyond autosave
- TextBundle import; upstream MDZ collaboration

### Cross-cutting

- Templates, local version history, command palette
- Accessibility checker
- Encrypted share links
