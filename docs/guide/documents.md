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
| Paragraph style | *Normal, Heading 1–4, Quote, Code block* | <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>0</kbd>…<kbd>3</kbd> (normal, heading 1–3) |
| Bold / italic / underline | **B** *I* U | <kbd>Ctrl</kbd>+<kbd>B</kbd> / <kbd>I</kbd> / <kbd>U</kbd> |
| Strikethrough | S | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd> |
| Inline code | `</>` | <kbd>Ctrl</kbd>+<kbd>`</kbd> |
| Font and size | *Default ▾* *— ▾* | |
| Text colour / highlight | **A** 🖍 (the swatch chooses the colour, × removes it) | |
| Clear formatting | ⌫ | <kbd>Ctrl</kbd>+<kbd>Space</kbd> |
| Indent / outdent | ⇢ ⇠ | <kbd>Ctrl</kbd>+<kbd>]</kbd> / <kbd>Ctrl</kbd>+<kbd>[</kbd> |
| Line spacing | ↕ ▾ (1, 1.15, 1.5, 2…) | |
| Paragraph spacing | ¶: left and first-line indents (cm, negative for a hanging indent), space before and after (pt), line spacing | |
| Bulleted / numbered list | •≡ 1≡ | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>8</kbd> / <kbd>7</kbd>; <kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd> to indent / outdent |
| Alignment | ⇤ ↔ ⇥ ☰ | <kbd>Ctrl</kbd>+<kbd>L</kbd> / <kbd>E</kbd> / <kbd>R</kbd> / <kbd>J</kbd> |
| Line break in the same paragraph | | <kbd>Shift</kbd>+<kbd>Enter</kbd> |
| Link | 🔗 | <kbd>Ctrl</kbd>+<kbd>K</kbd> |
| Image | 🖼 (or paste / drop an image) | |
| Table | ▦ (3×3) | |
| Horizontal rule | ― | |
| Equation | ∑ (see [Equations](./equations.md)) | <kbd>Ctrl</kbd>+<kbd>M</kbd> |
| Diagram | ⧉ (see [Diagrams](./diagrams.md)) | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd> |
| Code cell | { } (see [Code cells](./code.md)) | |

The status bar shows the word and character count.

Fonts that are not installed on the device are shown with a similar one
(serif or sans-serif) but kept in the file, so the document looks right
where the font exists. Formatting that comes from a paragraph style (for
example the size of a heading) is not copied onto the text, so changing the
style in Word or LibreOffice still changes it.

### Find and replace

🔍 or <kbd>Ctrl</kbd>+<kbd>F</kbd> opens the find bar; <kbd>Ctrl</kbd>+<kbd>H</kbd>
opens it with replacement. Every match is highlighted and counted;
<kbd>Enter</kbd> / <kbd>Shift</kbd>+<kbd>Enter</kbd> go to the next / previous
one. **Aa** matches case, **W** whole words only, **.\*** uses a regular
expression (replacements can then use `$1`, `$2`… for the captured groups).
*Replace all* is a single step that <kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes.
<kbd>Esc</kbd> closes the bar.

### Typing shortcuts

At the start of a line, type:

| You type | You get |
|----------|---------|
| `# ` … `###### ` | Heading 1 … 6 |
| `- `, `* ` or `+ ` | Bulleted list |
| `1. ` | Numbered list |
| `> ` | Quote |
| ` ``` ` | Code block (<kbd>Enter</kbd> adds a line; <kbd>Enter</kbd> on an empty last line leaves it) |
| `$x^2$` anywhere | An equation |

<kbd>Enter</kbd> on an empty list item leaves the list, and
<kbd>Backspace</kbd> at the start of a list item outdents it, then turns it
back into a normal paragraph. In a table, <kbd>Tab</kbd> and
<kbd>Shift</kbd>+<kbd>Tab</kbd> move between cells.

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
