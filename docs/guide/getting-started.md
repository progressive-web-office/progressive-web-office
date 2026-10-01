---
description: Open the app, install it as a PWA, create, open and save files.
---

# Getting started

Progressive Web Office is a Progressive Web App (PWA): a web page that can be installed
and works offline. Everything happens in your browser — files are never sent
to a server.

## Opening the app

The app is published at
**[s-celles.github.io/progressive-web-office](https://s-celles.github.io/progressive-web-office/)**
(the **Open the app** link at the top of this documentation); its start
screen links back here.

To host your own copy, serve the built application (`just build` then deploy the `dist/` folder to any
static web server) or run it locally with `just dev` and open the printed URL.

## Installing

In Chromium-based browsers, use the *Install* icon in the address bar
(or *Add to Home screen* on mobile). In Safari, use *Share → Add to Dock / Home
Screen*. Once installed, the app starts without a network connection.

Where the browser supports the File Handling API, the installed app registers
itself for the supported file types, so you can open a file with
*Open with → Progressive Web Office* from your operating system.

## Start screen

The start screen offers:

- **New document**, **New spreadsheet**, **New presentation**
- **Open file…** — or drop a file anywhere in the window
- the list of **recent files** (stored only in your browser)

## Languages

The interface is available in **English**, **French** (Français) and
**Simplified Chinese** (简体中文). The language is chosen from your browser
preferences on the first visit; change it with the 🌐 language selector on the
start screen — the choice is remembered in this browser.

## Light and dark theme

The theme button in the toolbar cycles between **◐ System** (default: follows
the light or dark setting of your device), **☀ Light** and **☾ Dark**. The
choice is remembered on this device. Document pages and slides keep a white
background in every theme, as on paper.

## Recent files and recovered drafts

Files you open are added to **Recent files** on the start screen (up to 12,
files under 25 MB), with their format, size and the date and time they were
last opened. The copies are stored only in this browser (IndexedDB);
**×** removes an entry and deletes its stored copy, **Clear recent files**
removes them all.

While a document has unsaved changes, a draft is saved in the browser every
30 seconds. If the tab is closed or crashes, the start screen offers to
**restore** it. Saving or closing the document discards the draft.

## Saving

- **Save** (<kbd>Ctrl</kbd>+<kbd>S</kbd>) writes the file in its current format.
- **Save as…** converts to another format of the same family
  (for example `.docx` → `.odt`, `.xlsx` → `.ods`, `.pptx` → `.odp`).

When the browser supports the File System Access API you choose where to
save; otherwise the file is downloaded.

A dot (●) next to the file name indicates unsaved changes; the browser warns
you before closing the tab in that case.

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| <kbd>Ctrl</kbd>+<kbd>O</kbd> | Open a file |
| <kbd>Ctrl</kbd>+<kbd>S</kbd> | Save |

## About

**?** in the toolbar (or *About* on the start screen) shows the version and
the git commit of the build, whether the app is installed and works offline,
and links to this documentation, the source code, the changelog and the
problem tracker. Its **QR code** opens the app on another device: scan it with
a phone camera. When reporting a problem, **Copy details** copies the version
and browser information to paste into the report.

## Limits

Files larger than 50 MB are refused to keep the browser responsive.
