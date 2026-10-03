---
description: Design PDF forms by drawing their fields, then gather the answers of the filled copies into one spreadsheet — one row per file, one column per field.
---

# Forms

Progressive Web Office makes **PDF forms** that anyone can fill in any PDF
reader (Acrobat, a browser, a phone), then **compiles the answers** of the
filled copies into a spreadsheet.

## Designing a form

1. Write the document as usual (in the word processor or elsewhere) and save
   it as PDF — or open any PDF.
2. Open the PDF and click **📝 Design the form**. A bar of field kinds
   appears:

   | Kind | For |
   |---|---|
   | ▭ Text | a line of text: a name, a date, a number |
   | ☰ Paragraph | several lines |
   | ☑ Check box | yes or no |
   | ▾ Drop-down list | one choice in a list (the choices are asked, one per line) |
   | ◉ Option button | one choice among buttons: draw one button per answer, all with the same name, each with its value |

3. Choose a kind, then **draw the field** on the page with the pointer (or
   click: the field gets a usual size there). Give it a **name** — it will
   be the column of the answers — and say whether it is **required**.
4. Click a field to **rename** or **remove** it — those that were already in
   the PDF too.
5. Click **✓ Done**, then **Save**: the fields become real AcroForm fields of
   the file.

Reopened here, the form can be filled (see [PDF › Filling forms](./pdf.md#filling-forms)).

## Compiling the answers

Send the form, get the filled copies back, then **📋 Compile form answers…**
(in the **🗂 File** menu, or the [command palette](./getting-started.md#command-palette)):

- with a folder open, choose **the PDF files of the open folder** — put the
  copies in a folder — or **choose files**;
- the answers make a new spreadsheet, **Answers**: one row per file (its
  name first), one column per field, in the order the fields first appear.
  Ticked boxes are TRUE or FALSE, numbers are numbers (but a code such as
  `01234` stays text), the choices of a multiple list are joined with `;`.

Save it as `.xlsx`, `.ods` or `.csv`, sort and filter it, chart it — or send
it to a [Grist](./grist.md) document, a real database shared online. Files
that
cannot be read (not PDF, encrypted) are left out and counted.

## Limits

- Fields are designed on a PDF: a form written in the word processor is first
  saved (or printed) as PDF.
- XFA forms (an old Adobe format) can be viewed but not designed or filled.
