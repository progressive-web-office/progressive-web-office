# Folders and master documents

## Working on a folder

**Open a folder** (start screen) opens a local folder as a project: its
documents are listed in a panel on the left, by sub-folder. Click a document
to open it; 📁 in the header shows or hides the panel.

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
