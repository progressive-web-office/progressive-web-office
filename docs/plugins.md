---
description: A proposal for plugins — content packs and sandboxed code plugins, distributed through a registry of Git repositories — to keep the core small as features grow.
---

# Plugins (proposal)

::: info Status
A design proposal, to be decided with the maintainer before any code. The
requirements are drafted as PLUG-001..PLUG-008 (*Could*), in the
[requirements](./requirements.md).
:::

## Why

The application grows: Grist, Zotero, Mermaid, code cells in nine languages,
anywidget instruments, drawing libraries (IEC 60617, ISO 1219, IEC 61131-3),
forms, AI providers… Most users need a few of them. Plugins would

- keep the **core small and stable**: documents, spreadsheets,
  presentations, files, storage;
- let **teams and teachers add what they need** — their symbol libraries,
  templates, converters, connectors — without forking the application;
- let **others contribute** without touching the core, reviewed and
  versioned in their own repositories.

## Two kinds of plugins

### 1. Content packs (no code) — first

Data the application already knows how to use, described by a
`manifest.json`, with files beside it:

| Pack | Contents | Used by |
|---|---|---|
| Templates | documents, spreadsheets, presentations, drawings | template gallery (FILE-018, FILE-030) |
| Symbol library | symbols as SVG with their pins, keywords, reference prefix and unit | drawing editor (DRAW-005, DRAW-012) |
| Snippets | text and Markdown snippets | documents (DOC-037) |
| Colour palettes, themes | named colours, CSS variables | colour picker (COLOR-001), interface |
| Dictionaries, word lists | spelling, abbreviations | spelling, completion |
| Python / R / JS packages for code cells | wheels, scripts | code cells (CODE-016) |

