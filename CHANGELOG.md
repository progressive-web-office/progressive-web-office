# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Roadmap phases are `0.0.x` milestones (see `ROADMAP.md`).

## [Unreleased]

### Added

- Completion in the notes of a folder (FOLDER-021): `[[` lists the notes to
  link to, `#` the tags already used.

- Templates kept in a folder (FOLDER-020): the documents of its `Templates`
  folder are offered first in the template gallery, and *Save as template…*
  can keep a new one there instead of in the browser.

- Related notes beside the open note: sharing its tags or linked with it
  (FOLDER-019).

- Tags of the notes of a folder (FOLDER-017): front matter `tags` /
  `keywords` and `#tags`, counted in the panel, searched with `#tag`,
  renamed in every note; a graph of the links between the notes (FOLDER-018).

- Git repositories as folders (FOLDER-007): *Open a folder* lists the GitHub
  and GitLab accounts; a branch of a repository opens in the explorer, each
  change (saving, creating, renaming, moving, deleting) being one commit; the
  tree is read in one request; a file changed meanwhile is not overwritten.

- The start screen offers the last five folders opened, not only the last
  one (FOLDER-015); the explorer collapses all its folders and shows the
  open document on request (FOLDER-016).

- File explorer: context menu (right click, Menu key, Shift+F10) with every
  action on the selection (FOLDER-013); copy, cut and paste with Ctrl+C/X/V
  and duplicate (FOLDER-012); download a file, or folders and several
  entries as a ZIP archive, and copy their paths (FOLDER-014).

- Example *Instrument panel* (CODE-016, FILE-018): the anywidget instruments
  installed from their published wheels, knobs and a switch driving a tank, a
  gauge, a thermometer, a LED and a display.

- Example *Interactive widgets* (CODE-016, FILE-018): a reactive Python
  slider (anywidget) driving a plot, and a widget written in a JavaScript
  cell.

- Widgets in code cells (CODE-016): anywidget widgets from Python (anywidget,
  ipywidgets, comm and psygnal bundled; ipywidgets boxes, grid and layouts)
  and from JavaScript cells (`widget`, `display`, `ui`, `importWidget`), each
  in an isolated frame, synchronised both ways; `pwo.ui` re-runs the cells
  using a widget when it changes; `pwo.install` installs wheels from a URL, a
  `wheel.txt` list or the package index after the user allowed the site;
  widgets are kept as pictures when saving and printing. Works with the
  anywidget instruments.

- Dependency graph of the code cells (CODE-015): *View › Dependencies of the
  cells* or 🔀 on a cell shows the cells, coloured by state, and the names
  linking them; a click goes to the cell; also given as a list.

- Reactive code cells (CODE-014): cells run in the order of the names they
  define and use; changing or running a cell marks the cells using it as out
  of date (or runs them, as chosen in *Settings › Writing*); JavaScript cells
  share their top-level names like Python cells; a name defined in several
  cells and cycles are reported; names no cell defines any more are removed.

- File explorer: size and date of each file, sorting by name, date, size or
  type (remembered), files found by name in the folder search (FOLDER-008);
  keyboard navigation in the tree (FOLDER-009); importing files and folders
  of the device by drag and drop or with 📥 (FOLDER-010); selecting several
  entries to delete or move them together, and undoing the last deletion
  (FOLDER-011).

- The code of a cell can be hidden (one cell, or every cell from the View
  menu): only its output is shown, printed and exported; Markdown keeps it
  with `{run hide}`.
- The TypeScript language service for TypeScript and JavaScript files and
  JavaScript cells: typed completions with documentation, errors underlined,
  types under the pointer; loaded on first use, then kept offline.
- Code completion: in code cells (now a real code editor with highlighting,
  indentation and closing brackets) and in source files — keywords,
  built-ins, names of the code, JavaScript/TypeScript standard objects; in
  Python cells, once Python has run, the interpreter's names (variables of
  earlier cells, module members) with signatures and documentation.
- A spinner while waiting: the collaboration looking for the others or
  receiving the document, a code cell running, a long operation.
- Real-time collaboration between devices that cannot connect directly (a
  company network and mobile data, for example): after 15 seconds alone,
  the session also goes through the relays, encrypted with the secret of the
  invitation.
