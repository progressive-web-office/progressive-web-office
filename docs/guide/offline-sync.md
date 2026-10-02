---
description: Merge the changes made to a text document on two devices, one of them never connected to a network, by showing and scanning QR codes with QRShare.
---

# Synchronising without a network

Two people can work on the same **text document** on their own devices, at
different times, and merge their changes later by **showing and scanning
QR codes**. No network is used: this works with a computer that is never
connected, in a classroom, on a field trip or in a secure room.

Changes made on both sides are all kept, down to the character: if one
person adds a word at the start of a paragraph and the other fixes a typo at
its end, both changes are in the result.

The codes are shown and scanned by [QRShare](https://s-celles.github.io/QRShare/),
in another window. QRShare needs version 2 of its app handoff protocol
to send the scanned codes back; with an older QRShare, the codes can still
travel as files (on a USB stick, for example).

## The first time: give the document to the other device

1. Open the document and click **🔄** (*Sync by QR*). The first time, an
   identifier is added to the document: **save the document** so that the
   file keeps it.
2. Choose **Send the whole document (one way)**, then **Show the codes**.
   QRShare shows animated QR codes.
3. On the other device, open a copy of the same document (for example the
   file you saved at step 1), click **🔄**, then **Scan the other device**.
   Aim the camera at the codes; once they are received, press QRShare's
   *Open in* button.
4. The other device shows who sent the codes and asks whether to trust that
   device, then shows a summary of the changes (additions, deletions, size)
   and asks whether to apply them.

A device that receives a document for the first time takes the content of
the other device: changes made on it before this first synchronisation are
replaced.

## Merging the changes of both devices

Three passes, each a short sequence of codes:

1. **Ana** clicks **🔄** then **Start: show my state**, then **Show the
   codes**. These codes are small: they only say what Ana's device already
   has.
2. **Bob** clicks **🔄** then **Scan the other device** and scans Ana's
   codes. His device prepares an answer with the changes Ana does not have;
   he clicks **Show the codes**.
3. **Ana** clicks **Scan the answer**, scans Bob's codes and applies them.
   Her device then shows the changes Bob does not have: Bob scans them with
   **Scan the answer** and applies them.

Both devices now have the same document. Save it to keep the result in the
file. Every change can be undone with **Ctrl+Z**, like an edit.

To only bring one device up to date, **Send the whole document (one way)**
is a single pass.

## Trust and safety

- Each device has its own key, created the first time and kept in the
  browser. When a device introduces itself, its name and a **fingerprint**
  (for example `A1B2 C3D4`) are shown: compare it with the one shown on the
  other device before trusting it.
- Once a device is trusted, codes claiming to come from it must be signed by
  its key; codes with a wrong signature are rejected.
- Changes from a device that is not trusted can still be applied, after a
  warning: nothing then proves who made them.
- Received changes are first applied to a copy of the document and checked
  (structure, sizes, properties). Only then is the document changed.
  Anything wrong is rejected and the document stays as it was.
- The last imports are listed under **Last imports** in the dialog:
  applied, nothing new, refused or rejected.

## Without QRShare version 2

**Save the codes as a file** writes the codes of the current step to a
`.qsyn` file; **Import a file of codes…** reads one. Files can travel on a
USB stick, by mail, or through QRShare like any other file.

## What is synchronised

The text and its formatting, tables, images, equations, the document
properties, header and footer, and the bibliography. Spreadsheets and
presentations are not synchronised this way yet; use
[real-time collaboration](./collaboration.md) when the devices are online.

If no device has the history of a document any more (for example after
clearing the browser data), **Start the history from this copy** starts a
new one from the open document.
