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