- What QRShare or the share sheet hands over is checked before it opens: a
  file the app opens, whose content is what its name says, shown with where
  it comes from (QRShare address, name, size, format) and opened only when
  confirmed.
- *Receive from another device* opens QRShare's scanner that recognises a
  static QR code (an invitation link) as well as animated ones.
- The collaboration bar tells where the connection is (relays unreachable,
  looking for the others, receiving the document) and what to check after 20
  seconds alone; relays and a TURN server can be set in the settings;
  participants introduce themselves and another app or version is flagged.
- A click on the name of the open file renames it, keeping its extension;
  in a folder or an archive the file is renamed there.
- Settings window (⚙), by category: general (language, theme, your name,
  formats of new files), reading and review (pages side by side, zoom,
  page by page, open PDF files or documents in review mode, remember the
  toolbar's last choice or not), writing and printing.
- The About window names the author.
- Review mode for PDF files too (📖 Review mode, Ctrl+Alt+R, or *correction*
  in the command palette): highlight and note tools named, form tools
  hidden, the annotations panel shown with how to annotate.
- The command palette shows the keyboard shortcut of each command that has
  one, and lists the review mode (also for read-only documents) and the
  review actions with their keys; it is wider, in three columns (command,
  shortcut, place). The review mode is also found by keywords in any
  language (*correction*, *relecture*, *proofreading*…).
- Examples with plots: a lab report with Python cells (fit with error bars,
  damped oscillations, Bode plot, histogram, field map, SymPy) whose output
  and figures are already drawn, and a workbook of measurements with line
  and scatter charts.
- Spreadsheet functions: `EXP`, `LN`, `LOG`, `LOG10`, trigonometric and
  hyperbolic functions, `DEGREES`, `RADIANS`, `SIGN`, `SUMSQ`, `VAR`,
  `VARP`, `STDEV`, `STDEVP`, `SLOPE`, `INTERCEPT`, `RSQ`, `CORREL`.
- Review mode for text documents (📖 Review mode, first in the toolbar, or
  Ctrl+Alt+R): the document shown as
  pages like a PDF file, read-only but open to comments, with the review bar
  of the PDF viewer.
- Page by page reading without scrolling (one spread at a time) for PDF files
  and reviewed documents, keyboard shortcuts to turn the pages (k/j, Space,
  Page Up/Down…), zoom, comment and go from comment to comment, and a full
  screen without distractions (f).
- Cell formatting in spreadsheets: bold, italic, underline, text and fill
  colours, borders and alignment, kept in Excel and OpenDocument files and
  printed. The budget, grade book and invoice templates use it.
- PDF viewer: fit the whole page (its height) and show 2 or more pages
  side by side; find text in the pages (Ctrl+F); highlight text and add
  notes, saved as standard PDF annotations, with a panel listing the
  annotations of the file.
- Pictures inserted in a document ask for their alternative text (or mark
  them as decorative) and an optional numbered caption; a double click edits
  the alternative text.
- Accessibility check of text documents: pictures, headings, tables, links,
  contrast, title and language, with a way to each issue.
- Versions: each save keeps a copy in the browser (the last 30), listed
  under 🕘 History to open, download or name.
- View menu of text documents: readability of each paragraph, focus mode,
  typewriter mode, a word goal with daily statistics and a focus timer.
- Typography as you type (curly quotes per language, dashes, ellipsis,
  French no-break spaces) and a Text menu of transforms: quotes, spacing,
  invisible characters, joining lines pasted from a PDF, case.
- Command palette (Ctrl+Shift+P): find any button or menu entry of the
  screen by typing part of its name.
- Random variants of exercise sheets: values drawn in the text
  (`{{R=rand(10..20)}}`), computed results (`{{=R*2}}`), N sheets and answer
  keys in a ZIP with a CSV of the values.
- Exercise sheets and answer keys from one document: mark paragraphs as
  solutions, hide them, and save the sheet without them; kept in Word,
  OpenDocument and Markdown (`::: solution`) files.
- Tracked changes in text documents: record insertions and deletions with
  their author, accept or reject them one by one or all at once; kept in
  Word, OpenDocument and Markdown (CriticMarkup) files.
- Comments in text documents: comment the selection or the word at the
  cursor (Ctrl+Alt+M), reply, resolve and delete, with the threads beside
  the page. Comments are kept in Word (with replies and resolved state),
  OpenDocument (LibreOffice annotations) and Markdown (CriticMarkup) files.
- ZIP archives open as a folder in the side panel: documents, source files
  and pictures open from it, archives inside the archive are folders too,
  other files can be downloaded, and the archive can be downloaded with its
  changes. Files are decompressed only when opened.
- Text and source files (C, C++, Python, Java, JavaScript, R, MATLAB, SQL
  and many more) open in a code editor with syntax colouring, line numbers,
  folding and search, built on CodeMirror. They are saved under their own
  name, keeping their line ends.
- Review comments on lines of source files, written in the code as comments
  of its language (`# REVIEW(Prof): …`) and listed in a panel.
- Pictures open in a viewer, fitted to the window or at their own size.
- Autofilter in spreadsheets: ▾ buttons in the headings of a table to choose
  the values shown in each column; the filter and the rows it hides are kept
  in Excel and OpenDocument files.

### Changed

- The lab template keeps each name in one cell (CODE-014).

- The review mode is one switch for every file, also in the settings.
- One name for the user, asked once: comments, annotations, tracked
  changes and collaboration use it (no more random collaboration name
  signing comments).

### Fixed

- A name changed in the settings during a collaboration was not shown to
  the others; the name is now asked in a window of the page instead of the
  browser's prompt, which froze the page and could drop the connection.
- Devices of a real-time collaboration could fail to find each other, even
  on the same network: the few relays picked by the connection library
  included some that no longer pass messages on. A list of well-known relays
  is now used, all at once; relays refusing the messages are reported.
- A file renamed in the app kept its old name in the recent files and lost
  its versions; the recent files now also keep the content saved last.
- Tracked changes typed or deleted across a second boundary were split
  into several changes: they now join the neighbouring change of the same
  author.
- The review bar of text documents was shown outside the review mode.
- Pictures linked from a Markdown note opened from a folder or an archive
  (relative paths with spaces or accents, `<img>` tags, `![[name]]` embeds)
  are shown, kept as links when the note is saved back and included in the
  MDZ, Word and OpenDocument exports.
- *Save as* after opening a folder no longer writes the new file into the
  folder.
- The offer to reopen the last folder on the start screen can be removed.
- Frozen numeric cells scrolled away with the sheet.
- The "Working…" indicator could stay on screen after opening a ZIP
  archive.

## [0.1.0] - 2026-10-02

First minor release: everything since 0.0.13, summed up in the README.

### Added

- Slide size and orientation in presentations: 16:9, 4:3, A4 or Letter,
  landscape or portrait; shapes and text follow, and printing uses the
  orientation of the slides.
- A *Race signs* template: start, arrows, kilometre marks, water station and
  finish in very large letters, one A4 page each.
- Template files: `.ott`, `.ots`, `.otp`, `.dotx`, `.xltx` and `.potx` open as
  new, untitled documents (saving never changes the template), and *Save
  as… › Save as template file* writes them.
- Templates and examples (🧩 on the start screen): letter, report, meeting
  minutes, exercise sheet, budget, grade book, invoice and talk, plus an
  example document touring the word processor, in English or French; your
  own templates saved from any document (*Save as template…*) and kept in
  the browser.
- Freeze panes in spreadsheets (❄): the rows above and the columns left of
  the active cell stay in view; kept in Excel and OpenDocument files.
- Sort a spreadsheet range (⇅ *Sort…*) by a column, ascending or
  descending, with a header row detected and kept in place.
- Page numbering styles in text documents: `1, 2, 3`, roman numerals or
  letters, a chosen first number, no header and footer on a title page, and
  ready-made footers (`1`, `1/10`, `- 1 -`, `Page 1 of 10`). Printed, and
  kept in Word, OpenDocument, LaTeX and Markdown files.
- The About window lists the open-source components of the build with
  their exact versions, licences and project pages; **Copy details**
  includes the versions in the report.
- Any font size can be typed (1 to 999 pt) in text documents and
  presentations; the usual sizes are suggested, and the arrow keys step
  through them and beyond (by 20 % past the largest). In a presentation, a
  size typed while editing a text box applies to the selected text.
- Synchronise a text document without a network (🔄 *Sync by QR*): two
  devices, one of them never connected, merge their changes character by
  character through QR codes shown and scanned with QRShare (three short
  passes, or one to send the whole document), or through files of codes.
  Devices introduce themselves with a signed key and a fingerprint; changes
  are summarised before being applied, checked on a copy first, and logged.
- QRShare handoff protocol version 2, when QRShare announces it: the app
  can ask for a send mode (animated QR codes without the choice screen) and
  get a received file back in its own window, from QRShare's origin only.
- A document identifier (UUID) kept in DOCX (`dc:identifier`), ODT (a
  user-defined property) and Markdown front matter (`identifier`), for the
  offline synchronisation of a document between devices. It is not shown in
  the properties dialog.
- Documents that are not small text are handed to QRShare inside the browser
  (QRShare app handoff protocol), without a download; QRShare can hand received
  files back to Progressive Web Office, which accepts them only from the
  configured QRShare. Support is read from QRShare's web app manifest: an
  older QRShare gets the download and its "Prepare a transfer" screen right
  away, instead of a screen saying that no data was provided.
- "Share with another app…" in the send dialog opens the system share sheet.
- Light / dark / system theme: a toolbar button cycles between following the
  device setting, light and dark; the choice is remembered.
- Character and paragraph formatting in text documents: font, size, text
  colour, highlight, clear formatting (Ctrl+Space), indent / outdent
  (Ctrl+] / Ctrl+[), line spacing, and a paragraph spacing dialog (left and
  first-line indents, space before and after). Kept in DOCX and ODT, and
  read from them as direct formatting only.
- Header and footer in text documents (▤): left, centre and right parts
  with page number, page count, title and date fields; shown around the
  page, printed on every page (CSS page margin boxes), kept in DOCX, ODT,
  LaTeX (fancyhdr) and Markdown front matter, shared in collaboration.
- Tables in text documents: a table bar (shown while the cursor is in a
  table) inserts and deletes rows and columns, merges and splits cells,
  toggles a header row (repeated on each printed page) and deletes the
  table. Merged cells and header rows are kept in DOCX, ODT, HTML and LaTeX
  (`\multicolumn` / `\multirow`); Markdown tables are read with their header
  row.
- Captions and cross-references in text documents: 🏷 numbers figures,
  tables and equations (Caption style, numbers in document order), ↪ inserts
  a reference to a figure, table, equation or heading that follows
  renumbering and shows `??` when its target is deleted. Kept as SEQ/REF
  fields and bookmarks in DOCX, sequences and bookmark references in ODT,
  `\captionof` / `equation` / `\label` / `\ref` / `\eqref` / `\nameref` in
  LaTeX, and anchors, links and `\tag` in Markdown; read back from Word,
  LibreOffice and LaTeX files (`figure` and `table` floats included).
- Citations and bibliography in text documents: 📚 imports BibTeX sources
  (or pasted entries) and sets numbered or author-year citations, ❝ cites
  one or more sources with a page, and the list of references follows the
  citations. Kept as Word sources with CITATION and BIBLIOGRAPHY fields,
  OpenDocument bibliography marks and index, LaTeX `\cite` / `\citep` with
  `references.bib` (also embedded in the `.tex` with `filecontents`), and
  pandoc citations with `references:` in Markdown; read back from these
  formats, from Zotero and Mendeley citations in Word files and from
  `thebibliography`.
- Folder mode: *Open a folder* lists the documents of a local folder in a
  side panel; Save writes back into the folder (Chromium; read-only
  elsewhere), *Search the folder* finds a word in all its documents and opens
  them at the match, Ctrl+click follows relative links between documents,
  and the folder is offered again on the start screen.
- Master documents: 📄 includes a sub-document of the folder, *Assemble…*
  saves the master document with its sub-documents as one file, numbering,
  cross-references and bibliography running on across chapters. Kept as
  OpenDocument linked sections (`.odm` opens too), Word sub-documents, LaTeX
  `\include` and Markdown `{{#include …}}`.
- File explorer in the folder panel: new document, new folder, rename (F2),
  delete (Del) and move by drag and drop, the open document following a
  rename or a move; sub-folders load when opened. It is built on `src/fs/`,
  a storage-independent module (a `StorageProvider` interface with local
  folder, browser storage (OPFS), read-only folder and memory providers, and
  a framework-free explorer component) meant to be shared with other apps.
- *Open a folder* offers a folder of the device, the browser's own storage
  (kept across visits, available offline and shared with QRShare) or a
  Nextcloud / WebDAV account, which the explorer manages too (folders
  created, files renamed, moved and deleted on the server).
- Read-only documents: 🔓 shows the open document, spreadsheet or
  presentation read-only (toolbars hidden, no changes, Save refused) with a
  banner offering Edit and Edit a copy; documents of a read-only folder
  always open read-only, editable only as a copy.
- Linked Markdown notes in folders: `[[note]]`, `[[note#heading]]` and
  `[[note|text]]` links (Ctrl+click, by name or front matter alias, a missing
  note created on demand), `![[picture]]` embeds and pictures of the folder
  shown in notes, backlinks in the folder panel, and links updated when a
  note is renamed. The explorer's selection follows the open document.
- Links to a document on a server: 🔗 checks a web address and makes a link
  (and QR code) that opens the document read-only, optionally pinned to that
  version by its SHA-256 fingerprint, a changed file being refused.
- Table of contents in text documents (§): generated from the headings,
  updated as you type, entries jump to their heading. Written as Word's TOC
  field (recomputed with page numbers when Word opens the file), an ODF
  table of contents, `[[_TOC_]]` in Markdown and `\tableofcontents` in
  LaTeX, and read back from all of them.
- Footnotes in text documents (¹, Ctrl+Alt+F): numbered automatically,
  listed under the page and printed at the end, edited in simple Markdown
  (formatting, links, equations, paragraphs). Kept in DOCX, ODT, Markdown
  (`[^1]`, and `^[…]` on import) and LaTeX (`\footnote`); LaTeX footnotes
  used to be imported as text in brackets.
- Page breaks in text documents (⤓, Ctrl+Enter), shown as a labelled
  dashed line and starting a new page when printing; kept in DOCX (also
  read when inside a paragraph or set as "page break before"), ODT,
  Markdown (`\newpage`) and LaTeX. LaTeX import also reads full-width
  `\rule` lines as horizontal rules.
- Find and replace in text documents (🔍, Ctrl+F / Ctrl+H): highlighted
  matches with a count, match case, whole words, regular expressions with
  `$1` groups, replace one or all in a single undoable step.
- About window (**?** in the toolbar, *About* on the start screen): version,
  git commit and build date, licence, installed / offline status, a QR code
  of the app address to open it on another device (click it to show it full
  screen, easier to scan), links to the
  documentation, source code, changelog, requirements and problem reports,
  and *Copy details* for a bug report. The version and short git commit
  (e.g. `v0.0.13 (6cae6fc)`) are also shown next to the name in the toolbar
  and on the start screen, as in QRShare.
- Real-time collaboration on text documents and spreadsheets (👥): an
  invitation link opens the same document for others; edits are merged per
  cell or paragraph, peer to peer (WebRTC, end-to-end encrypted, introduced
  through public Nostr relays), with no server storing the document. The bar
  shows who is here — compound names like *Swift Crimson Falcon* in a matching
  colour — and where each person works; shared named versions with author and
  date can be restored for everyone; every participant keeps the document and
  history on their device, so a reload rejoins the session. The engine is the
  `@scelles/collab` package shared with QRShare. The invitation can be sent
  as a QR code (also full screen, for a projector), copied, through the
  system share sheet, by email, or with QRShare (QR code, nearby devices,
  offline transfer).

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
- PDF forms: **Save as… → Flattened PDF – fields locked** writes a copy
  (`…-flattened.pdf`) whose answers can no longer be changed, while **Save**
  keeps the fields editable for later changes.
- Code cells in text documents (**{ }** in the toolbar): Python (Pyodide,
  with numpy, matplotlib and the other Pyodide packages) and JavaScript, run on
  request in an isolated sandbox with no network access and no access to the
  application, your files or your keys. A confirmation explains this before
  the first run; ■ stops a cell at any time. Printed output, errors and
  matplotlib figures are kept in the document, as `{run}` / `{output}` blocks in
  Markdown and MDZ, and as code and pictures in Word, OpenDocument and LaTeX.
  The Python runtime is served by the application and, like the packages
  (downloaded from the Pyodide CDN on first use), kept for offline use.
- **Spreadsheet charts** (📊): columns, bars, lines, pie and scatter, from the
  selection or the data block around the active cell, with a live preview.
  Charts update with the data, can be moved, resized, edited, deleted and
  copied as an image (to paste into a document or a slide), are printed, and
  are saved as native charts in XLSX and ODS. The AI assistant can add charts.
- **Nextcloud / WebDAV** (start screen, and **☁** to save any document): open
  and save files on Nextcloud, ownCloud or any WebDAV server. Saving never
  overwrites a file changed by someone else meanwhile: a copy is offered
  instead. Accounts (app password) stay in this browser; the guide explains the
  CORS setup of the server.
- **Choice of AI provider** for the assistant (⚙): Anthropic (Claude), OpenAI,
  Mistral AI, Albert (API de l’État), a local Ollama server, or any server
  offering the OpenAI chat completions API (LM Studio, vLLM, OpenRouter…).
  Each provider keeps its own key, model and address; all get the same
  document tools, confirmations and undo. Local servers on `localhost` are
  allowed over HTTP.
- **Links containing a document** (📲 → *Copy link*): a short document is
  compressed into the address itself (after the `#`, never sent to a server);
  opening the link rebuilds the document. Text documents travel as Markdown.
- **Open from Grist** (start screen): open a document of a (self-hosted)
  Grist server as a workbook, one sheet per table; **Save** sends the changed
  cells, new rows and, after confirmation, deleted rows back to Grist, then
  reloads the document. Accounts (server address and API key) stay in this
  browser. The guide explains the CORS setup of the server.
- The start screen links to the documentation, and the documentation has an
  **Open the app** link (navigation bar and home page).
- MDZ manifest schema: optional `subject`, `description`, `keywords`,
  `language` and `license` fields.

- Integration tests against a real QRShare build (`just e2e-qrshare`, and a
  dedicated CI job): the document sent to QRShare's transfer chooser is
  checked byte for byte, encoded as a static QR code and decoded back; the
  "Prepare a transfer" and receive screens are checked too.

### Changed

- The start screen cards have icons (📝 document, 📊 spreadsheet, 📽️
  presentation, 📂 open, 🗂️ repository, 📲 receive, ☁️ cloud, 🗃️ Grist);
  they are decorative and do not change the buttons' names for screen
  readers.

- New text editor engine (ProseMirror) instead of the browser's editing
  commands: the document is edited as a structure through transactions, so
  editing behaves the same in every browser, undo/redo is reliable, and
  collaboration merges precisely. Typing `# `, `## `, `- `, `1. `, `> ` or
  ` ``` ` at the start of a line creates a heading, list, quote or code
  block; Tab / Shift+Tab indent list items or move between table cells;
  Enter on an empty list item leaves the list; Shift+Enter inserts a line
  break; Ctrl+Alt+1…3 apply heading styles. Pasted content from other
  applications keeps headings, lists and formatting and drops the rest.
  Toolbar buttons keep the focus in the document, and a key pressed right
  after moving the caret acts at the new position.

- Open formats first: new documents, spreadsheets and presentations are
  created as OpenDocument files (`.odt`, `.ods`, `.odp`) instead of
  Microsoft Office ones, and *Save as* lists the open format first. "New
  files in" on the start screen switches to Microsoft Office formats; an
  opened file still keeps its format.

- PDF forms: the little-noticed **Flatten** checkbox of the PDF toolbar is
  replaced by the "Flattened PDF" entry of **Save as…**.
- Recent files show the date and time they were last opened, in the interface
  language (previously only the date, in the browser's language).
- The project is now licensed under the GNU Affero General Public License
  v3.0 or later (previously MIT); the start screen links to the source code.
- Clearer wording for saving the AI assistant's API key.

### Fixed

- Phones: the header keeps one line (Save, and the other actions in a “⋯”
  menu) and editing toolbars one row that scrolls sideways, instead of
  covering most of the screen above the keyboard.
- Side panels (assistant, folder) no longer cover the second line of the
  header when it wraps on narrow windows.

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
