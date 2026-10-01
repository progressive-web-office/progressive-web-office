---
description: Insert and edit mathematical equations with MathLive; how equations are stored in each format.
---

# Equations

Text documents can contain mathematical equations, edited with
[MathLive](https://cortexjs.io/mathlive/)'s math field.

## Inserting and editing

1. Click **∑** in the toolbar (or press <kbd>Ctrl</kbd>+<kbd>M</kbd>).
2. Type the equation in the math field — for example `x^2` then
   <kbd>→</kbd>, `/` for a fraction, `\sqrt`, `\alpha`… — or use the
   virtual keyboard (⌨). The **LaTeX** box shows (and accepts) the source.
3. Tick **Display equation** to put it on its own, centred line.
4. Click **Insert**.

You can also simply **type** `$…$` in the text: as soon as the closing `$`
is typed, `$\frac{a}{b}$` becomes an equation (`$$…$$` gives a display
equation). Prices such as `$5` are left alone.

Click an equation in the document to edit it. Equations are rendered offline:
the fonts are bundled with the application.

## Storage in each format

| Format | Inline equation | Display equation |
|--------|-----------------|------------------|
| Markdown / MDZ | `$E=mc^2$` | `$$` … `$$` on separate lines |
| OpenDocument (`.odt`) | MathML formula object (with the LaTeX source as annotation) | same, `display="block"` |
| Word (`.docx`) | Office Math (OMML) `m:oMath` | `m:oMathPara` |
| LaTeX (`.tex`) | `$E=mc^2$` | `\[` … `\]` |

Markdown dollar signs follow the usual (pandoc) rules: `$5 and $10` stays
text because a `$` followed by a digit or preceded by a space does not close
an equation; write `\$` for a literal dollar sign.

Conversions to and from Office Math and MathML cover fractions, sub- and
superscripts, roots, sums/products/integrals, matrices, delimiters, functions,
accents, Greek letters and common operators. Other constructs are kept as
plain runs.
