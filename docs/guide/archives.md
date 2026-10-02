# ZIP archives, source files and pictures

## Opening a ZIP archive

Open a `.zip` file like any document (**Open**, drag and drop, or the file
handler of the installed app). When the archive is not itself a document,
it opens as a folder in the side panel, with its sub-folders and files:

- text documents, spreadsheets, presentations and PDF files open in their
  editors;
- text and source files (C, C++, Python, Java, JavaScript, R, MATLAB, SQL and
  many more) open in the code editor described below;
- pictures (PNG, JPEG, GIF, WebP, SVG, BMP, AVIF) are shown;
- any other file can be downloaded.

An archive inside the archive (🗜️) is a folder too: click it to see its
files. Archives can be nested several levels deep.

Files are decompressed only when you open them, so large archives (up to
1 GB) open quickly. Junk entries added by some systems (`__MACOSX`,
`.DS_Store`, `Thumbs.db`) are left out, and paths that would leave the
archive are ignored.

The search field of the panel also searches the text and source files.

### Changing the archive

Save, create, rename, move or delete files as in any folder: the changes
are kept in the archive in memory, including inside nested archives. To keep
them, click **⬇** next to the archive's name: it downloads the archive with
its changes. Closing a changed archive without downloading it asks for
confirmation.

### Archives that are documents

Some ZIP files are documents and open as such: OpenDocument and Office
files, MDZ files, a LaTeX project (one main `.tex` file with its pictures and
bibliography, see [LaTeX](./latex.md)) and a ZIP of Markdown notes with their
pictures. A ZIP holding several LaTeX projects, or LaTeX and Markdown files
next to office documents or source code, opens as a folder.

## Text and source files

A text or source file opens in a code editor with line numbers, syntax
colouring for its language, folding, bracket matching and search
(<kbd>Ctrl</kbd>+<kbd>F</kbd>). The toolbar shows the language, the encoding
and the line ends, and offers:

- **Wrap long lines**;
- **↧ Go to line** (<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>G</kbd>).

<kbd>Tab</kbd> indents the line. To leave the editor with the keyboard, press
<kbd>Esc</kbd> then <kbd>Tab</kbd>.

**Save** keeps the file's name and extension. Files are read as UTF-8 or,
when they are not valid UTF-8, as Windows-1252; they are saved in UTF-8,
keeping their byte order mark and their line ends (LF or CRLF).

Printing a source file prints its text with line numbers and colours.

## Pictures

A picture is shown fitted to the window; **Actual size** shows it at its own
size. The status bar gives its dimensions. SVG pictures are shown as images:
their scripts never run.
