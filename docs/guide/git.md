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
     with the permission **Contents: read and write** (and **Pull requests:
     read and write** to propose changes from the folder panel)
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

## A repository as a folder

**Open a folder** also lists your Git accounts (⎇): choose one, then a
repository and a branch, and the repository opens in the folder panel like
a folder of the device — tree, search, links between notes, master
documents. Every change is a **commit** on that branch:

- saving a document of the repository (`docs: update report.md`);
- creating a document or a folder (a new folder holds an empty `.gitkeep`,
  since Git keeps no empty folders);
- renaming, moving (a folder with everything in it, in one commit) and
  deleting files and folders in the explorer.

The whole tree is read in one request, so large repositories open quickly.
If a file changed in the repository since you opened it, saving it is
refused instead of overwriting the other change: reload the folder (↻) and
open it again.

### Branches and pull requests

**⎇** next to the folder's name works with the branches of the repository:

- **Work on a new branch…** starts a branch from the one open (named
  `pwo/<date>` unless you choose another name) and opens it: your changes
  are committed there, the default branch staying as it is;
- **Open another branch** switches the folder to another branch;
- **Propose the changes to main…** (on a branch other than the default one)
  opens a **pull request** on GitHub, or a **merge request** on GitLab, from
  this branch to the default one, under the title you give, and opens it in
  a new tab to describe it, ask for reviews and merge it.

The token needs the right to create pull requests (GitHub fine-grained
token: *Pull requests: read and write*; GitLab: the `api` scope).

## Conflicts

If the file changed in the repository since you opened it (someone else
committed), Progressive Web Office **never overwrites** it. You can instead:

- **Save on a new branch** — a `pwo/<date>` branch is created from the
  current one and your version is committed there, ready for a pull/merge
  request;
- **Save as a copy next to it** — your version is committed under a new name
  (`report-copy-<date>.docx`).
