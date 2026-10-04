---
description: How Progressive Web Office and DigitalSignalix work together — shared formats for apps, sending slides to the screens, provenance, exports — and what is still open.
---

# DigitalSignalix

DigitalSignalix, by the same author, shows content
on screens driven by Raspberry Pi boards: a Manager (Rust, REST API, web
console) prepares what each screen plays, and the screens play it offline.
PWO is where that content is written: slides, menus and timetables kept as
spreadsheets, documents.

::: info Status
Agreed between the two projects; nothing is implemented yet. PWO's side is
drafted as requirements PLUG-009, PLUG-010, PRES-017..PRES-022 and
SIGN-001..SIGN-005 in the [requirements](./requirements.md); the contract
between the projects is the [JSON Schemas](#json-schemas) PWO publishes.
:::

## Position

- **Two programs, one set of formats.** The projects share file formats
  and an HTTP API, never code: DigitalSignalix is MIT, PWO is
  AGPL-3.0-or-later.
- **The Manager converts no office file.** PWO turns a presentation into
  what screens play — an image per slide, later a video for an animated
  slide — and sends it.
- **Screens reach nothing.** They play what the Manager gives them; the
  Manager fetches the data and the apps, PWO sends to the Manager.
- **Nothing leaves the user's device without their action**: sending to a
  Manager is a command the user runs, to a Manager they added.

## Apps for screens and PWO plugins: one format

PWO's plugin formats (a [proposal](./plugins.md), PLUG-001..PLUG-010) are
also those of the apps of the screens:

- one [`manifest.json`](./plugins.md#manifest-json), with `targets`
  (`pwo`, `signage`): each host installs only what names it;
- one [`registry.json`](./plugins.md#an-entry-of-registry-json): versions
  with the SHA-256 of every file, licence, revoked versions; the Manager
  mirrors registries, screens never reach them;
- one [message protocol](./plugins.md#messages-of-code-plugins) for code
  in a sandboxed iframe: an envelope `{ "type": "pwo-plugin", "version": 1,
  "action", "id" }`; `init` hands over the settings, the data and the size;
  `visibility` starts and pauses; `fetch` goes through the host, which a
  screen answers from what the Manager kept.

## Sending a presentation to the screens

**Share › Send to DigitalSignalix…** in the presentation editor (and in the
command palette):

1. the Manager to send to — added once in **Settings › Connections**, like
   the Grist and WebDAV accounts: its address and a token of a screen
   manager or an administrator, checked when added, kept in this browser or
   for this session only, forgotten on request;
2. the presentation of the Manager to replace, or a new one, by name;
3. each slide exported as an image (PNG by default, WebP), 1920 × 1080 by
   default; its duration is the slide's own advance time (kept in the ODP
   and PPTX file), else a duration chosen for all;
4. the images not yet on the Manager are sent (`HEAD` by their SHA-256
   first), then the presentation, with the progress shown; the address of
   the presentation in the Manager's console is offered at the end.

### The calls

```http
GET  /v1/me                                   → { "name", "role" }   (checks the token)
GET  /v1/presentations                        → [{ "id", "name" }]
HEAD /v1/assets/{sha256}                      → 200 or 404
POST /v1/assets?kind=image&name=slide-03.png  ← the bytes, Content-Type: image/png
                                              → { "sha256": "<hex>" }
PUT  /v1/presentations/{id}                   ← the presentation below
```

```json
{
  "id": "menu-week-41",
  "name": "Menu, week 41",
  "slides": [
    { "id": "s-7f3a", "source": { "file": "39bb64571e015b946d402b243c505fd662c9cc7bc18e6f86240324c82b47c899" }, "duration": 10 },
    { "id": "s-91c0", "source": { "file": "984679c446550e3918d30d68db95ba6ec2463afa1591691fe2154bb921da4c38" }, "duration": 15 }
  ],
  "provenance": {
    "provenanceVersion": 1,
    "tool": { "name": "Progressive Web Office", "version": "0.3.0+20261104", "commit": "1a5c7cd", "url": "https://progressive-web-office.github.io/" },
    "source": { "name": "menu-week-41.odp", "mediaType": "application/vnd.oasis.opendocument.presentation", "sha256": "49559d218a6d99503364926b093c005e702446fb4bd48844e499283af81fd443" },
    "created": "2026-10-04T09:30:00Z"
  }
}
```

A slide's `id` is the slide's own identifier, kept in the ODP and PPTX file
(PRES-019), so that sending again updates the same slides.

### Provenance

Sent with the presentation (`provenance`), and with each asset in the
header `Provenance` (the same JSON, base64url-encoded, its `slide` set):

```json
{
  "provenanceVersion": 1,
  "tool": { "name": "Progressive Web Office", "version": "0.3.0+20261104", "commit": "1a5c7cd", "url": "https://progressive-web-office.github.io/" },
  "source": {
    "name": "menu-week-41.odp",
    "mediaType": "application/vnd.oasis.opendocument.presentation",
    "sha256": "49559d218a6d99503364926b093c005e702446fb4bd48844e499283af81fd443",
    "origin": "https://cloud.example.org/remote.php/dav/files/ada/menus/menu-week-41.odp"
  },
  "slide": 3,
  "export": { "mediaType": "image/png", "width": 1920, "height": 1080 },
  "author": "Ada Lovelace",
  "created": "2026-10-04T09:30:00Z"
}
```

- `source.origin` only when the document came from a network place
  (FILE-029); `author` only when the user gave their name in the settings
  and left it checked in the sending window.
- `created` in UTC; `tool.version` as shown in **About** (with the date of
  the build).

### What the browser needs

- The Manager serves HTTPS with a certificate the browser trusts — the
  site's own certification authority, installed on the computer.
- It answers the CORS preflights of the declared origins
  (`https://progressive-web-office.github.io`, and a self-hosted PWO), the
  `Authorization` and `Provenance` headers allowed.
- PWO is a public page calling an address of the local network: Chromium
  browsers ask the user's permission for it (Local Network Access, which
  replaces the Private Network Access preflights) and Firefox may refuse it;
  PWO says so when a call fails, as it does for Grist and WebDAV.

## Exports for the screens

| Export | PWO | Priority |
|---|---|---|
| An image per slide (PNG, WebP), at a chosen size, 1920 × 1080 by default; a slide of another shape fitted, the margins in a chosen colour | PRES-017 | Should, 0.3.0 |
| The advance time of each slide, kept in ODP (`presentation:duration`) and PPTX (`advTm`) | PRES-018 | Should, 0.3.0 |
| Stable slide identifiers, kept in ODP and PPTX | PRES-019 | Should, 0.3.0 |
| Animations — entrance, exit, motion; keyframes of position, opacity, scale and rotation with easing — read and written as ODF animations (SMIL) and PPTX timing, played in the slideshow | PRES-020 | Could, 0.4.0 |
| A timeline editor of those animations | PRES-021 | Could, 0.4.0 |
| A slide or a presentation as an MP4 video (H.264, up to 1920 × 1080, 30 frames per second), encoded by WebCodecs in the browser and written by Mediabunny (MPL-2.0) | PRES-022 | Could, 0.4.0 |

About the video:

- **The encoder is the browser's.** H.264 *High* is asked for
  (`avc1.640028`); where the browser only has *Constrained Baseline*
  (`avc1.42E028`), that is used and said. The screens decode both.
- **Settings for the bench:**
  - a constant 30 frames per second;
  - a key frame every 2 seconds;
  - no B-frames;
  - a bitrate set by the user (8 Mbit/s by default);
  - the `moov` box at the start (fast start).

  These are the settings to try on a Raspberry Pi 3, and to change if it
  stalls.
- **A video is the safer form for an animated slide.** It plays more
  smoothly on a small board than the same animation as an app (HTML and
  CSS), which stays possible for slides with live data.

## Data of the apps

Menus and timetables stay spreadsheets (ODS, XLSX or CSV) edited in PWO,
saved where the Manager reads them — a Nextcloud / WebDAV folder PWO already
writes to (DAV-003). The Manager fetches them and gives them to the apps as
tables (`table: true` in the manifest); screens never fetch.

## JSON Schemas

The formats shared by the projects, as JSON Schemas (draft 2020-12): the
examples of this page and of [Plugins](./plugins.md#formats-version-1-plug-009-plug-010)
are tested against them.

- [`plugin-manifest-1.schema.json`](https://progressive-web-office.github.io/schemas/plugin-manifest-1.schema.json) — `manifest.json`
- [`plugin-registry-1.schema.json`](https://progressive-web-office.github.io/schemas/plugin-registry-1.schema.json) — `registry.json`
- [`plugin-message-1.schema.json`](https://progressive-web-office.github.io/schemas/plugin-message-1.schema.json) — the messages of code plugins
- [`provenance-1.schema.json`](https://progressive-web-office.github.io/schemas/provenance-1.schema.json) — the provenance record

The presentation sent by `PUT /v1/presentations/{id}` is DigitalSignalix's
format; its `provenance` follows `provenance-1.schema.json`.

## Answers of DigitalSignalix

1. **Endpoints:** accepted — `GET /v1/me`, `GET /v1/presentations`,
   `HEAD /v1/assets/{sha256}`, a `name` in the presentation and the
   `Provenance` header (DigitalSignalix AUTHOR-001 to AUTHOR-004).
2. **Names of packages:** `id` stays unique within a registry; a Manager
   mirroring several registries names a package by its registry and its id,
   `registry/id` (APP-010).
3. **Tables from spreadsheets:** the Manager reads CSV, and ODS and XLSX
   itself (APP-014); PWO saves the spreadsheet as it is, no CSV copy needed.
4. **Encoder settings for the Raspberry Pi 3:** to be measured on the
   DigitalSignalix bench before PRES-022.
5. **First shared package:** a menu board reading a spreadsheet, with the
   targets `signage` and `pwo`.

## Open points

- The encoder settings of PRES-022, once measured on the bench.
- The menu board: where its repository and its registry live.
