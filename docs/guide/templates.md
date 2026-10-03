---
description: Start a letter, report, budget, grade book, invoice or talk from a ready-made template, explore an example document, and keep your own templates in the browser.
---

# Templates and examples

**Templates and examples** (🧩 on the start screen) opens a gallery. The
document you pick opens as a new, untitled document in your preferred format
(OpenDocument or Microsoft Office, chosen on the start screen): save it
where you want. The templates are written in the language of the interface
(English for languages without a translation of their content).

## Text documents

| Template | What it has |
| --- | --- |
| Letter | Sender, place and date on the right, recipient, subject, body, signature |
| Report | Title page without header and footer, table of contents, page numbers, a captioned table referenced from the text |
| Meeting minutes | Attendees, agenda, discussion, a table of actions |
| Exercise sheet | Numbered exercises with equations, a name field in the header |

## Spreadsheets

| Template | What it has |
| --- | --- |
| Budget | Income and expenses by month, totals, balance, a column chart, frozen headings |
| Grade book | Marks, rounded averages, results computed with `IF`, class average, `COUNTIF` |
| Invoice | Items, quantities, unit prices, subtotal, VAT and total, date of the day |

## Presentations

**Talk**: a title slide, an outline, content slides with bullets and speaker
notes.

**Race signs**: start, arrows (right, left, straight on), kilometre marks,
water station and finish, each on an A4 landscape page, in letters several
centimetres high and high-contrast colours. Print one slide per page and
laminate them. Turn them to portrait with the orientation list; the text
sizes follow.

## Examples

**A tour of the word processor** shows what a text document can hold:
formatting, footnotes, a table of contents, an equation numbered and
referenced, a captioned table, a Mermaid diagram, a Python code cell and
citations with their list of references. Change anything to try it.

**Lab report with Python plots** mixes text, equations and Python cells
(numpy, matplotlib, SymPy): a least-squares fit with error bars, damped
oscillations, a Bode plot, a histogram of repeated measurements, a field map
and a differential equation solved symbolically. The output and figures are
already there when it opens; **⏩** runs every cell again in the browser.

**Interactive widgets** shows [widgets](./code.md#widgets) in cells: a
slider written in Python with anywidget, made reactive with `pwo.ui`, drives
a plot that is drawn again when the slider moves; a button written in a
JavaScript cell counts clicks with a cell that follows it. Press **⏩**, then
play with them. It also tells how to use the anywidget instruments.

**Instrument panel** uses the
[anywidget instruments](https://anywidgetinstruments.github.io/): its first
cell installs them from the wheels published with their demos (you are asked
first, then they are kept for offline use); two knobs and a switch, made
reactive with `pwo.ui`, drive a tank, a gauge, a thermometer, a LED and a
seven-segment display, as in their marimo gallery.

**Languages** holds one small program in each language the cells run:
statistics in Python, Fibonacci numbers in JavaScript, a word count in Lua,
a table created then queried in SQL, a sieve of Eratosthenes in C, a sorted
ranking in C++, and a linear fit with its plot in R. Press **⏩**: each
runtime is downloaded the first time, after you agree (see
[Other languages](./code.md#other-languages-lua-sql-c-c-r)).

**Measurements and charts** is a workbook: a damped signal computed by
formulas (`EXP`, `SIN`) from two parameters you can change, with its line
chart, and a linear fit of measurements (`SLOPE`, `INTERCEPT`, `RSQ`,
`STDEV`) with its scatter chart.

The cells of the lab report are Python files in `src/templates/lab/<lang>/`;
after changing them, `just template-figures` (Python with numpy, matplotlib
and SymPy) runs them again and stores their output and figures.

## Template files

Template files made by LibreOffice, Word, Excel or PowerPoint (`.ott`,
`.ots`, `.otp`, `.dotx`, `.xltx`, `.potx`) open like any file, as a **new,
untitled document**: saving it never changes the template. To make one,
choose **Save as… › Save as template file (.ott)…** (or `.dotx`, `.ots`,
`.xltx`, `.otp`, `.potx`, depending on the document). Template files can be
shared and used in other office suites.

## Your own templates

In an open document, **Save as… › Save as template…** keeps a copy of it in
the browser under a name you choose. It then appears first in the gallery,
under **My templates**; **✕** deletes it. Saving again under the same name
replaces it.

These templates stay in this browser only (IndexedDB): they are not sent
anywhere, and clearing the browser's data deletes them. To share a template,
save the document as a file.

## Templates of a folder

When a [folder](./folders.md) is open, the documents of its `Templates`
folder (also `_templates` or `Modèles`, sub-folders included) appear first in
the gallery, under **Templates of** *the folder*. Choosing one opens a copy: a
new document, the template itself staying as it is.

In a folder you can write to, **Save as template…** asks where to keep the
template: in the folder's `Templates` folder (created if needed), shared with
everyone using the folder — a Git repository or a Nextcloud folder, for
instance — or in this browser.
