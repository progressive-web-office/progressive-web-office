---
description: Run Python (Pyodide, numpy, matplotlib…) and JavaScript code cells in text documents, safely sandboxed; how cells and outputs are stored.
---

# Code cells

Text documents can contain **code cells**, in Python or JavaScript, that you
run on demand — like a notebook, inside a normal document. Useful for a
practical session, a lab report or a small calculation whose result should
stay next to the explanation.

## Inserting and running

1. Click **{ }** in the toolbar, choose the language and type the code
   (<kbd>Tab</kbd> indents).
2. Click **Insert**: the cell is added on its own line.
3. Click **▶** to run the cell, or **⏩** to run all the cells of the document
   (in the order of what they use, see below).

Print results with `print()` (Python) or `console.log()` (JavaScript); in
Python, the value of the last line is shown too. Figures drawn with
**matplotlib** are added below the output. Cells of the same language share
their names: define `x` in one cell and use it in another, in Python as in
JavaScript (where `const`, `let`, functions, classes and imports declared at
the top level of a cell are shared).

Click the code or **✎** to edit a cell; changing the code removes its previous
output. **■** stops a running cell (for example an endless loop) — the next run
starts afresh.

```python {run}
import numpy as np
import matplotlib.pyplot as plt

t = np.linspace(0, 10, 500)
plt.plot(t, np.exp(-0.3 * t) * np.sin(2 * np.pi * t))
plt.title("Damped signal")
```

## Reactive cells

The cells of a document know what they use: a cell **depends** on the cells
that define the names it uses. So:

- cells run in the order of their dependencies, wherever they are in the
  document: a cell using `a` runs after the cell defining `a`, even if that
  cell comes later;
- when you change or run a cell, the cells using what it defines are marked
  **⟳ out of date** (their output is dimmed): it is no longer the result of
  the current code. Run one of them: the out-of-date cells it uses run first;
- a cell you have just changed is out of date too, until it runs.

*Settings › Writing › When a code cell runs* chooses what happens to the
cells using it:

| Setting | Behaviour |
|---------|-----------|
| mark them as out of date (default) | they keep their output, marked ⟳, until you run them — good for long computations |
| run them too | they run right away, like a spreadsheet |
| run it alone (no dependencies) | the classic notebook: cells run in the order of the document, and JavaScript cells do not share their names |

Two rules keep the results reproducible, with no hidden state:

- **a name is defined in one cell only.** A name defined in two cells is
  reported in both (“`x` is defined in several cells”), and they do not run.
  Names starting with `_` (`_i`, `_tmp`) stay inside their cell and may be
  reused anywhere;
- two cells cannot use each other (a cycle): they are reported and do not
  run.

A name no cell defines any more (you deleted or changed the cell defining it)
is removed from the interpreter at the next run, so a cell still using it
fails instead of using an old value.

### Seeing the dependencies

*View › Dependencies of the cells* (or **🔀** in the bar of a cell) shows,
next to the document, the graph of the cells: one box per cell (its number,
its language and the names it defines), an arrow from a cell to each cell
using it, labelled with the names it carries. The colour tells the state of
each cell:

| Colour | State |
|--------|-------|
| green | run |
| grey, dashed | out of date |
| red | failed (or a name defined twice, a cycle) |
| yellow, dashed | a cell it uses failed (the arrow carrying the failure is red) |
| white | not run yet |

Click a box to go to its cell; **🔀** on a cell draws its box out in the
graph. The graph follows the changes of the document and the runs. *As a
list* gives the same information as text: what each cell defines, which cells
it uses (and through which names), and which cells use it.

Showing the graph starts the Python interpreter to read the cells (no code of
the document runs).

## Hiding the code

**🙈** in the bar of a cell hides its code: only its output (text and
figures) stays, on screen, in print and in the Word, OpenDocument and LaTeX
exports — for example to hand out a sheet of results, or plots without the
program behind them. The cell can still be run; **👁** shows the code again.
*View › Hide the code of every cell* (or *Show…*) does it for the whole
document. In Markdown, the code is kept, with the `hide` flag:
```` ```python {run hide} ````.

## Completion

The code editor of a cell highlights the code, indents it (<kbd>Tab</kbd>),
closes brackets and quotes, and **completes as you type**: keywords,
built-in functions, the names of the cell, and for JavaScript the standard
objects and their members (`Math.floor`, `JSON.stringify`…). JavaScript cells
are understood by the TypeScript language service: the members of a value
after a dot (`words.flatMap` for an array), signatures and documentation,
syntax errors underlined.
<kbd>Ctrl</kbd>+<kbd>Space</kbd> opens the list, <kbd>↑</kbd> <kbd>↓</kbd>
choose, <kbd>Enter</kbd> inserts, <kbd>Esc</kbd> closes it.

Once Python has run a cell of the document, its completions come from the
running interpreter (jedi): the **variables, functions and modules of the
earlier cells** are known, a module's members are listed after a dot
(`statistics.mean`, `np.linspace`), with each function's **signature** and
**documentation** beside the list. Python is not started only to complete:
before the first run, the completion knows the language and the cell.

## Safety

A document can come from anyone, so its code is treated as untrusted:

- **Nothing runs when you open a document.** The first time you run a cell
  in a document, Progressive Web Office explains what running it means and
  asks for confirmation.
- The code runs in an **isolated sandbox**: it cannot read the page, your
  other documents, your recent files, your AI or Git keys, or your settings,
  and it has **no network access**. It cannot open windows or dialogs either.
- It runs in the background: the application stays responsive and **■**
  stops it at any time.

The code can still compute wrong or misleading results — run code only from
documents you trust.

## Python and offline use

Python is provided by [Pyodide](https://pyodide.org/) (Python 3.14 compiled
to WebAssembly). The interpreter and the standard library (about 13 MB) are
served by the application and loaded the first time you run Python; they are
then kept for offline use.

Packages that are not part of the standard library — numpy, matplotlib,
pandas, scipy, sympy and the
[other Pyodide packages](https://pyodide.org/en/stable/usage/packages-in-pyodide.html) —
are detected from the `import` lines and downloaded from the Pyodide CDN
(`cdn.jsdelivr.net`) the first time they are used, then kept for offline use.
Each package is checked against the fingerprints shipped with the
application. Installing arbitrary packages from PyPI is not supported.

## Storage in each format

| Format | Cell | Output |
|--------|------|--------|
| Markdown / MDZ | a fenced block with the `{run}` attribute: ```` ```python {run} ```` or ```` ```javascript {run} ```` | a following ```` ```text {output} ```` block (```` {output error} ```` for an error) and figures as images titled `output` (MDZ stores them as image assets) |
| Word, OpenDocument, LaTeX | the code as a code block | the last output as a code block and the figures as pictures |

In Markdown, other tools show the cells as ordinary code blocks with their
results. Word, OpenDocument and LaTeX files keep the code and its last output
for reading and printing, but not as runnable cells.

When printing, the code and its last output are printed; the buttons are not.
