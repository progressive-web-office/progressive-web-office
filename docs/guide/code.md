---
description: Run Python (Pyodide, numpy, matplotlib…) and JavaScript code cells in text documents, safely sandboxed; reactive cells and their dependency graph; interactive widgets (anywidget); how cells and outputs are stored.
---

# Code cells

Text documents can contain **code cells**, in Python or JavaScript, that you
run on demand — like a notebook, inside a normal document. Useful for a
practical session, a lab report or a small calculation whose result should
stay next to the explanation. Cells are **reactive** (a cell knows the cells
it depends on) and can show **interactive widgets** (knobs, sliders,
gauges…). The examples *Lab report with Python plots*, *Interactive widgets*
and *Instrument panel* (Templates and examples) show them at work.

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

## Widgets

Cells can show **interactive widgets**: knobs, gauges, sliders, charts…
Progressive Web Office is a host of [anywidget](https://anywidget.dev)
widgets: a widget is a web module (its *front end*) and a set of values
(*traits*) shared with the code. Moving a knob changes the value in the code;
changing the value in the code moves the knob.

### From Python

Write widgets as in Jupyter or marimo, with `anywidget` and `traitlets`; the
widget on the last line of a cell (or given to `display()`) is shown below
it:

```python {run}
import anywidget, traitlets, pwo

class Counter(anywidget.AnyWidget):
    _esm = """
    export default {
      render({ model, el }) {
        const b = document.createElement("button");
        const show = () => { b.textContent = `count is ${model.get("count")}`; };
        b.onclick = () => { model.set("count", model.get("count") + 1); model.save_changes(); };
        model.on("change:count", show);
        show();
        el.append(b);
      },
    };
    """
    count = traitlets.Int(0).tag(sync=True)

counter = pwo.ui(Counter())
counter
```

- `anywidget`, `ipywidgets`, `comm` and `psygnal` come with the application
  (they work offline); they are loaded the first time a cell mentions them.
- **`pwo.ui(widget)`** makes the widget *reactive*: when the user changes
  it, the cells using it run again (like `mo.ui.anywidget` in marimo). A
  widget without `pwo.ui` only changes its values (and calls its
  `observe` / `on_change` callbacks).
- Layout widgets of `ipywidgets` are drawn too: `HBox`, `VBox`, `Box`,
  `GridBox` with their `Layout`, `Label`, `HTML`. Other `ipywidgets`
  controls (sliders, buttons…) are not: use an anywidget.
- Widgets composed of other widgets (AFM references `anywidget:<id>`) work.

### Packages of widgets

**`await pwo.install(...)`** installs packages of pure Python wheels:

- a wheel URL: `await pwo.install("https://example.org/x-1.0-py3-none-any.whl")`;
- a list of wheels, one per line, relative to the list (`wheel.txt`, as
  published with the anywidget instruments demos):
  `await pwo.install("https://example.org/demo/public/wheel.txt")`;
- a project name of the Python package index: `await pwo.install("some-widget")`.

The first download from a site asks you (**Download code for this
document?**): allow only sites you trust. Downloaded packages are kept for
offline use. Their requirements that come with Python in the browser
(`numpy`…) are loaded with them.

### From JavaScript

JavaScript cells create widgets from the text of a module and its traits:

```javascript {run}
const esm = await importWidget("https://example.org/widgets/index.js");
const css = await importWidget("https://example.org/widgets/index.css");
const gauge = widget(esm, { value: 3.2, min: 0, max: 5, label: "Level" }, { css });
const gain = ui(widget(esm, { value: 2.5 }, { css }));
display(gauge, gain);
```

- `widget(esm, traits, { css })` creates a widget; `w.get(name)`,
  `w.set(name, value)`, `w.on("change:name", callback)`, `w.send(message)`.
- `display(...)` shows widgets below the cell; `ui(w)` re-runs the cells
  using `w` when the user changes it.
- `importWidget(url)` gives the text of a module (or a style sheet), after
  you allowed the site.

### Instrument panels

The [anywidget instruments](https://anywidgetinstruments.github.io/)
(industrial, automotive, aeronautics) work in both ways: from Python with
their package (`await pwo.install(".../wheel.txt")` then
`import anywidget_instruments_industrial as ai`), or from JavaScript with
their front end and the traits of their contract (`_kind` selects the
instrument):

```javascript {run}
const esm = await importWidget("https://example.org/instruments/index.js");
const css = await importWidget("https://example.org/instruments/index.css");
const level = widget(esm, { _kind: "tank", value: 3.2, min: 0, max: 5, unit: "m", label: "Level" }, { css });
const gain = ui(widget(esm, { _kind: "knob", mode: "control", value: 2.5, max: 10, unit: "dB", label: "Gain" }, { css }));
display(level, gain);
```

These instruments are for visualization, teaching and simulation: they are
not certified instruments.

### Safety, saving and printing

Each widget runs in a frame of its own, isolated like the cells: no access
to the page, your files or other documents, and no network. When the
document is saved or printed, each widget is kept as a **picture**: it is
shown in print, in Word, OpenDocument and LaTeX exports, in Markdown
(`![Widget](… "widget")`) and when the document is reopened, until the cell
runs again.

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
- Widgets run each in a frame of their own, isolated in the same way (no
  access to the page, no network).
- Code can download packages or widget modules (`pwo.install`,
  `importWidget`) only from a site you allowed, when the code first asks
  for it (**Download code for this document?**).

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
application.

The widget packages (anywidget, ipywidgets, comm, psygnal) come with the
application. Other pure-Python packages can be installed by a cell with
`await pwo.install(...)`, from a wheel URL, a `wheel.txt` list or the Python
package index, once you allowed the site (see [widgets](#packages-of-widgets)).
Packages with compiled code are only those of Pyodide.

## Other languages: Lua, SQL, R, C/C++

Python and JavaScript are part of the application. Other languages run with a
**runtime downloaded the first time it is needed**, from the npm CDN
(`cdn.jsdelivr.net`), after you agree for that site; it is then kept in the
browser and works offline. Each file is a pinned version, checked against its
SHA-256 before use.

| Language | Files | Runtime | Download |
| --- | --- | --- | --- |
| Lua 5.4 | `.lua`, ```` ```lua {run} ```` cells | wasmoon | about 0.5 MB |
| SQL (SQLite) | `.sql`, ```` ```sql {run} ```` cells | sql.js | about 0.7 MB |

A `.lua` or `.sql` file opened in the code viewer shows **▶ Run**; in a
document, cells of these languages run like the others, in document order
(they share no names with Python or JavaScript cells). Successive runs share
their state: Lua globals, and the tables of the SQL database (in memory,
for the session). A SQL query shows its rows as a table.

## marimo notebooks

A [marimo](https://marimo.io) notebook — a `.py` file whose cells are
`@app.cell` functions — opens as a document: cells holding only
`mo.md("""…""")` become text, the others Python cells (those marked
`hide_code=True` show their output only). The cells run here like any Python
cells, reactively: `import marimo as mo` gives a small stand-in offering
`mo.md` and `marimo.App`; the rest of marimo (`mo.ui`…) needs marimo itself.
**Save** writes the notebook back as marimo reads it: unchanged cells exactly
as they were, edited cells with their arguments (the names they use from other
cells) and returned names computed again. A `.py` file that is no marimo
notebook opens as Python source code, which runs with **▶ Run**; when it
imports a package the offline Python lacks, a button downloads it from the
package index (pure-Python packages) and runs the file again.

## KaimonSlate notebooks (Julia)

A [KaimonSlate](https://github.com/kahliburke/KaimonSlate.jl) notebook — a
`.jl` file whose cells start with `#%% md` or `#%% code` lines — opens as a
document: text cells as formatted text, code cells as **Julia** cells showing
their header (`#%% code id=… tags`). You can read, edit, comment, version and
share it like any document, and **Save** writes the notebook back: headers,
ids and tags are kept, and the text cells you did not change keep their
Markdown exactly as written. A `.jl` file without `#%%` cells opens as Julia
source code.

Julia does not run in the browser: run the notebook in KaimonSlate itself
(`slate notebook.jl`). Here, Julia cells have no ▶ button.

## Storage in each format

| Format | Cell | Output |
|--------|------|--------|
| Markdown / MDZ | a fenced block with the `{run}` attribute: ```` ```python {run} ```` or ```` ```javascript {run} ```` | a following ```` ```text {output} ```` block (```` {output error} ```` for an error) and figures as images titled `output` (MDZ stores them as image assets) |
| Word, OpenDocument, LaTeX | the code as a code block | the last output as a code block and the figures as pictures |

Widgets are kept as their picture, taken when the document is saved or
printed: in Markdown, an image titled `widget`; in other formats, a picture
after the output. Out-of-date marks are not saved: a reopened document
starts with no run.

In Markdown, other tools show the cells as ordinary code blocks with their
results. Word, OpenDocument and LaTeX files keep the code and its last output
for reading and printing, but not as runnable cells.

When printing, the code and its last output are printed; the buttons are not.
