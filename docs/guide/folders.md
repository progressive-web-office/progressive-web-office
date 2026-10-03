# Folders and master documents

## Working on a folder

**Open a folder** (start screen) asks where the documents are:

- **a folder of this device**;
- **browser storage**: a space kept by the browser for this site, with
  nothing to choose or allow, available offline and to the other apps of the
  same site (QRShare); clearing the site's data erases it;
- a **Nextcloud / WebDAV** account added with ☁ (see
  [Nextcloud / WebDAV](./cloud.md));
- a **Git repository** (GitHub, GitLab) of an account added with
  **Open from repository…** (see [Git repositories](./git.md)): choose the
  repository and the branch.

It then opens it as a project: its
documents are listed in a panel on the left, by sub-folder (a sub-folder
opens when you click it). Click a document to open it; 📁 in the header
shows or hides the panel.

The panel's toolbar manages the folder:

| Button | Action |
|--------|--------|
| ＋ | new document, in the selected folder, opened right away |
| 📁＋ | new folder |
| 📥 | import files of this device into the selected folder |
| ✎ | rename the selected file or folder (<kbd>F2</kbd>) |
| 🗑 | delete the selected files and folders, after confirmation (<kbd>Del</kbd>) |
| ↻ | reload the folder |
| ⊟ | collapse all the folders |
| ◎ | show the open document in the tree |
| *Sort by* | order by name, date (newest first), size (largest first) or type; folders stay first, and the choice is remembered |

Each file shows its size and the date it was last changed (the full date in
its tooltip).

Drag a file or folder onto another folder (or onto the empty space below the
tree, for the top of the folder) to move it. The open document follows when
it is renamed or moved.

**Importing files**: drop files or folders from the desktop onto the tree
(onto a folder, or onto a file to import next to it), or use 📥. A name
already taken gets a number (`notes 2.md`).

**Context menu**: a right click on an entry (or the <kbd>Menu</kbd> key, or
<kbd>Shift</kbd>+<kbd>F10</kbd>) lists what can be done with it: open,
rename, duplicate, copy, cut, paste, download, copy the path, delete; on the
empty space below the tree, new document, new folder, import and paste.

**Copy, cut and paste**: <kbd>Ctrl</kbd>+<kbd>C</kbd>,
<kbd>Ctrl</kbd>+<kbd>X</kbd> then <kbd>Ctrl</kbd>+<kbd>V</kbd> in the tree
(or the context menu) copy or move the selected files and folders into the
selected folder; a name already taken gets a number. *Duplicate* makes a copy
next to the original (`plan 2.md`).

**Download**: a file is downloaded as it is; a folder, or several entries,
as a ZIP archive.

**Several at once**: <kbd>Ctrl</kbd>+click (<kbd>⌘</kbd>+click on macOS)
adds or removes an entry, <kbd>Shift</kbd>+click selects a range,
<kbd>Ctrl</kbd>+<kbd>A</kbd> selects every entry shown. Deleting or dragging
then acts on all of them.

**Undoing a deletion**: after a deletion, *Undo* (or <kbd>Ctrl</kbd>+<kbd>Z</kbd>
in the tree) puts the files back. Deletions larger than 64 MB cannot be
undone; the confirmation says so.

**Keyboard**: in the tree, <kbd>↑</kbd> <kbd>↓</kbd> move,
<kbd>Home</kbd> <kbd>End</kbd> go to the first and last entry,
<kbd>→</kbd> opens a folder (then goes into it), <kbd>←</kbd> closes it (or
goes to its parent), <kbd>Enter</kbd> opens a document,
<kbd>Shift</kbd>+<kbd>↑</kbd>/<kbd>↓</kbd> extends the selection.

- **Save** writes the document back into the folder, in place. *Save as*
  writes a new file wherever you choose (it is not added to the folder);
  the document then follows that new file.
- **Search the folder** first lists the files whose **name** contains the
  words, then looks for them in all its documents at once (Markdown, LaTeX,
  text, BibTeX, Word, OpenDocument), ignoring case and accents. Click a
  result to open the document at the first match.
- **Links between documents**: a link to another file of the folder
  (`[chapter 1](chapters/one.md)`, a relative link in a Word or OpenDocument
  file) opens that document with <kbd>Ctrl</kbd>+click
  (<kbd>⌘</kbd>+click on macOS). Links to web pages open in a new tab.
- The folders are remembered: the start screen offers to reopen the last
  five folders of the device (the browser asks again for permission). The ✕
  next to one forgets it; the folder itself is not touched.

Chromium-based browsers (Chrome, Edge, Opera…) read and write the folder in
place. Other browsers open it **read-only**: documents can be read and
searched, and Save downloads a copy.

Hidden folders (`.git`…) and `node_modules` are left out.

## Linked notes

A folder of Markdown notes works as a set of linked notes:

- `[[Note]]` links to the note `Note.md` (in the same folder first, then
  anywhere in the folder, then by one of its `aliases:` in the front matter);
  `[[Note#Heading]]` goes to a heading, `[[Note|shown text]]` shows another
  text. <kbd>Ctrl</kbd>+click follows the link; a link to a note that does
  not exist yet offers to create it.
- Typing `[[` lists the notes of the folder, those whose name starts with
  what you type first; typing `#` and a letter lists the tags already used.
  <kbd>↑</kbd>/<kbd>↓</kbd> choose, <kbd>Enter</kbd> or <kbd>Tab</kbd>
  insert, <kbd>Esc</kbd> closes the list.
- `![[picture.png]]` shows a picture of the folder; `![[Note]]` is kept as a
  link to that note.
- The panel lists the notes **linked from** the open note (backlinks), and
  the **related notes**: those sharing its tags or linked with it either
  way, the closest first, with the shared tags.
- Renaming a note in the panel updates the `[[links]]` to it in the other
  notes.
- The YAML front matter of each note (tags, aliases, any key) is kept as it
  is.

### Tags

**Tags** (below the tree) lists the tags of the notes, the most used first
with the number of notes: the `tags` (or `keywords`) of their front matter,
and `#tags` written in the text (`#todo`, nested `#course/semester-1`; not
in code, links, headings or colours like `#fff`). Click a tag, or search
`#tag`, to list its notes. **✎** renames a tag in every note of the folder.

### Graph of the notes

**🕸** next to the folder's name draws the notes and the links between them
(`[[wiki links]]` and relative Markdown links; a link both ways is a double
arrow), with the number of notes without links. Click a note, or its name
in the list below the graph, to open it.

### Templates of the folder

The documents of a `Templates` folder at the root of the folder are offered
in **Templates and examples**, and **Save as template…** can keep new ones
there: see [Templates](./templates.md#templates-of-a-folder).

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
