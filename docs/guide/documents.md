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
| Font and size | *Default ▾* and the size field: pick a size or type any one from 1 to 999 pt, then <kbd>Enter</kbd> | <kbd>↑</kbd> / <kbd>↓</kbd> in the size field |
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
| Table | ▦ (3×3), then the table bar (below) | <kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd> to move between cells |
| Horizontal rule | ― | |
| Page break | ⤓ | <kbd>Ctrl</kbd>+<kbd>Enter</kbd> |
| Footnote | ¹ | <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>F</kbd> |
| Caption (numbered figure, table or equation) | 🏷 | |
| Cross-reference | ↪ | |
| Citation / bibliography | ❝ 📚 | |
| Table of contents | § | |
| Header and footer | ▤ | |
| Equation | ∑ (see [Equations](./equations.md)) | <kbd>Ctrl</kbd>+<kbd>M</kbd> |
| Diagram | ⧉ (see [Diagrams](./diagrams.md)) | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd> |
| Code cell | { } (see [Code cells](./code.md)) | |

The status bar shows the word and character count.

Fonts that are not installed on the device are shown with a similar one
(serif or sans-serif) but kept in the file, so the document looks right
where the font exists. Formatting that comes from a paragraph style (for
example the size of a heading) is not copied onto the text, so changing the
style in Word or LibreOffice still changes it.

### Footnotes

¹ (or <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>F</kbd>) adds a footnote at the
cursor. Notes are numbered automatically in reading order and listed under
the page; when printing they come at the end of the document. Write a note
with simple Markdown: `**bold**`, `*italic*`, `[link](https://…)`,
`$equation$`; a blank line starts a second paragraph. Click a note's number
(or its line under the page) to change it; emptying it removes it.

Footnotes are kept in Word (`.docx`) and OpenDocument (`.odt`) files, in
Markdown (`[^1]` with the notes at the end) and in LaTeX (`\footnote{…}`).

### Table of contents

§ inserts a table of contents before the current paragraph. It lists the
headings (Heading 1 to 3) and updates as you write; click an entry to go to
its heading. In Word and LibreOffice it is a real table of contents: Word
recomputes it, with page numbers, when the file is opened (it may ask to
update the fields), and LibreOffice updates it with *Tools › Update*. In
Markdown it is written `[[_TOC_]]` (shown as a table of contents by GitLab,
Typora and others) and in LaTeX `\tableofcontents`.

### Pictures

When you insert a picture (🖼, paste or drag and drop), the app asks for:

- its **alternative text**: what the picture shows, for readers who cannot
  see it (screen readers, text-only exports); tick **Decorative picture**
  when it only decorates;
