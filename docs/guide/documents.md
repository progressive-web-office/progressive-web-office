---
description: Create and edit text documents (Word, OpenDocument, Markdown, MDZ) in the WYSIWYG editor.
---

# Text documents

The document editor opens **Word** (`.docx`), **OpenDocument Text** (`.odt`),
**Markdown** (`.md`) and **MDZ** (`.mdz`, zipped Markdown with images) files,
and any ZIP archive of Markdown files.

## Editing

| Action | Toolbar | Shortcut |
|--------|---------|----------|
| Undo / redo | ↶ ↷ | <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd> (or <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd>) |
| Paragraph style | *Normal, Heading 1–4, Quote, Code block* | |
| Bold / italic / underline | **B** *I* U | <kbd>Ctrl</kbd>+<kbd>B</kbd> / <kbd>I</kbd> / <kbd>U</kbd> |
| Strikethrough | S | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd> |
| Inline code | `</>` | |
| Bulleted / numbered list | •≡ 1≡ | <kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd> to indent / outdent |
| Alignment | ⇤ ↔ ⇥ ☰ | |
| Link | 🔗 | <kbd>Ctrl</kbd>+<kbd>K</kbd> |
| Image | 🖼 (or paste / drop an image) | |
| Table | ▦ (3×3) | |
| Horizontal rule | ― | |
| Equation | ∑ (see [Equations](./equations.md)) | <kbd>Ctrl</kbd>+<kbd>M</kbd> |

The status bar shows the word and character count.

## Pasting

Pasted content is **sanitised**: only headings, paragraphs, basic formatting,
lists, tables, links and images are kept. Scripts, event handlers, styles and
remote resources are removed. Only `http(s)`, `mailto` and `tel` links are
accepted.

## What is preserved

| Feature | DOCX | ODT | Markdown | MDZ |
|---------|:---:|:---:|:---:|:---:|
| Headings 1–6, paragraphs | ✅ | ✅ | ✅ | ✅ |
| Bold, italic, strikethrough, inline code | ✅ | ✅ | ✅ | ✅ |
| Underline | ✅ | ✅ | ✅ (`<u>`) | ✅ (`<u>`) |
| Alignment | ✅ | ✅ | ❌ | ❌ |
| Nested bulleted / numbered lists | ✅ | ✅ | ✅ | ✅ |
| Tables | ✅ | ✅ | ✅ (GFM) | ✅ (GFM) |
| Links | ✅ | ✅ | ✅ | ✅ |
| Images | ✅ | ✅ | ✅ (`data:` URI) | ✅ (`assets/images/`) |
| Quotes, code blocks, rules | ✅ | ✅ | ✅ | ✅ |

Other features of Word/LibreOffice files (headers and footers, footnotes,
comments, tracked changes, fonts and colours, page layout) are **not**
preserved when saving. Tracked insertions are accepted and deletions are
dropped when a `.docx` is opened.

## Document properties

**ⓘ** in the toolbar opens the document properties: title, author, date,
subject, description, keywords, language and licence. They are saved with the
document and read back when it is opened again:

| Format | Where the properties are stored |
|--------|---------------------------------|
| Word (`.docx`) | Core properties (`docProps/core.xml`); no licence field |
| OpenDocument (`.odt`) | `meta.xml` (licence as a custom property) |
| Markdown (`.md`) | YAML front matter at the top of the file |
| MDZ (`.mdz`) | `manifest.json` |
| LaTeX (`.tex`) | `\title`, `\author`, `\date` and the PDF properties (`\hypersetup`) |

## Markdown specifics

- CommonMark with GitHub-flavoured tables and strikethrough.
- Raw HTML in a Markdown file is displayed as text and never executed;
  only `<u>…</u>` and `<br>` are interpreted.
- Saving as `.md` embeds images as `data:` URIs so the file stays
  self-contained. Use **MDZ** to keep images as separate files.
- A YAML front matter (`---` … `---` at the top of the file) provides the
  document properties: `title`, `author`, `date`, `subject`, `description`
  (or `abstract`), `keywords` (list), `lang` (or `language`) and `license`.
  Other keys (for example `tags` or settings of a static site generator) are
  kept unchanged when the file is saved again. A front matter is written only
  when the document has properties beyond a title equal to its first heading.

See [MDZ packages](../formats/mdz.md) for the package format.
