---
description: Edit Excel, OpenDocument and CSV spreadsheets with formulas, multiple sheets and number formats.
---

# Spreadsheets

The spreadsheet editor opens **Excel** (`.xlsx`), **OpenDocument
Spreadsheet** (`.ods`) and **CSV/TSV** files.

## Entering data

Select a cell and start typing, or type in the formula bar (**fx**).

| Input | Result |
|-------|--------|
| `42`, `-1.5`, `1e3` | number |
| `12.5%` | 0.125 shown as a percentage |
| `2026-10-01` | date (shown `yyyy-mm-dd`) |
| `TRUE` / `FALSE` | boolean |
| `=A1*2` | formula |
| `'007` | text (a leading apostrophe forces text) |

## Keyboard

| Key | Action |
|-----|--------|
| Arrows, <kbd>Page Up</kbd>/<kbd>Down</kbd> | move (with <kbd>Shift</kbd>: extend the selection) |
| <kbd>Enter</kbd> / <kbd>Shift</kbd>+<kbd>Enter</kbd> | down / up (commits an edit) |
| <kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd> | right / left |
| <kbd>F2</kbd> or double-click | edit the cell |
| <kbd>Esc</kbd> | cancel the edit |
| <kbd>Delete</kbd> | clear the selection |
| <kbd>Ctrl</kbd>+<kbd>C</kbd> / <kbd>X</kbd> / <kbd>V</kbd> | copy / cut / paste (tab-separated text, compatible with other spreadsheets) |
| <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Y</kbd> | undo / redo |
| <kbd>Ctrl</kbd>+<kbd>Home</kbd> | go to A1 |

The status bar shows the count, sum and average of the selected cells.

## Formulas

Formulas use the usual A1 syntax: `=A1+B2`, `=SUM(A1:A10)`, `=$A$1*B2`,
`=Sheet2!A1`, `='My sheet'!B3`, whole columns `=SUM(A:A)`.

Operators: `+ - * / ^`, `%`, `&` (text concatenation), comparisons
`= <> < > <= >=`.

| Category | Functions |
|----------|-----------|
| Math | `SUM`, `PRODUCT`, `AVERAGE`, `MEDIAN`, `MIN`, `MAX`, `ROUND`, `ROUNDUP`, `ROUNDDOWN`, `INT`, `ABS`, `SQRT`, `POWER`, `MOD`, `PI` |
| Counting | `COUNT`, `COUNTA`, `COUNTBLANK`, `COUNTIF`, `SUMIF` |
| Logic | `IF`, `IFERROR`, `AND`, `OR`, `NOT`, `ISBLANK`, `ISNUMBER`, `ISTEXT` |
| Text | `CONCAT`, `CONCATENATE`, `LEN`, `UPPER`, `LOWER`, `TRIM`, `LEFT`, `RIGHT`, `MID` |
| Lookup | `VLOOKUP` |
| Dates | `TODAY`, `NOW`, `DATE`, `YEAR`, `MONTH`, `DAY` |

Errors are shown in the cell: `#DIV/0!`, `#VALUE!`, `#NAME?` (unknown
function), `#REF!` (deleted or unknown reference), `#N/A`, `#ERROR!`
(syntax error) and `#CYCLE!` (circular reference).

## Sheets, rows and columns

- **+** adds a sheet; double-click a tab to rename it; 🗑 deletes the current
  sheet. References to a renamed sheet are updated.
- **+Row / −Row / +Col / −Col** insert or delete rows and columns; formulas
  referring to moved cells are updated, references to deleted cells become
  `#REF!`.
- **Σ** inserts a `SUM` of the numbers above the selected cell.
- The format list applies a number format (decimals, thousands separator,
  percent, dates, currency) to the selection.

## Formatting cells

The toolbar formats the selected cells: **B** *I* U (also
<kbd>Ctrl</kbd>+<kbd>B</kbd> / <kbd>I</kbd> / <kbd>U</kbd>), the text colour
(**A**) and the fill colour (▧), borders around each cell (▦), and the
alignment (⇤ ↔ ⇥). ⌫ (or <kbd>Ctrl</kbd>+<kbd>Space</kbd>) removes the
formatting and keeps the values and number formats. The buttons show the
formatting of the active cell. Formatting is kept in Excel and OpenDocument
files and printed.

## Freezing rows and columns

**❄** (*Freeze panes*) keeps the rows above and the columns left of the
active cell in view while the rest scrolls; from A1, it freezes the first
row. A thicker line marks the edge. Press it again to unfreeze. Frozen
panes are kept in Excel and OpenDocument files.

## Sorting

**⇅** (*Sort…*) sorts the rows of the selection, or, when a single cell is
selected, of the block of filled cells around it. Choose the column to sort
by and the order. When the first row looks like a header (text above
numbers), it is ticked as one and stays in place; untick it otherwise.

- Rows move as a whole within the sorted range; cells outside it do not
  move.
- Numbers come before text, text is sorted without regard to case or
  accents, and empty cells always go last.
- Values are compared as computed: a formula cell sorts by its result, and
  its relative references follow its row, as when copying.
- One <kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes the sort.

## Filtering

Put the active cell in a table whose first row holds the headings and click
**⊻ Filter**: each heading gets a **▾** button. Click it to check the values
to show in that column (a search field narrows the list; **(Empty)** stands
for empty cells); the other rows of the table are hidden. Filters of several
columns combine: a row is shown when it matches all of them. A filtered
column's button is highlighted (**▼**). **Show all** clears the column's
filter; **⊻ Filter** again removes the filter.

The arrow keys skip the hidden rows. Values are compared as they are shown
(with their number format). The filter and the rows it hides are kept in
Excel and OpenDocument files.

## Charts

1. Select the data — or just click inside a block of data: the whole block is
   proposed.
2. Click **📊** (*Insert chart*). Choose the type — **columns**, **bars**,
   **lines**, **pie** or **scatter (X, Y)** — and a title; the preview updates
   as you go.
3. Click **Insert**.

The first column gives the categories (the X values for a scatter chart),
each other column is a series; tick *First row contains series names* when the
range starts with headers (detected automatically). Charts update as soon as
the data changes, and follow inserted or deleted rows and columns.

Drag a chart to move it, drag its corner to resize it. Its buttons (shown on
hover or focus): **✎** edit, **⧉** copy as an image — then paste it into a
text document or a slide — and **🗑** delete (or <kbd>Delete</kbd> when the
chart has the focus; <kbd>Enter</kbd> edits it). The AI assistant can also add
charts.

Charts are saved as real charts in XLSX and ODS files, so Excel and
LibreOffice show them (and Progressive Web Office reads them back); CSV
files keep only the data. Charts are printed with their sheet.

## Formats

| Feature | XLSX | ODS | CSV |
|---------|:---:|:---:|:---:|
| Several sheets | ✅ | ✅ | current sheet only |
| Formulas | ✅ | ✅ (OpenFormula) | computed values |
| Number formats | ✅ | ✅ | dates as `yyyy-mm-dd` |
| Column widths | ✅ | ✅ | — |
| Charts | ✅ | ✅ | — |

CSV import detects the delimiter (`,` `;` tab `|`), accepts UTF-8 and
Windows-1252 files and **never** turns cells starting with `=` into formulas
(protection against CSV injection). Fonts, colours, borders, merged cells
and pivot tables are not preserved; chart styling made in other applications
(colours, 3-D, secondary axes) is replaced by Progressive Web Office's.