- an optional **caption**, added below it as a numbered figure (see
  [Captions and cross-references](#captions-and-cross-references)).

Double-click a picture to change its alternative text.

### Accessibility check

**♿ Check accessibility** lists what makes the document harder to read with
a screen reader or for people with low vision: pictures without alternative
text (or with a file name as text), skipped heading levels (a Heading 3
right after a Heading 1), empty headings, tables without a header row, links
whose text does not say where they go ("click here"), coloured text with a
contrast below 4.5:1, and a missing title or language. **Show** goes to the
issue; **Fix** opens the picture's description, the properties, or turns
the table's first row into a header row.

### Captions and cross-references

🏷 numbers a **figure**, a **table** or an **equation**:

- a figure caption (“Figure 1: …”) goes below the current paragraph, so put
  the cursor on the picture first;
- a table caption goes above the table holding the cursor;
- with the cursor on a display equation (`$$…$$`), *Equation* adds its
  number `(1)` at the end of the line.

Numbers follow the document order and update as you insert, move or delete
captions. The caption is an ordinary paragraph in the *Caption* style: its
text can be edited like any other.

↪ inserts a **cross-reference**: choose a figure, table, equation or heading
in the list. The reference shows “Figure 2”, “Table 1”, “(3)” or the
heading's text, and follows renumbering; <kbd>Ctrl</kbd>+click on it to go
to its target. A reference whose target was deleted shows **??** in red, as
in LaTeX.

| Format | Numbers | References |
|--------|---------|------------|
| Word (`.docx`) | `SEQ` fields in the *Caption* style | `REF` fields to bookmarks (Word updates them with F9) |
| OpenDocument (`.odt`) | `text:sequence` (Figure, Table, Equation) | bookmark references |
| LaTeX | `\captionof{figure}{…}`, `equation` environments, `\label` | `Figure~\ref{…}`, `\eqref{…}`, `\nameref{…}` |
| Markdown | `<a id="…"></a>Figure 1: …`, `$$ … \tag{1}\label{…} $$` | links `[Figure 1](#…)` |

Captions, `\label` and `\ref` of Word, LibreOffice and LaTeX files are
read back as numbers and references.

### Citations and bibliography

📚 holds the document's **sources**: import a BibTeX file (exported by
Zotero, JabRef, Mendeley, Google Scholar…) or paste BibTeX entries, remove
sources, and choose how citations look:

- **numbered**: `[1]`, `[2, 3, p. 12]`, numbered in the order they are first
  cited;
- **author and year**: `(Knuth, 1984; Lamport et al., 1994)`.

❝ inserts a **citation**: search the sources, tick one or more, and give a
page if needed. Click a citation to change it; untick everything to remove
it. *Insert the list of references here* (in 📚) adds the list of the cited
sources, which updates as you cite.

| Format | Sources | Citations | List |
|--------|---------|-----------|------|
| Word (`.docx`) | Word sources (*References › Manage Sources*) | `CITATION` fields | `BIBLIOGRAPHY` field |
| OpenDocument (`.odt`) | in the bibliography marks | bibliography marks | bibliography index |
| LaTeX | `references.bib`, also embedded with `filecontents` | `\cite` (`\citep` with natbib) | `\bibliography{references}` |
| Markdown | `references:` in the front matter (pandoc) | `[@key]`, `[@a; @b, p. 12]` | `<div id="refs"></div>` |

Opening a file reads its sources and citations back: Word sources and
citations, Zotero and Mendeley citations in Word files, LibreOffice
bibliography marks, LaTeX `\cite`, `\citep`, `\parencite`… with
`\bibliography`, `\addbibresource` or `thebibliography`. OpenDocument keeps
no page in a citation.

### Tables

▦ inserts a 3×3 table. While the cursor is in a table, a **Table** bar
appears under the toolbar:

| Button | Action |
|--------|--------|
| ⬆+ ⬇+ | insert a row above / below |
| ⬅+ ➡+ | insert a column on the left / right |
| ⬌− ⬍− | delete the row / the column |
| ⊞ | merge the selected cells (select them with <kbd>Shift</kbd>+click or by dragging) |
| ⊟ | split a merged cell |
| H | make the first row a header row (bold, shaded, repeated on each printed page) |
| 🗑 | delete the table |

Buttons that do not apply (merging a single cell, for example) are greyed
out. Merged cells and the header row are kept in Word (`gridSpan`,
`vMerge`, repeated header row), OpenDocument (spanned and covered cells,
header rows) and LaTeX (`\multicolumn`, `\multirow`, a double rule under the
header). Markdown tables cannot merge cells: a merged cell keeps its text in
its first position and the others are left empty; their first row is always
the header.

### Header and footer

▤ opens the header and footer: each has a left, a centre and a right part.
*Insert* adds a field where the cursor is: **page number**, **page count**,
**title** (from the document properties ⓘ) or **date**. *Page number in
the footer* fills the footer's centre with a ready-made number: `1`,
`1/10`, `- 1 -` or `Page 1 of 10`. The header and footer are shown above
and below the page (click them to change them) and printed on every page.

**Page numbering** sets the style of the numbers (`1, 2, 3`, `i, ii, iii`,
`I, II, III`, `a, b, c` or `A, B, C`), the number of the first page (for a
document that continues another one), and can leave the first page without
header and footer, for a title page.

They are kept as real headers and footers in Word and OpenDocument files
(with page fields that the application updates), with `fancyhdr` in LaTeX,
and as `header-left: …`, `footer-center: …` keys in the front matter of a
Markdown file. The numbering is kept in Word (`w:pgNumType`, a different
first page), OpenDocument (the page style's number format, a *First Page*
page style), LaTeX (`\pagenumbering`, `\setcounter{page}`,
`\thispagestyle{empty}`) and Markdown (`page-numbering`, `page-start`,
`first-page-hidden`).

### Find and replace

🔍 or <kbd>Ctrl</kbd>+<kbd>F</kbd> opens the find bar; <kbd>Ctrl</kbd>+<kbd>H</kbd>
opens it with replacement. Every match is highlighted and counted;
<kbd>Enter</kbd> / <kbd>Shift</kbd>+<kbd>Enter</kbd> go to the next / previous
one. **Aa** matches case, **W** whole words only, **.\*** uses a regular
expression (replacements can then use `$1`, `$2`… for the captured groups).
*Replace all* is a single step that <kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes.
<kbd>Esc</kbd> closes the bar.

### Typography and text tools

While you type, the app follows the typography of the document's language
(set in the document properties, else the interface language):

- `"` gives curly quotes (`« … »` with no-break spaces in French, `“ … ”` in
  English, `„ … “` in German) and `'` an apostrophe `’`;
- `--` gives an en dash `–`, a third `-` an em dash `—`, `...` an ellipsis `…`;
- in French, a no-break space goes before `; ! ?` (narrow) and `:`, except
  in web addresses and times (`12:30`).

<kbd>Backspace</kbd> right after a correction undoes it. Code is never
changed. **Text → Typography as you type** turns this off or on.

The **Text** menu also transforms the selection, or the whole document when
nothing is selected, keeping its formatting: curly or straight quotes,
French spacing, dashes and ellipsis, remove double spaces, remove invisible
characters, **join broken lines** (text pasted from a PDF: lines that do not
end a sentence are joined, a word cut with a hyphen is put back together),
sentence case, title case, upper and lower case.

### Writing aids

The **View** menu of the toolbar offers:

- **Readability of the paragraphs**: a mark in the margin of each paragraph,
  green (easy), yellow, orange or red (very difficult), with its reading
  ease, from the length of the sentences and of the words (Flesch in
  English, its Kandel–Moles adaptation in French; hover a paragraph for the
  details). The status bar gives the document's score.
- **Focus mode**: only the text, the paragraph of the cursor in full and the
  others dimmed; <kbd>Esc</kbd> leaves it.
- **Typewriter mode**: the line you write stays in the middle of the screen.
- **Writing goal and statistics**: a number of words to reach in this
  document (its progress shows in the status bar), the words written on each
  of the last 14 days, and a focus timer (25 minutes of work, 5 of break).
  Goals and statistics stay in this browser.

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

## Comments

Select some text (or put the cursor in a word) and click **💬** or press
<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>M</kbd>, type the comment, then **Post**
(<kbd>Ctrl</kbd>+<kbd>Enter</kbd>). The first time, the app asks for the
name shown on your comments; it uses the name chosen for real-time
collaboration when there is one.

Commented text is highlighted and the threads are listed beside the page,
in the order of the text (below the page on narrow screens). Click a thread
to select its text; the thread of the text under the cursor is outlined.
Each thread offers:

- **Reply**;
- **Resolve** (its text is no longer highlighted) and **Reopen**;
- **Delete**, which removes the comment from the text; <kbd>Ctrl</kbd>+<kbd>Z</kbd>
  brings it back.

A comment whose text you delete goes with it. Comments are not printed.

Comments are kept when saving:

| Format | How |
|--------|-----|
| DOCX | Word comments, with replies and their resolved state, as Word shows them |
| ODT | LibreOffice comments (annotations), with replies and their resolved state |
| Markdown, MDZ | [CriticMarkup](https://github.com/CriticMarkup/CriticMarkup-toolkit): `{==commented text==}{>>Ann: the comment<<}`, replies following |

During a real-time collaboration session, the commented text is shared, but
the comments themselves are not yet: save and share the file instead.

## Exercise sheets and answer keys

Write the exercises and their solutions in one document. Put the cursor in
a solution's paragraphs (or select them) and click **✓ Solution**: they get a
green frame labelled *Solution*. Click **✓** again to make them normal text.

- **👁 Hide the solutions** shows the exercise sheet, on screen and in print;
  click it again for the answer key.
- **Save as… → Exercise sheet without solutions** (`.odt`, `.docx` or
  `.md`) writes a copy without the solutions, next to the document, which
  keeps them: one file to maintain, two to hand out.

Solutions are kept in Word files as content controls named *Solution*, in
OpenDocument files as sections named *Solution1*, *Solution2*… (which
LibreOffice can hide), and in Markdown as fenced divs, as in Pandoc and
Quarto:

```markdown
Compute 2 + 3.

::: solution
2 + 3 = 5
:::
```

### Random variants

::: v-pre
Give each student different values. In the text, write:

| Write | It gives |
|-------|----------|
| `{{R=rand(10..20)}}` | a whole number from 10 to 20, shown here |
| `{{I=rand(0.5..2, 0.5)}}` | 0.5, 1, 1.5 or 2 (with a step) |
| `{{C=choice(red, green, blue)}}` | one of the values |
| `{{P=R*I^2}}` | a value computed from others |
| `{{R}}` | the value of R, again |
| `{{=R*I}}` | a result, computed (in a solution, typically) |
| `{{=R/3\|2}}` | a result with 2 decimals |

Expressions use `+ - * / ^ %`, parentheses and `sqrt`, `abs`, `exp`, `ln`,
`log`, `sin`, `cos`, `tan`, `round(x, n)`, `min`, `max`, `pi`, `e`. Numbers
are written in the document's language (`1,5` in French).

**🎲 Random variants** asks for the number of variants, the format and a
*seed* (the same seed gives the same variants again), then downloads a ZIP
with one sheet per variant (without the solutions), its answer key (with
them), and a CSV table of the values drawn for each variant.
:::

## Mail merge

Write **fields** in a document as `{{Name}}`, named like the columns of a
table — a CSV or TSV file, or the first sheet of a workbook (`.xlsx`,
`.ods`) whose **first row names the columns**:

```md
Dear {{First name}} {{Name}}, your mark is {{Mark}}/20.
```

**✉ Mail merge…** asks for the table (one of the open folder, or a file of
the device), shows how many rows it has and which fields it lacks (those are
left as they are), then makes:

- **one file per row, in a ZIP archive**;
- **one file per row, in the open folder** (a `… – merge` folder next to the
  document), when the folder can be written;
- **one document, a page per row**, ready to print or save as PDF.

Choose the format (`.odt`, `.docx`, `.md`) and the column naming the files
(the row number otherwise). Answers of exercise sheets are left out.

## Tracking changes

Click **±** (Track changes) to record your edits instead of applying them:
the text you type is underlined in green, the text you delete stays, struck
out in red, both signed with your name and the date. Deleting text you
inserted while tracking removes it. Click **±** again to stop. Formatting
changes and joined paragraphs are not tracked.

The **Changes** panel beside the page lists every change: click one to
select it, **Accept** or **Reject** it, or **Accept all** / **Reject all**.
Accepting an insertion keeps its text; accepting a deletion removes its
text; rejecting does the opposite.

Changes are kept in Word (`.docx`, as Word shows them), OpenDocument
(`.odt`, as LibreOffice shows them) and Markdown (CriticMarkup
`{++added++}` and `{--deleted--}`, without author). A LaTeX export applies
them (accepts every change).

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
| Fonts, sizes, colours, highlight | ✅ | ✅ | ❌ | ❌ |
| Alignment, indents, paragraph and line spacing | ✅ | ✅ | ❌ | ❌ |
| Nested bulleted / numbered lists | ✅ | ✅ | ✅ | ✅ |
| Tables | ✅ | ✅ | ✅ (GFM) | ✅ (GFM) |
| Merged cells, header row | ✅ | ✅ | header row only | header row only |
| Links | ✅ | ✅ | ✅ | ✅ |
| Images | ✅ | ✅ | ✅ (`data:` URI) | ✅ (`assets/images/`) |
| Quotes, code blocks, rules | ✅ | ✅ | ✅ | ✅ |
| Page breaks | ✅ | ✅ | ✅ (`\newpage`) | ✅ (`\newpage`) |
| Footnotes | ✅ | ✅ | ✅ (`[^1]`) | ✅ (`[^1]`) |
| Table of contents | ✅ (field) | ✅ | ✅ (`[[_TOC_]]`) | ✅ (`[[_TOC_]]`) |
| Header and footer | ✅ | ✅ | ✅ (front matter) | ✅ (front matter) |
| Captions and cross-references | ✅ (fields) | ✅ | ✅ (anchors and links) | ✅ (anchors and links) |
| Citations and bibliography | ✅ (Word sources) | ✅ | ✅ (pandoc) | ✅ (pandoc) |

Comments and tracked changes are kept in all four formats (see
[Comments](#comments) and [Tracking changes](#tracking-changes)).

Other features of Word/LibreOffice files (named styles beyond headings,
sections and page layout) are **not** preserved when saving.

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
- `==highlighted text==` is highlighted (in yellow); highlighted text of any
  colour is written so.
- **Callouts** (also called admonitions or alerts): a quote whose first line
  is `[!NOTE]`, `[!TIP]`, `[!WARNING]`, `[!DANGER]`… with an optional title
  and `+`/`-` (folding) is drawn as a coloured box, and written back as it
  is:

  ```md
  > [!WARNING] Hot surface
  > Do not touch the heater while it runs.
  ```
- Raw HTML in a Markdown file is displayed as text and never executed;
  only `<u>…</u>` and `<br>` are interpreted.
- Pictures linked with a relative path (`![alt](img/photo.png)`,
  `<img src="img/photo.png">` or `![[photo.png]]`) are shown when the note is
  opened from a folder or an archive; names with spaces or accents work
  whether they are written encoded (`%20`) or not. Pictures on the web are
  downloaded when the server allows it; a notice lists the ones that could
  not be found.
- Saving a note back into its folder keeps relative links as links. Saving
  as a standalone `.md` embeds the other images as `data:` URIs so the file
  stays self-contained. Use **MDZ** (or DOCX, ODT…) to keep the pictures
  with the document.
- A YAML front matter (`---` … `---` at the top of the file) provides the
  document properties: `title`, `author`, `date`, `subject`, `description`
  (or `abstract`), `keywords` (list), `lang` (or `language`) and `license`.
  Other keys (for example `tags` or settings of a static site generator) are
  kept unchanged when the file is saved again. A front matter is written only
  when the document has properties beyond a title equal to its first heading.

See [MDZ packages](../formats/mdz.md) for the package format.
