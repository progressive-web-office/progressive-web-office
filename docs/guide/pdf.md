---
description: View PDF files, fill in PDF forms and add a handwritten signature.
---

# PDF

## Viewing

Open a `.pdf` file to display its pages.

- **◀ ▶** or the page box: navigate (the current page follows scrolling).
- **− / +**: zoom; **↔**: fit to width (default).
- Text can be **selected and copied** (text layer).
- **Print** opens the PDF (with your changes) in the browser's PDF viewer,
  from which you can print it.

Pages are rendered only when they come into view, so large documents open
quickly. Fonts, CMaps and image decoders are bundled with the application:
viewing works offline.

## Filling forms

If the PDF contains an interactive form (AcroForm), its fields become
editable directly on the page: text fields, checkboxes, radio buttons,
drop-down and list boxes. Saving writes the values into the PDF and
regenerates their appearance, so that every PDF reader shows them.

Two ways to save a filled form:

- **Save** (or **Save as… → PDF document**) keeps the fields editable, so
  you or someone else can change the answers later.
- **Save as… → Flattened PDF – fields locked** writes a *copy* named
  `…-flattened.pdf` in which the answers, signatures and added text become
  part of the page: the form can no longer be changed. Send this version
  when the form is final. The open document is not affected; you can keep
  editing it and save it normally.

## Signing

1. Click **✍ Sign**.
2. Draw your signature with the mouse, a finger or a stylus (pressure is
   used when available), or **Import image…** (PNG, JPEG, WebP).
3. Click **Place signature**: it appears on the current page.
4. Drag it to move it, drag the corner handle to resize it, or focus it and
   use the arrow keys (<kbd>Shift</kbd> for larger steps). <kbd>Delete</kbd>
   or **×** removes it.

**T+ Text** adds free text (today's date by default), for example a name or a
date next to the signature.

::: warning Visual signature only
The signature is an image added to the page. It is **not** a cryptographic
digital signature (certificate-based, PAdES) and does not prove the
document's integrity.
:::

## Limits

- Encrypted PDFs and XFA forms are displayed **read-only**, with an
  explanation.
- PDF JavaScript is never executed.
- General content editing and annotations are not supported.
