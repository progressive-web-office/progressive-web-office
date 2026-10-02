# Folders and master documents

## Working on a folder

**Open a folder** (start screen) opens a local folder as a project: its
documents are listed in a panel on the left, by sub-folder (a sub-folder
opens when you click it). Click a document to open it; 📁 in the header
shows or hides the panel.

The panel's toolbar manages the folder:

| Button | Action |
|--------|--------|
| ＋ | new document, in the selected folder, opened right away |
| 📁＋ | new folder |
| ✎ | rename the selected file or folder (<kbd>F2</kbd>) |
| 🗑 | delete it, after confirmation (<kbd>Del</kbd>) |
| ↻ | reload the folder |

Drag a file or folder onto another folder (or onto the empty space below the
tree, for the top of the folder) to move it. The open document follows when
it is renamed or moved.

- **Save** writes the document back into the folder, in place. *Save as*
  another format writes the converted file next to it, in the same folder.
- **Search the folder** looks for a word in all its documents at once
  (Markdown, LaTeX, text, BibTeX, Word, OpenDocument), ignoring case and
  accents. Click a result to open the document at the first match.
- **Links between documents**: a link to another file of the folder
  (`[chapter 1](chapters/one.md)`, a relative link in a Word or OpenDocument
  file) opens that document with <kbd>Ctrl</kbd>+click
  (<kbd>⌘</kbd>+click on macOS). Links to web pages open in a new tab.
- The folder is remembered: the start screen offers to reopen it (the
  browser asks again for permission).

Chromium-based browsers (Chrome, Edge, Opera…) read and write the folder in
place. Other browsers open it **read-only**: documents can be read and
searched, and Save downloads a copy.

Hidden folders (`.git`…) and `node_modules` are left out.

## Master documents

A **master document** gathers **sub-documents** — the chapters of a thesis,
a report or a course handout — that stay separate files, written separately,
possibly by different people.

- 📄 (*Include a document*) adds a sub-document at the cursor: choose a
  document of the folder. It shows as a frame with the path of the file and
  an **Open** button.
- **Assemble…** (in the header, for a document with sub-documents) saves the
  master document with the content of its sub-documents as **one file**, in
  the format you choose. Sub-documents may include others; numbering of
  figures, tables and equations, cross-references, footnotes and the
  bibliography run on across them. A missing sub-document, or one that
  includes itself, is reported and left out.

Sub-documents can be in any text format (`.md`, `.odt`, `.docx`, `.tex`…),
mixed in one master document. They are kept as:

| Format | Sub-document |
|--------|--------------|
| OpenDocument (`.odt`, `.odm`) | linked section, as in LibreOffice master documents |
| Word (`.docx`) | Word sub-document (`subDoc`) |
| LaTeX | `\include{chapter}` (`.tex` chapters) |
| Markdown | <code v-pre>{{#include chapters/one.md}}</code> on its own line (mdBook syntax) |

LibreOffice master documents (`.odm`) and LaTeX projects split with
`\include` / `\input` open as master documents. A LaTeX project opened as a
ZIP archive is read with its chapters already in place.

## For developers: the file system module

The explorer is built on `src/fs/`, a module that depends on nothing else in
the application, to be shared later with other web apps (such as QRShare).
It defines one `StorageProvider` interface (`list`, `read`, `write`,
`mkdir`, `move`, `remove`, with `write` and `persistentAccess`
capabilities) and providers for a local folder (File System Access API), the
browser's private storage (OPFS, shared by the apps of the same origin), a
read-only folder picked in any browser and memory, plus a framework-free
`Explorer` component whose texts and icons are given by the host.
