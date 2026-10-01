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
