---
description: Design notes of the offline synchronisation of text documents (COLLAB-008), typical update sizes, how to measure QR throughput, extraction obstacles and a manual test scenario on two devices.
---

# Offline synchronisation: design notes

User documentation: [Synchronising without a network](./guide/offline-sync.md).
Frame format and threat model: `docs/collab-sync-protocol.md` in QRShare.

## Pieces

| Where | What |
| --- | --- |
| `@scelles/collab` (QRShare), `offline` | Frames (`QSYN` v1), Ed25519 keys and trusted peers, state vector and updates, validation on an isolated copy, import log, several frames per transfer |
| QRShare app | Handoff protocol v2: `mode=animated-qr` to show codes without the chooser, `reply=opener` to send scanned codes back to the app window |
| `src/collab/offline/crdt.ts` | A `RichDocument` as a Yjs document: the body as a `Y.XmlFragment` diffed from the ProseMirror document with y-prosemirror (`updateYFragment`), properties, page setup and sources as JSON values, images by id; reading checks the schema, the limits and every JSON value |
| `src/collab/offline/sync.ts` | `DocumentSync`: the passes (three for a two-way sync, one for the whole document), trust and review prompts |
| `src/collab/offline/store.ts` | IndexedDB `pwo-offline`: device key, trusted peers, import log (500 entries), one Yjs snapshot per document |
| `src/collab/offline/ui.ts` | The dialog: show with QRShare, scan with QRShare, files of codes as a fallback |

The editor is not bound to the Yjs document live: the open document is
diffed into it when the dialog opens, and read back after an update is
applied. The ProseMirror transaction that writes it back is added to the
undo history.

