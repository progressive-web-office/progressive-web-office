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
