# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Roadmap phases are `0.0.x` milestones (see `ROADMAP.md`).

## [Unreleased]

### Added

- Documents that are not small text are handed to QRShare inside the browser
  (QRShare app handoff protocol), without a download; QRShare can hand received
  files back to Progressive Web Office, which accepts them only from the
  configured QRShare. Support is read from QRShare's web app manifest: an
  older QRShare gets the download and its "Prepare a transfer" screen right
  away, instead of a screen saying that no data was provided.
- "Share with another app…" in the send dialog opens the system share sheet.
- Light / dark / system theme: a toolbar button cycles between following the
  device setting, light and dark; the choice is remembered.

- Document properties (ⓘ in the text editor): title, author, date, subject,
  description, keywords, language and licence, read and written in Word and
  PowerPoint/Excel core properties, OpenDocument `meta.xml`, the MDZ manifest,
  LaTeX (title page and PDF properties) and the YAML front matter of Markdown
  files, whose other keys are preserved. The original creation date is kept
  instead of being reset on every save.
- Mermaid diagrams in text documents (⧉, <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd>):
  flowcharts, sequence, class, state, entity-relationship, Gantt, pie and mind
  map diagrams, edited in a dialog with templates and a live preview, rendered
  offline in strict security mode. Stored as ```` ```mermaid ```` blocks in
  Markdown and MDZ, and as PNG pictures carrying their source in Word,
  OpenDocument and LaTeX projects, so they stay editable after a round trip.
- MDZ manifest schema: optional `subject`, `description`, `keywords`,
  `language` and `license` fields.

### Changed

- Recent files show the date and time they were last opened, in the interface
  language (previously only the date, in the browser's language).

- Integration tests against a real QRShare build (`just e2e-qrshare`, and a
  dedicated CI job): the document sent to QRShare's transfer chooser is
  checked byte for byte, encoded as a static QR code and decoded back; the
  "Prepare a transfer" and receive screens are checked too.

### Changed

- The project is now licensed under the GNU Affero General Public License
  v3.0 or later (previously MIT); the start screen links to the source code.
- Clearer wording for saving the AI assistant's API key.

### Fixed

- Equation editor on phones and tablets: MathLive's virtual keyboard was shown
  behind the modal dialog and could not be used; it now opens above it, docked
  at the bottom of the screen.

## [0.0.13] - 2026-10-01

### Added

- AI assistant panel powered by Claude (bring your own Anthropic API key):
  reads and edits text documents (Markdown blocks, find/replace, LaTeX
  equations), spreadsheets (values and formulas, sheets) and presentations
  (slide text, new slides, text boxes) through validated tools, with
  streaming answers and the list of actions taken.
- Explicit consent before any content is sent, showing provider and model;
  the API key is used for the current session only unless the user saves it
  in the browser; configurable model and effort; automatic server-side
  fallback when a request is declined.
- "Undo the assistant's changes" after each request (plus step-by-step undo
  in spreadsheets and presentations).
- WebMCP: the same tools are registered for in-browser AI agents
  (`document.modelContext` / `navigator.modelContext`), with user approval
  for every modification.

## [0.0.12] - 2026-10-01

### Added

- "Send to another device" with [QRShare](https://github.com/s-celles/QRShare):
  small text documents open directly in QRShare's send screen, other files go
  through the system share sheet, or are downloaded while QRShare's
  "Prepare a transfer" screen opens. Transfer policy (air-gapped only, prefer
  air-gapped, any) and QRShare address are configurable and remembered.
- "Receive from another device" opens QRShare's receive screen.
- Web Share Target: files (and text) shared from QRShare or any other app open
  directly in the installed application.

## [0.0.11] - 2026-10-01

### Added

- Git repositories: connect GitHub (github.com or Enterprise) and GitLab
  (gitlab.com or self-hosted) accounts with a personal access token kept in
  this browser only, browse repositories, branches and folders, and open any
  supported file.
- Saving a document opened from a repository commits it to the same path and
  branch, with an editable Conventional Commits message and optional new
  branch; any document can be committed to a chosen repository location.
- Conflict protection: when the file changed in the repository, the commit is
  refused and the document can be saved on a new branch or as a copy.

### Changed

- The Content-Security-Policy allows HTTPS connections (`connect-src https:`)
  for git hosting and AI provider APIs.

## [0.0.10] - 2026-10-01

### Added

- LaTeX export: a compilable `article` (`.tex`), or a ZIP project with
  `main.tex` and an `images/` folder when the document contains pictures.
  Works with pdfLaTeX, XeLaTeX and LuaLaTeX (Chinese text uses `xeCJK`).
- LaTeX import of `.tex` files and ZIP projects (main file detection,
  `\input`/`\include`, `\includegraphics` without extension): sectioning,
  formatting, lists, tables, links, quotes, verbatim, inline and display
  equations (`equation`, `align`...), title and author, accents and TeX
  ligatures. Unsupported commands and environments stay visible as source.
- Typing `$…$` (or `$$…$$`) in a text document creates an equation.
- Equations written as `$…$` in spreadsheet cells and slide text boxes are
  rendered with MathLive (on screen, in slideshows and when printing).

## [0.0.9] - 2026-10-01

### Added

- Print preview with paper size (A4, Letter, A3, A5), orientation and
  margins, remembered between sessions; printing happens from an isolated
  frame so the application interface is never printed.
- Print layouts: paginated documents (headings kept with their paragraph,
  tables/images/equations not split), spreadsheets (current or all sheets,
  grid lines, row/column headings repeated on each page) and presentations
  (1, 2, 4 or 6 slides per page, optional speaker notes).
- "Save as PDF" guidance in the preview.

## [0.0.8] - 2026-10-01

### Added

- Interface translated into French and Simplified Chinese (English remains
  the reference), with automatic detection from the browser, a language
  selector on the start screen, persistence and `<html lang>` updates.
- Catalog completeness and placeholder consistency tests; end-to-end tests in
  French and Chinese.
- Specification of milestones 0.0.8-0.0.13 (i18n, printing, LaTeX, git,
  QRShare, AI assistant); LaTeX equations become a Must requirement.

## [0.0.7] - 2026-10-01

### Added

- Mathematical equations in text documents: insert and edit them with a
  MathLive math field (keyboard, virtual keyboard, LaTeX source), inline or
  display, rendered offline with bundled fonts.
- Markdown/MDZ `$…$` and `$$…$$` support (pandoc-style delimiter rules).
- ODT: equations embedded as MathML formula objects with a LaTeX
  annotation; DOCX: equations written and read as Office Math (OMML).
- MathML → LaTeX, MathML → OMML and OMML → LaTeX converters.

### Changed

- Saving a text document is asynchronous (equations are converted first).

## [0.0.6] - 2026-10-01

### Added

- Recent files on the start screen, stored in IndexedDB (reopen, remove,
  clear).
- Autosaved drafts every 30 seconds while a document has unsaved changes,
  with a restore banner on the start screen.
- End-to-end tests for recent files, offline start-up (service worker) and
  the web app manifest.

### Fixed

- Buttons with an empty visible label now always get an accessible name.

## [0.0.5] - 2026-10-01

### Added

- Presentations: open, edit and save PowerPoint (`.pptx`) and OpenDocument
  (`.odp`) files, with conversion between them.
- PPTX reader with placeholder geometry inheritance (layout, master), group
  transforms, theme colours, bullets, pictures, backgrounds and speaker notes;
  minimal conformant PPTX writer (master, layout, theme, notes master).
- ODP reader/writer with graphic, text, paragraph and list styles.
- Slide editor: thumbnails, add/duplicate/move/delete slides, text boxes,
  rectangles, ellipses and images, drag/resize/keyboard moves, in-place text
  editing with bold/italic/underline, font size, colour, alignment and
  bullets, fill colour, stacking order, undo/redo, speaker notes, printing.
- Full-screen slideshow with keyboard, click and right-click navigation.
- Rich-text runs carry an optional font size and colour.

## [0.0.4] - 2026-10-01

### Added

- PDF viewer (pdf.js): lazy page rendering, navigation, zoom and fit to
  width, selectable text layer, offline fonts/CMaps/decoders.
- PDF form filling: text fields, checkboxes, radio buttons, drop-down and
  list boxes, saved with regenerated appearances; optional flattening.
- Handwritten signatures: drawing pad (mouse, touch, stylus with pressure)
  or image import, placed, moved (pointer or keyboard) and resized on the
  page, embedded as images when saving; free text stamps.
- Encrypted and XFA PDFs are shown read-only with an explanation.

### Changed

- Editor views may save asynchronously.

## [0.0.3] - 2026-10-01

### Added

- Spreadsheets: open, edit and save Excel (`.xlsx`), OpenDocument (`.ods`)
  and CSV/TSV files, with conversion between them.
- Formula engine: A1 references, ranges, whole columns/rows, cross-sheet
  references, operators with Excel precedence, 45 functions, error values
  and circular reference detection, automatic recalculation.
- Grid editor: virtualized rows, formula bar, keyboard navigation,
  selection statistics, undo/redo, copy/cut/paste as tab-separated text,
  number formats, AutoSum, sheet tabs (add, rename, delete), row/column
  insertion and deletion with reference updates, printing of the used range.
- OpenFormula translation for ODS, shared formulas and `_xlfn.` prefixes
  for XLSX, number formats and column widths in both formats.
- CSV: delimiter detection, Windows-1252 fallback, no formula creation on
  import (CSV injection protection).
- Requirements for mathematical equations (MathLive) planned as 0.0.7.

## [0.0.2] - 2026-10-01

### Added

- Text documents: open, edit and save Word (`.docx`), OpenDocument Text
  (`.odt`), Markdown (`.md`) and MDZ (`.mdz`) files, with conversion between
  them ("Save as").
- Format-neutral rich-text model: headings, bold/italic/underline/strike,
  inline code, links, nested lists, tables, quotes, code blocks, rules and
  embedded images.
- WYSIWYG editor: toolbar, keyboard shortcuts, paragraph styles, lists,
  alignment, links, images (insert, paste, drop), tables, word count.
- Paste sanitisation to the supported subset (no scripts, handlers or
  unsafe URLs).
- MDZ support compatible with the wflixu/mdz specification v1.1.0, a JSON
  Schema for the manifest (published with the docs), and import of plain ZIP
  archives of Markdown files (entry document chosen by the user when
  ambiguous).
- End-to-end smoke tests with Playwright; CI workflow and GitHub Pages
  deployment of the app and documentation.
- Public requirements specification (EARS + MoSCoW) in the documentation.

### Changed

- The application is named Progressive Web Office (short name PWO).

## [0.0.1] - 2026-10-01

### Added

- Project scaffold: TypeScript (strict), Vite, Vitest (jsdom), VitePress docs.
- Progressive Web App: web app manifest, offline service worker (Workbox),
  update prompt, File Handling API registration and launch queue.
- Application shell: start screen (new document / spreadsheet / presentation,
  open file), drag & drop, keyboard shortcuts (Ctrl+O, Ctrl+S), status bar,
  unsaved-changes warning, light/dark theme, progress indicator.
- Content-based format detection for DOCX, ODT, Markdown, MDZ (and plain ZIP
  of Markdown), XLSX, ODS, CSV/TSV, PPTX, ODP and PDF, with a 50 MB size limit.
- Content-Security-Policy injected in production builds.
- `justfile` entry points, documentation with generated `llms.txt` and
  `llms-full.txt`.
- Governance: MIT license, security policy (GHSA), Contributor Covenant 3.0.

[Unreleased]: https://github.com/s-celles/progressive-web-office/compare/main...HEAD
[0.0.9]: https://github.com/s-celles/progressive-web-office/commits/main
[0.0.8]: https://github.com/s-celles/progressive-web-office/commits/main
[0.0.7]: https://github.com/s-celles/progressive-web-office/commits/main
[0.0.6]: https://github.com/s-celles/progressive-web-office/commits/main
[0.0.5]: https://github.com/s-celles/progressive-web-office/commits/main
[0.0.4]: https://github.com/s-celles/progressive-web-office/commits/main
[0.0.3]: https://github.com/s-celles/progressive-web-office/commits/main
[0.0.2]: https://github.com/s-celles/progressive-web-office/commits/main
[0.0.1]: https://github.com/s-celles/progressive-web-office/commits/main