The document identifier (a UUID) is kept in the file (`dc:identifier` in
DOCX, a user-defined property in ODT, `identifier` in Markdown front
matter) and links the file to its Yjs snapshot on each device. A device
that has the file but not the snapshot must **join** (take the other
device's history) rather than create a history of its own: two histories
built independently from the same text would merge into duplicated text.

## Typical sizes

Measured with `Y.encodeStateAsUpdate` on documents written with
`writeCrdt`, compressed with raw deflate (as in the frames). "Pass" is the
whole transfer: frames, headers and Ed25519 signatures, with a `HELLO`.

| Content | Update | Compressed |
| --- | --- | --- |
| State vector, one author | 9 B | |
| Pass 1 (`HELLO` + state vector) | | 277 B |
| One word added | 26 B | 25 B |
| One paragraph of 60 words added | 443 to 489 B | 181 to 272 B |
| One paragraph deleted | 12 B | 14 B |
| 30 small edits in 30 paragraphs | 530 B | 286 B |
| Whole document, 1 page with an image | 3.0 KB | 1.1 KB (pass 1.4 KB) |
| Whole document, 10 pages (30,000 characters) | 38.9 KB | 13.3 KB |
| Whole document, 50 pages (150,000 characters) | 192 KB | 23.5 KB |

The text of the 10 and 50 page documents is generated from a small set of
syllables and compresses better than real prose; for real text, count about
a third of the update size (deflate on prose gives 2.5 to 3 times smaller).
A Yjs update of text costs about 1.3 bytes per character before compression.

Everyday passes (a session of edits) are well under 1 KB; the whole
document is only sent once per device.

## QR throughput

QRShare's animated QR presets carry 292 B (High reliability), 666 B
(Balanced) or 1,273 B (High speed) per code, at 10 codes per second by
default, so 2.9, 6.7 and 12.7 KB/s before losses. Fountain codes add a
small overhead and let the receiver join at any moment and miss codes.

So a pass of a few hundred bytes fits in **one or two codes**; the time
of a pass is the time to open QRShare and aim the camera, about 10 to 20
seconds. A first transfer of a 50-page document (60 to 75 KB of real
prose) takes about 10 to 30 seconds of codes.

**Protocol to measure it on real devices.** For each preset (High speed,
Balanced, High reliability) and each pair of devices:

1. Prepare files of 1 KB, 10 KB and 100 KB of random bytes (they do not
   compress).
2. Show each file with QRShare at 10 codes per second, at 30 cm, indoor
   light; start the stopwatch when the receiving camera starts scanning,
   stop it when the file is complete. QRShare shows the rate and the
   elapsed time.
3. Repeat three times; note the median, the device models, browser
   versions and the screen brightness.
4. Then time a whole sync of a real document: three passes, from the click
   on *Sync by QR* to *Synchronisation done*.

Report the results in this page with the exact device and browser versions.

## Obstacles to extracting the PWO side

The frames, keys, peers, log and sessions are already generic in
`@scelles/collab`. What remains in PWO and would have to move or be
generalised for another app:

- **The document model.** `crdt.ts` maps PWO's `RichDocument` and
  ProseMirror schema to Yjs. Another app needs its own mapping and its own
  validator (`validate(copy)` is already a parameter of `OfflineSync`).
- **y-prosemirror's `updateYFragment`** is exported but marked internal
  and unstable. A version upgrade may change it; the tests of `crdt.ts`
  pin the behaviour.
- **The dialog** depends on PWO's DOM helpers and messages. A generic
  version would be a headless state machine (idle, show, scan, review,
  done) with UI hooks, which `DocumentSync.handle` nearly is.
- **IndexedDB stores** are PWO's (`pwo-offline`). They implement the
  `PeerStore` and `ImportLog` interfaces of the package and could move to
  it with a database name prefix, like `attachDocPersistence`.
- **Joining.** The rule "a device without the history joins" is an app
  decision made from the file identifier. Embedding the Yjs snapshot in
  the file (an extra part in ODT or DOCX packages) would remove it for
  those formats, not for Markdown.
- **Blobs.** Images travel inside the updates. The reserved `BLOB_REQUEST`
  and `BLOB` frames would let large images travel once, by SHA-256.

## Extending to spreadsheets

Real-time collaboration already shares a spreadsheet as one Yjs map entry
per cell (`src/collab/parts.ts`). The same parts could be used offline:
the cell is the unit of merge (two edits of the same cell keep one of
them, the same on every device), which is what users expect of a
spreadsheet. What is needed:

- a `writeCrdt` / `readCrdt` pair for workbooks reusing `workbookParts`,
  with a validator (cell addresses, formula length, sheet count);
- formulas are recomputed after a merge, never trusted from the update;
- structural edits (inserted rows and columns) shift addresses: with cells
  keyed by address, an inserted row on one side and an edit on the other
  land in the wrong row. Stable row and column ids would be needed first.

## Manual test on two real devices

Devices: a laptop that stays offline (Wi-Fi off, cable unplugged) and a
phone, both with Progressive Web Office and QRShare installed or cached.

1. On the laptop, open `report.odt`, click **🔄**: the identifier note is
   shown. Save the document.
2. Choose **Send the whole document (one way)**, **Show the codes**. On the
   phone, open the same `report.odt` (copied earlier), **🔄**, **Scan the
   other device**, scan, press *Open in*. Check the trust prompt shows the
   laptop's name and the same fingerprint as the laptop's dialog; trust.
   Check the summary, apply. The phone shows the laptop's content.
3. Edit the first paragraph on both devices: a word at its start on the
   laptop, a word at its end on the phone. Add an image on the phone.
4. Laptop: **Start: show my state**, **Show the codes**. Phone: **Scan the
   other device**, then **Show the codes**. Laptop: **Scan the answer**,
   apply (check that the phone's name is shown as trusted), **Show the
   codes**. Phone: **Scan the answer**, apply.
5. Check that both devices show both words and the image, and that the
   laptop never connected (no network indicator, browser devtools network
   tab empty if available).
6. Replay step 4's last codes on the phone: the log shows *nothing new*.
7. On a third device that never met the laptop, import the laptop's codes:
   the warning about an untrusted device is shown.
8. Save both documents, reopen them: the identifier is still there and
   **🔄** does not ask to join again.
