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
   from the top (it stops at the first error).

Print results with `print()` (Python) or `console.log()` (JavaScript); in
Python, the value of the last line is shown too. Figures drawn with
**matplotlib** are added below the output. Python cells share their
variables, like a notebook: define `x` in one cell and use it in the next.

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

## Completion

The code editor of a cell highlights the code, indents it (<kbd>Tab</kbd>),
closes brackets and quotes, and **completes as you type**: keywords,
built-in functions, the names of the cell, and for JavaScript the standard
objects and their members (`Math.floor`, `JSON.stringify`…).
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
