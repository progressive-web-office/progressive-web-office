---
description: Print documents, spreadsheets and presentations with a print preview, page settings and PDF export.
---

# Printing

**Print** (in the header) opens a **print preview** for documents,
spreadsheets and presentations. Only the document is printed — never the
application's toolbars.

## Page settings

| Setting | Values |
|---------|--------|
| Paper | A4, Letter, A3, A5 (Letter by default in the US and Canada, A4 elsewhere) |
| Orientation | Portrait, Landscape |
| Margins | 0–50 mm |

The settings are remembered in this browser.

## By document type

- **Text documents** are paginated by the browser; headings stay with the next
  paragraph, and tables, images, code blocks and display equations are not
  split across pages when possible. Equations are printed as rendered.
- **Spreadsheets** print the used range of the current sheet, or **all
  sheets** (each starting on a new page), with optional **grid lines** and
  **row and column headings**; column headings repeat on every page.
- **Presentations** print one slide per page, or **2, 4 or 6 slides per page**
  as handouts, optionally with the **speaker notes**.
- **PDF files** open (with your filled fields, signatures and texts) in the
  browser's PDF viewer, from which you print them.

## Saving as PDF

Click **Print…** and choose **Save as PDF** (or *Microsoft Print to PDF*) as
the printer in the browser dialog. Everything stays on your device.

## Colours for print

Screens show colours with light (**RGB**: red, green, blue); printers with
inks (**CMYK**: cyan, magenta, yellow and black). The **⋯** button next to
every colour — text and highlight in documents, text and fill in
spreadsheets, fill and background in presentations — opens a colour dialog:

- swatches, and the colours used lately;
- the colour's **hexadecimal**, **RGB** and **CMYK** values, each typed
  in and the others following — a printer's CMYK values give the colour to
  use on screen;
- a warning when the colour is **brighter than a printer can print** (very
  vivid blues, greens, purples…), with how it would print next to it and
  **Use the printable colour**;
- the **total ink** of the CMYK values, with a warning above 300 %, when
  the ink may not dry and may smear.

In a document, *View › Print colours (CMYK preview)* shows the coloured
text and highlights as a printer would print them; the document keeps its
colours.

These are approximations, as in office suites: CMYK values are converted
without a colour profile, and what prints is checked against a coated paper
offset press (close to FOGRA39). Files keep RGB colours; LaTeX reads
xcolor's `HTML`, `rgb`, `RGB`, `cmyk` and `gray` models and its base
colours. ICC profiles and PDF/X are on the roadmap.

