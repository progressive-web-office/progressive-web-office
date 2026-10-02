---
description: Exchange documents between two devices with QRShare (animated QR codes, no cloud) and the Web Share Target.
---

# Sending to another device

Progressive Web Office works with [QRShare](https://github.com/s-celles/QRShare),
a companion web app that moves files between two devices with **animated QR
codes** — no account, no cloud, and even without any network connection — or
with a direct peer-to-peer connection when you allow it.

## Send the open document

1. Click **📲** (*Send to another device…*) in the toolbar.
2. Choose the **transfer policy**:
   - **Air-gapped only (QR codes)** — the file never travels over a network;
   - **Prefer air-gapped** (default) — QR codes are recommended, network modes
     stay available;
   - **Any mode** — QRShare may recommend a direct network connection for large
     files.
3. Click **Send**. Depending on the document and the browser:
   - a small text document (Markdown, CSV, LaTeX) opens directly in QRShare,
     ready to send;
   - any other document is **handed to QRShare inside the browser** — no
     download, no upload: QRShare opens with *Received from …* and the file
     ready to send;
   - with an older QRShare that does not support this, the file is downloaded
     and QRShare opens its *Prepare a transfer* screen, where you select it.

   **Share with another app…** (phones, tablets, Windows, macOS, ChromeOS)
   opens the system share sheet instead, to send the file to QRShare or any
   other app.

The policy is remembered. Under **Advanced** you can point to another QRShare
installation (for example a self-hosted copy on your network).

## Share a link containing the document

For a short document, the simplest is a **link that contains the document
itself**. In the **📲** dialog, under *Or share a link that contains the
document itself*, click **Copy link** and paste it in a message, an e-mail or
a chat. Whoever opens the link gets a copy of the document in Progressive Web
Office, ready to edit and save.

- The document is compressed and placed after the `#` of the address
  (`…/progressive-web-office/#doc=v1.…`). Browsers never send that part to
  the server: **the document is not stored anywhere** but in the link.
- Text documents travel as Markdown (much shorter than Word); spreadsheets,
  presentations and PDF files in their own format.
- The dialog shows the size of the link. Above about 8 KB some messaging apps
  or mail clients may cut it — send the file (or use QRShare) instead. Very
  large documents cannot be put in a link at all.
- Anyone who has the link can read the document: share it as you would share
  the file.

Opening a damaged (cut) link shows an error; the address is cleaned up once
the document is open, so reloading the page does not reopen it.

## Link to a document on a server

To let people **read** a document without sending them the file, put the file
on a web server and share a link to it: 🔗 (*Link to a file on a server*, in
**⋯** on a phone) asks for the address of the file, checks that it can be
downloaded and gives a link and its QR code.

- The link opens the document **read-only**; *Edit a copy* turns it into an
  untitled copy on the reader's device.
- *Only this version* (on by default) puts the file's SHA-256 fingerprint in
  the link: if the file on the server changes, the link refuses to show it,
  so that readers see exactly what you shared.
- The file is downloaded by the reader's browser, straight from your server;
  its address stays in the part of the link after `#`, which browsers do not
  send to the server of Progressive Web Office.
- The server must let other sites read the file (CORS). GitHub Pages and raw
  GitHub files do; for Nextcloud or your own server, allow it for the file.
  Only `https://` addresses are accepted, and files up to 50 MB.

## Receive on this device

On the start screen, click **Receive from another device…**: QRShare opens its
receive screen. Once the file is received, click **Open in
s-celles.github.io** (the address of Progressive Web Office) in QRShare: the
file opens directly in a new Progressive Web Office window. Only files coming
from the QRShare address set in *Advanced* are accepted.

You can also download the file from QRShare and open it here (or drop it on
the window), or — with the app installed — share it from QRShare to
Progressive Web Office.

## Share target

Installed as an app, Progressive Web Office registers as a **share target**
for every supported format: files shared from QRShare, a file manager, a mail
client or any other app open directly in the editor. Shared plain text opens
as a new Markdown document.

::: info Licences
QRShare and Progressive Web Office are both published under the GNU AGPL-3.0
(or later). They remain separate applications: Progressive Web Office opens
QRShare's public pages and uses the browser's standard sharing features.
:::
