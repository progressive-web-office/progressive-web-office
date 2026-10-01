# Progressive Web Office (PWO)

A simple, private office suite that runs **entirely in your browser** as an
installable Progressive Web App, written in TypeScript.

- 📝 Text documents — Word `.docx`, OpenDocument `.odt`, Markdown `.md`,
  MDZ packages `.mdz`, LaTeX `.tex` (import and export)
- ∑ Equations — LaTeX with a MathLive formula editor, in documents,
  spreadsheets and slides
- 📊 Spreadsheets — Excel `.xlsx`, OpenDocument `.ods`, `.csv`
- 📽️ Presentations — PowerPoint `.pptx`, OpenDocument `.odp`
- 📄 PDF — viewer, form filling and signatures
- 🖨️ Printing with preview and page setup
- ⎇ GitHub and GitLab repositories — open and commit
- 📲 Device-to-device exchange with [QRShare](https://github.com/s-celles/QRShare)
- ✨ Optional AI assistant (Claude, your own API key) and WebMCP tools
- 🌐 English, French, Simplified Chinese

No upload, no account: documents stay on your device and the app works
offline once installed. Network access happens only for features you use
explicitly (git repositories, AI assistant).

> Status: initial development (`0.0.x`). See [ROADMAP.md](ROADMAP.md) and
> [CHANGELOG.md](CHANGELOG.md).

## Quick start

```sh
just install   # npm ci
just dev       # development server
just check     # typecheck + tests + build + docs
```

See the [documentation](docs/) (`just docs-dev`) for the user guide, the
supported formats and the architecture.

## Contributing

Requirements use EARS with MoSCoW priorities; development is test-driven;
commits follow Conventional Commits. Please read the
[Code of Conduct](CODE_OF_CONDUCT.md) and the [security policy](SECURITY.md).

AI assistance is used in this project and disclosed in commits with an
`Assisted-by: AI` trailer.

## License

Copyright (C) 2026 The Progressive Web Office contributors.

Progressive Web Office is free software: you can redistribute it and/or modify
it under the terms of the [GNU Affero General Public License](LICENSE.md) as
published by the Free Software Foundation, either version 3 of the License, or
(at your option) any later version. If you run a modified version as a network
service, you must offer its source code to its users (section 13).
