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
| Math | `SUM`, `PRODUCT`, `SUMSQ`, `AVERAGE`, `MEDIAN`, `MIN`, `MAX`, `ROUND`, `ROUNDUP`, `ROUNDDOWN`, `INT`, `ABS`, `SIGN`, `SQRT`, `POWER`, `MOD`, `PI`, `EXP`, `LN`, `LOG`, `LOG10`, `TRUNC`, `CEILING`, `FLOOR`, `MROUND`, `EVEN`, `ODD`, `FACT`, `COMBIN`, `PERMUT`, `GCD`, `LCM`, `QUOTIENT`, `RAND`, `RANDBETWEEN`, `SUMPRODUCT` |
| Trigonometry | `SIN`, `COS`, `TAN`, `ASIN`, `ACOS`, `ATAN`, `ATAN2` (x, y), `SINH`, `COSH`, `TANH`, `DEGREES`, `RADIANS` (angles in radians) |
| Statistics | `VAR`, `VARP`, `STDEV`, `STDEVP`, `SLOPE`, `INTERCEPT`, `RSQ`, `CORREL` (`SLOPE(known_y, known_x)`), `LARGE`, `SMALL`, `RANK` / `RANK.EQ`, `MODE`, `PERCENTILE`, `QUARTILE`, `GEOMEAN`, `AVERAGEA` |
| Counting | `COUNT`, `COUNTA`, `COUNTBLANK`, `COUNTIF`, `SUMIF`, `AVERAGEIF`, and with several criteria `COUNTIFS`, `SUMIFS`, `AVERAGEIFS`, `MAXIFS`, `MINIFS` |
| Logic | `IF`, `IFERROR`, `AND`, `OR`, `NOT`, `ISBLANK`, `ISNUMBER`, `ISTEXT`, `IFS`, `SWITCH`, `XOR`, `IFNA`, `ISERROR`, `ISERR`, `ISNA`, `NA`, `ISLOGICAL`, `ISNONTEXT`, `ISEVEN`, `ISODD`, `TRUE`, `FALSE` |
| Text | `CONCAT`, `CONCATENATE`, `LEN`, `UPPER`, `LOWER`, `TRIM`, `LEFT`, `RIGHT`, `MID`, `TEXTJOIN`, `SUBSTITUTE`, `REPLACE`, `FIND`, `SEARCH` (wildcards), `REPT`, `PROPER`, `EXACT`, `VALUE`, `TEXT` (number format), `CHAR`, `CODE`, `CLEAN` |
| Lookup | `VLOOKUP`, `HLOOKUP`, `INDEX`, `MATCH`, `XLOOKUP`, `CHOOSE` |
| Dates | `TODAY`, `NOW`, `DATE`, `YEAR`, `MONTH`, `DAY`, `WEEKDAY`, `EDATE`, `EOMONTH`, `DAYS`, `DATEDIF`, `NETWORKDAYS`, `TIME`, `HOUR`, `MINUTE`, `SECOND` |

Errors are shown in the cell: `#DIV/0!`, `#VALUE!`, `#NAME?` (unknown
function), `#REF!` (deleted or unknown reference), `#N/A`, `#ERROR!`
(syntax error) and `#CYCLE!` (circular reference).

## Physical quantities and units

A cell can hold a **quantity**: a number and its unit. Type them together:
`12 mm`, `3.5 kN`, `9.81 m/s²`, `230 V`, `50 km/h`, `2.5 kWh`. The cell
shows `12 mm`, the formula bar too, and formulas compute with the units —
**dimensional analysis**, as in physics:

| Formula | Result | Why |
|---------|--------|-----|
| `=A1+A2` with `12 mm` and `3 m` | `3012 mm` | lengths add up, in the unit of the first |
| `=A2+A1` | `3.012 m` | |
| `=A1*A1` | `144 mm²` | units multiply |
| `=B1*B2` with `2 kN` and `0.5 m` | `1 kN·m` | |
| `=C1/C2` with `100 km` and `2 h` | `50 km/h` | |
| `=D1*D2` with `3 kg` and `2 m/s²` | `6 N` | several units of a named dimension: the named unit |
| `=A1/A2` | `0.004` | same dimension: a pure number |
| `=SQRT(A1*A1)` | `12 mm` | |
| `=A1+E1` with `12 mm` and `2 s` | **`#UNIT!`** | a length and a time cannot be added |
| `=A1+1` | **`#UNIT!`** | a length and a pure number neither |
| `=SIN(A1)` | **`#UNIT!`** | functions of numbers need a dimensionless value |

