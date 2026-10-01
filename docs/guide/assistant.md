---
description: AI assistant (Claude) that reads and edits documents, spreadsheets and presentations through tools; WebMCP tools for in-browser AI agents.
---

# AI assistant

Progressive Web Office includes an optional assistant powered by **Claude**
(Anthropic). It works on the open document through *tools* — the same
operations you could do by hand — so every change is visible and can be
undone.

| Document | What the assistant can do |
|----------|---------------------------|
| Text document | read it (as Markdown, block by block), rewrite, insert or delete blocks, find and replace — including LaTeX equations `$…$` |
| Spreadsheet | list and read sheets (values, formulas, results), write values and formulas, add sheets |
| Presentation | read slides and shapes, change text, add slides with bullet points, add text boxes, delete slides |

## Set up

1. Open or create a document, then click **✨** (*AI assistant*).
2. Paste an **Anthropic API key** (create one at
   [console.anthropic.com](https://console.anthropic.com/)); usage is billed
   to your Anthropic account.
3. Optionally tick **Save the key in this browser**, choose the **model**
   (default `claude-opus-5-5`) and the **effort** (lower is faster and
   cheaper, higher thinks longer).
4. Click **Save**, type a request and press **Send** (<kbd>Ctrl</kbd>+<kbd>Enter</kbd>).

Examples: *“Summarise this document in five bullet points at the end”*,
*“Add a TOTAL row under the table with SUM formulas”*, *“Turn this outline
into one slide per section”*, *“Write the quadratic formula as a display
equation after the second paragraph”*.

## Privacy and control

- **Consent first.** Before the first request of a session, the assistant
  tells you which provider and model will receive your message and the
  content of the open document, and asks for your agreement. Nothing is sent
  otherwise; nothing else leaves the device.
- **Your key, your browser.** By default the key is used for the current
  session only: it is never written to storage and is forgotten as soon as the
  page is closed or reloaded. Tick **Save the key in this browser** to keep it
  between sessions (it is then stored in this browser's local storage). It is sent
  only to `api.anthropic.com`. **Forget the key** removes it.
- **Visible actions.** Each tool call is listed in the conversation (✓ or ✗
  with its result).
- **Undo.** After a request that changed the document, **Undo the assistant’s
  changes** restores it as it was before the request. In spreadsheets and
  presentations, <kbd>Ctrl</kbd>+<kbd>Z</kbd> also undoes changes one tool
  call at a time.
- If a request is declined by the model's safety systems, it is retried
  automatically on a recommended fallback model (server-side fallback);
  otherwise the assistant says so.

## WebMCP: tools for other AI agents

When the browser exposes the experimental **WebMCP** API
(`document.modelContext`, previously `navigator.modelContext`), Progressive
Web Office registers the same tools — prefixed `pwo_`, for example
`pwo_read_document`, `pwo_set_cells`, `pwo_add_slide` — for the open
document. An AI agent running in the browser (an assistant built into the
browser, an extension…) can then read and edit the document.

Read-only tools are marked as such; **every modification asks for your
approval** in a dialog showing the tool and its arguments. Tools are
unregistered when the document is closed.
