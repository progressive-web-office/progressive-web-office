# Roadmap

Development phases are **milestones**, not releases. Following Semantic
Versioning for initial development, phase *n* is tagged `0.0.(n+1)` in the
changelog.

| Phase | Milestone | Scope | Status |
|-------|-----------|-------|--------|
| 0 | 0.0.1 | Foundations: TypeScript/Vite scaffold, PWA shell (manifest, service worker, offline), start screen, open/drop, format detection, docs + `llms.txt`, `justfile`, governance files | ✅ |
| 1 | 0.0.2 | Text documents: `.docx`, `.odt`, `.md`, `.mdz` (wflixu/mdz 1.1.0 compatible) read/edit/write, WYSIWYG editor, images, links, plain ZIP → MDZ import | ✅ |
| 2 | 0.0.3 | Spreadsheets: `.xlsx`, `.ods`, `.csv` read/edit/write, formula engine, multiple sheets, insert/delete rows & columns | ✅ |
| 3 | 0.0.4 | PDF: viewer (navigation, zoom, text selection), form filling, handwritten signatures | ✅ |
| 4 | 0.0.5 | Presentations: `.pptx`, `.odp` read/edit/write, slide sorter, slideshow | ✅ |
| 5 | 0.0.6 | Polish: recent files, autosave drafts, end-to-end tests | ✅ |
| 6 | 0.0.7 | Mathematical equations: MathLive editor, `$…$` in Markdown/MDZ, MathML in ODT, OMML in DOCX | ✅ |
| 7 | 0.0.8 | Internationalisation: English, French, Simplified Chinese | ✅ |
| 8 | 0.0.9 | Printing: page setup, print preview, per-kind print layouts | ✅ |
| 9 | 0.0.10 | LaTeX: `.tex` export (ZIP with images), import, `$…$` typing, equations in sheets and slides | ✅ |
| 10 | 0.0.11 | Git repositories: GitHub and GitLab browse, open, commit | ✅ |
| 11 | 0.0.12 | Device-to-device exchange with QRShare (Web Share, share target) | ✅ |
| 12 | 0.0.13 | AI assistant (Claude) with document tools; WebMCP tools for external agents | ✅ |
| — | later | Text search in PDF, cell formatting, i18n (French), TextBundle import, upstream MDZ collaboration | 💡 |