What understands units:

- `+` and `-` (same dimension), `*`, `/`, `^` (dimensions combined),
  comparisons (`=`, `<`, `>`… between the same dimension);
- `SUM`, `AVERAGE`, `MIN`, `MAX`, `MEDIAN` of quantities of one dimension —
  a column in `m`, `cm` and `mm` adds up correctly; `PRODUCT`, `ABS`,
  `ROUND`/`ROUNDUP`/`ROUNDDOWN` (in the unit shown), `SQRT`, `POWER`,
  `COUNT`;
- **`CONVERT(number; "from"; "to")`**, as in Excel and LibreOffice
  (`=CONVERT(100;"C";"F")` → 212, `=CONVERT(1;"in";"mm")` → 25.4); given a
  quantity, it converts it from its own unit: `=CONVERT(A3;"km";"mi")`;
- **`QTY(number; "unit")`** makes a quantity in a formula
  (`=QTY(9.81;"m/s²")*A1`), and **`UNIT(cell)`** gives the unit of a
  quantity as text.

**Number format › Unit…** shows the selected cells in another unit: a
quantity is **converted** (`12 mm` → `1.2 cm`), a plain number **gets** the
unit, a formula is **shown** in it (`=B1*B2` in `N·m` → `1000 N·m`); cells of
another dimension are left as they were, and a formula whose result is not of
the dimension of its unit shows `#UNIT!`.

### Units known

- SI base units and their **prefixes** from quecto (`q`) to quetta (`Q`):
  `m`, `g`, `s`, `A`, `K`, `mol`, `cd` — `mm`, `km`, `µs` (or `us`), `kg`, `mA`…
- named SI units: `N`, `J`, `W`, `Pa`, `Hz`, `C`, `V`, `Ω` (or `ohm`), `F`,
  `H`, `T`, `Wb`, `S`, `lm`, `lx`, `Bq`, `Gy`, `Sv`, `kat`, `rad`, `sr`;
- others: `L` (or `l`), `t`, `eV`, `Wh`, `Ah`, `bar`, `cal`, `min`, `h`,
  `d`, `yr`, `ha`, `Å`, `in`, `ft`, `yd`, `mi`, `nmi`, `lb`, `oz`, `lbf`, `gal`,
  `atm`, `psi`, `mmHg`, `Torr`, `hp`, `°C`, `°F`;
- combined with `·` (or `*`, `.`, a space) and `/`, with powers as `²`,
  `^2`, `^-1` or `m2`: `kN·m`, `km/h`, `m/s²`, `kg·m^-3`, `1/(mol·L)`.

`°C` and `°F` count as temperature **differences** in calculations (1 °C =
1 K): to convert a temperature reading, use `CONVERT` (`=CONVERT(20;"C";"K")`
→ 293.15).

### In files

A quantity is saved as a **number in its unit with the unit in its number
format** (`General" mm"`), in XLSX and ODS: Excel and LibreOffice show
`12 mm` and compute with the number (without checking the units); opened
again here, the cells are quantities again. A formula giving a quantity is
saved with its result in the unit shown. In CSV, quantities are written as
`12 mm` and read back as quantities. `QTY` and `UNIT` are functions of this
application: other spreadsheets show `#NAME?` for them.

## Sheets, rows and columns

- **+** adds a sheet; double-click a tab to rename it; 🗑 deletes the current
  sheet. References to a renamed sheet are updated.
- **+Row / −Row / +Col / −Col** insert or delete rows and columns; formulas
  referring to moved cells are updated, references to deleted cells become
  `#REF!`.
- **The width of a column**: drag the right edge of its header (the
  columns selected all take it), double-click that edge to fit the content,
  or **↔ Column width…** to type it in pixels (`auto`: fitted). The widths
  are kept in XLSX and ODS files.
- **Σ** inserts a `SUM` of the numbers above the selected cell.
- The format list applies a number format (decimals, thousands separator,
  percent, dates, currency) to the selection; **Other format…** takes any
  format code (`0.000`, `# ##0 "kg"`, `dd/mm/yyyy hh:mm`…). A cell whose
  format is not in the list (from a file or a template) shows its code there.

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