They run **no code**: safe to install from anywhere, they can be adopted at
once, and they cover most needs (a school's templates, a company's symbol
library, a teacher's examples).

### 2. Code plugins (sandboxed) — later

An ES module run in a **sandboxed iframe or worker** (as the code cells
are), talking to the application through `postMessage` with a small,
versioned API — never the application's DOM, storage or tokens:

- `commands` — entries of the command palette and the menus;
- `importers` / `exporters` — a format read into or written from the
  document model (e.g. `.drawio`, `.odg`, BibTeX styles);
- `panels` — a side panel (a connector, a checker, a calculator);
- `symbols`, `templates`, `snippets` — the content above, computed;
- `cells` — a language for code cells.

Each plugin **declares its permissions** in its manifest — read the open
document, change it, reach these network hosts, show a panel — asked once
when it is installed, shown in **Settings → Plugins**, revocable.

## Formats, version 1 (PLUG-009, PLUG-010)

The same formats serve PWO and the screens of
[DigitalSignalix](./digitalsignalix.md): a pack says where it runs with
`targets`, and each host installs only the packs naming it. Field names are
in camelCase; hashes are SHA-256 in lowercase hexadecimal; versions follow
Semantic Versioning; licences are SPDX expressions.

### `manifest.json`

```json
{
  "manifestVersion": 1,
  "id": "menu-board",
  "name": "Menu board",
  "description": "The menu of the week, from a spreadsheet.",
  "locales": { "fr": { "name": "Menu de la semaine", "description": "Le menu de la semaine, depuis un classeur." } },
  "version": "1.2.0",
  "license": "MIT",
  "authors": [{ "name": "Ada Lovelace", "url": "https://example.org" }],
  "homepage": "https://example.org/menu-board",
  "repository": "https://github.com/example/menu-board",
  "kind": "code",
  "targets": ["signage", "pwo"],
  "engines": { "pwo": ">=0.3.0", "signage": ">=1.0.0" },
  "entry": "index.html",
  "api": 1,
  "settings": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": {
      "title": { "type": "string", "default": "Menu" },
      "accent": { "type": "string", "format": "color", "default": "#1f6feb" }
    }
  },
  "data": [
    {
      "id": "menu",
      "description": "One row per dish: day, course, name.",
      "mediaTypes": ["text/csv", "application/vnd.oasis.opendocument.spreadsheet"],
      "table": true
    }
  ],
  "permissions": { "network": [], "document": "none", "ui": [] }
}
```

- `id`: lowercase letters, digits and `-`, unique within a registry.
- `kind`: `pack` (content, no code) or `code`.
- `targets`: `pwo`, `signage`; a host ignores the targets it does not know.
- `engines`: the host versions it works with (SemVer ranges), per target.
- `entry`: the HTML page of a code plugin, loaded in a sandboxed iframe;
  for a pack, `contents` lists its files instead:
  `{ "templates": ["menu.ods"], "symbols": "symbols/", "snippets": "snippets.json" }`.
- `api`: the major version of the message protocol it speaks.
- `settings`: a JSON Schema (2020-12) of its settings; the host draws the
  form, keeps the values and hands them over.
- `data`: the files it reads, by name; `table: true` asks for them as a
  table (columns and rows) rather than bytes.
- `permissions`:
  - `network` — the hosts it may reach, always through the host (the
    `fetch` request below), never directly;
  - `document` — `none`, `read` or `write` (PWO only);
  - `ui` — `panel`, `command` (PWO only).

  They are asked once when it is installed, shown in the settings and
  revocable.

### An entry of `registry.json`

```json
{
  "registryVersion": 1,
  "name": "Example registry",
  "updated": "2026-10-04T09:30:00Z",
  "plugins": [
    {
      "id": "menu-board",
      "name": "Menu board",
      "description": "The menu of the week, from a spreadsheet.",
      "kind": "code",
      "targets": ["signage", "pwo"],
      "license": "MIT",
      "repository": "https://github.com/example/menu-board",
      "versions": [
        {
          "version": "1.2.0",
          "published": "2026-10-01T12:00:00Z",
          "base": "https://cdn.jsdelivr.net/gh/example/menu-board@v1.2.0/",
          "files": {
            "manifest.json": "3f1c…64 hexadecimal digits",
            "index.html": "9a0b…",
            "app.js": "c2d4…"
          },
          "permissions": { "network": [], "document": "none", "ui": [] },
          "engines": { "pwo": ">=0.3.0", "signage": ">=1.0.0" }
        },
        {
          "version": "1.1.0",
          "published": "2026-09-01T12:00:00Z",
          "base": "https://cdn.jsdelivr.net/gh/example/menu-board@v1.1.0/",
          "files": { "manifest.json": "…", "index.html": "…" },
          "revoked": { "date": "2026-09-20T08:00:00Z", "reason": "Shows the settings of another screen." }
        }
      ]
    }
  ]
}
```

Every file is listed with its hash and checked before use; `manifest.json`
is one of them, and its `permissions` and `engines` are repeated in the
entry so that a host can decide without downloading the plugin. A version
with `revoked` is disabled at the next check.

### Messages of code plugins

A code plugin runs in an iframe with `sandbox="allow-scripts"` (no same
origin) and a content security policy forbidding network access
(`connect-src 'none'`). It talks to its host with `postMessage`, every
message in one envelope:

```json
{ "type": "pwo-plugin", "version": 1, "action": "init", "id": 7 }
```

- `type` is always `pwo-plugin`; `version` is the major version of the
  protocol (`api` of the manifest). Within a major version, messages only
  gain optional fields and new actions; both sides ignore what they do not
  know. A host refuses a plugin whose `api` it does not speak.
- `id` numbers a request; its answer carries the same `id`
  (`action: "reply"`, with `result` or `error: { "code", "message" }`).

From the host to the plugin:

| `action` | Fields | When |
|---|---|---|
| `init` | `host: { name, version, target }`, `locale`, `theme` (`light`, `dark`), `settings`, `data`, `viewport: { width, height }` | once, after `ready` |
| `settings` | `settings` | the settings changed |
| `data` | `data` | a data file changed |
| `resize` | `viewport` | the size changed |
| `visibility` | `visible` (true, false) | shown or hidden (a screen's playlist, a closed panel): start or pause |

`data` maps each `id` of the manifest to
`{ "mediaType", "bytes" }` (an `ArrayBuffer`) or, with `table: true`, to
`{ "mediaType", "table": { "columns": ["day", "course", "name"], "rows": [["Monday", "Main", "Ratatouille"]] } }`.

From the plugin to the host:

| `action` | Fields | Answer |
|---|---|---|
| `ready` | `api` (the version it speaks) | `init` |
| `fetch` | `url`, `method`, `headers`, `body` | `reply` with `{ status, headers, body }`, only for the hosts of `permissions.network` |
| `log` | `level`, `message` | none |
| `done` | — | none: on a screen, the app has shown everything (it may end its slot early) |
| `document.read`, `document.write`, `command.register`, `panel.show` | as their names say | PWO only, with the permission |

On a screen, `fetch` is answered from what the Manager fetched and kept;
the screen itself reaches nothing.

## Distribution: a registry of Git repositories

```
progressive-web-office/          ← the GitHub organisation of the project
├── .github                       ← organisation profile, shared community files
├── progressive-web-office        ← the application (this repository)
├── registry                      ← one repository: registry.json, reviewed by pull requests
├── templates-school-fr           ← one repository per plugin, versioned by tags
├── symbols-hydraulics-iso1219
└── panel-periodic-table …
```

- **`registry.json`** lists the plugins: id, name, description, kind,
  repository, versions with the **SHA-256** of their files, permissions,
  licence (OSI-approved), and revoked versions.
- Installing downloads a **pinned version** (a Git tag, through the
  repository's raw files or a CDN such as jsDelivr's GitHub mirror), checks
  its hashes, and keeps it **for offline use** (browser storage).
- **Updates** are offered, never forced: what changed, which new
  permissions.
- **Other registries**: a school, a company or a user adds their own —
  any Git repository or Nextcloud / WebDAV folder, as template sources are
  (FILE-030) — to share plugins privately.
- **Reviews** happen on the registry's pull requests; a version found
  harmful is marked revoked and disabled everywhere at the next check.

## The core moves to the same API

Once the API exists, optional parts of the core can become **built-in
plugins** (Grist, Zotero, instruments, IEC libraries…): same API, loaded
only when used, and the boundary between the core and the rest stays
clean.

## Steps

1. **Content packs**: the manifest format, the registry format, **Settings →
   Plugins** (browse a registry, install, update, remove), packs of
   templates and symbols. Needs the `registry` repository in the
   `progressive-web-office` organisation, and a first pack (e.g.
   `progressive-web-office/templates-fr`).
2. **Code plugins**: the sandbox, the API, permissions; a first plugin
   (e.g. the draw.io importer, DRAW-010).
3. **Built-in plugins**: Grist, Zotero, instruments, IEC libraries moved
   behind the API.

## To decide

- The registry: `progressive-web-office/registry` in the
  [organisation of the project](https://github.com/progressive-web-office) (created).
- Whether code plugins come in the first version, or content packs only.
- The licences accepted, and who reviews the registry's pull requests.
