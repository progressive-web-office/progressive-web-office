---
description: File formats that Progressive Web Office can open and save.
---

# Supported formats

| Family | Open | Save |
|--------|------|------|
| Text documents | `.docx`, `.odt`, `.md`, `.mdz`, `.tex`, LaTeX project `.zip` | `.docx`, `.odt`, `.md`, `.mdz`, `.tex`, LaTeX project `.zip` |
| Spreadsheets | `.xlsx`, `.ods`, `.csv`, `.tsv` | `.xlsx`, `.ods`, `.csv` |
| Presentations | `.pptx`, `.odp` | `.pptx`, `.odp` |
| PDF | `.pdf` | — (view only) |

The format is detected from the file **content** (ZIP package type, PDF
signature), not only from the extension, so a renamed file still opens
correctly. Legacy binary formats (`.doc`, `.xls`, `.ppt`) are not supported.
