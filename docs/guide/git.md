---
description: Open documents from GitHub or GitLab repositories and commit changes back, with conflict protection.
---

# Git repositories

Progressive Web Office can open files stored in **GitHub** (github.com or
GitHub Enterprise) and **GitLab** (gitlab.com or self-hosted) repositories,
and commit your changes back — directly from the browser, without a server
of our own.

## Connect an account

1. Click **Open from repository…** on the start screen (or **⎇** in the
   toolbar), then **Add account**.
2. Choose the provider. The API URL is filled in for the public services;
   change it for your own instance:
   - GitHub Enterprise: `https://github.example.com/api/v3`
   - self-hosted GitLab: `https://gitlab.example.com/api/v4`
3. Paste a **personal access token**:
   - GitHub: a *fine-grained* token limited to the repositories you need,
     with the permission **Contents: read and write**
     (Settings → Developer settings → Personal access tokens).
   - GitLab: a token with the **api** scope (Preferences → Access tokens).
4. Click **Connect**.

::: warning Token storage
The token is stored **only in this browser** (local storage) and is sent
**only** to the API URL of its account. It is never written into documents,
drafts, exported files or logs. Use **Forget** to delete it from this device.
Prefer short-lived tokens limited to the repositories you need.
:::

## Open a file

Pick a repository (or type `owner/name` for any repository you can read),
a branch, then browse the folders and click a file. Every supported format
can be opened: documents, spreadsheets, presentations, PDF, Markdown,
MDZ, LaTeX…

The header shows where the document comes from (`owner/name · branch`).

## Commit changes

For a document opened from a repository, **Save** (<kbd>Ctrl</kbd>+<kbd>S</kbd>)
commits it to the same path and branch. The commit dialog proposes a
[Conventional Commits](https://www.conventionalcommits.org/) message
(`docs: update report.docx`) that you can edit, and lets you commit to
another branch — tick **Create this branch** to create it from the current
one.

Any other document can be saved to a repository with **Commit…**: choose the
account, repository, branch and folder, then the file name. The extension
selects the format (for example `.md`, `.docx`, `.tex`).

**Save as…** still downloads a local copy in any format.

## Conflicts

If the file changed in the repository since you opened it (someone else
committed), Progressive Web Office **never overwrites** it. You can instead:

- **Save on a new branch** — a `pwo/<date>` branch is created from the
  current one and your version is committed there, ready for a pull/merge
  request;
- **Save as a copy next to it** — your version is committed under a new name
  (`report-copy-<date>.docx`).
