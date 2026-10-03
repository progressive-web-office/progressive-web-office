---
description: Open documents from GitHub or GitLab repositories and commit changes back, with conflict protection.
---

# Git repositories

Progressive Web Office can open files stored in **GitHub** (github.com or
GitHub Enterprise) and **GitLab** (gitlab.com or self-hosted) repositories,
and commit your changes back — directly from the browser, without a server
of our own.

## Open a repository by its address

The quickest way: paste the **address of the repository** — the one shown
in your browser — in the first field of **Open from repository…** or
**Commit…**, then press <kbd>Enter</kbd>:

- `https://github.com/s-celles/test-pwo` — GitHub, owner `s-celles`,
  repository `test-pwo`;
- `https://gitlab.com/group/subgroup/project` — GitLab, with its groups;
- a link to a branch, a folder or a file
  (`…/tree/dev/docs`, `…/blob/main/report.md`, GitLab `…/-/tree/main/docs`)
  opens that branch and that folder, or the file itself;
- a clone address (`git@github.com:owner/name.git`) or a self-hosted site
  (`https://gitlab.example.org/team/project`, GitHub Enterprise) works too.

The service, the owner, the repository, the branch and the path are deduced
from the address. If you already have an account for that site it is used;
otherwise the form to add one opens, filled in: only the token is left to
paste.

## Connect an account

1. Click **Open from repository…** on the start screen (or **⎇** in the
   toolbar), then **Add account** (or paste a repository address, see above).
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

### How to create a token

**How to create a token?** under the token field gives these steps, with a
link to the token page of the site chosen.

**GitHub** (fine-grained token):

1. Open [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new)
   (on GitHub Enterprise: `https://<your site>/settings/personal-access-tokens/new`).
2. Give it a name (`PWO`) and an expiration date.
3. **Repository access**: *Only select repositories*, then pick the
   repositories you want to edit.
4. **Permissions → Repository permissions**: *Contents: Read and write*
   (and *Pull requests: Read and write* to propose changes).
5. **Generate token**, copy it — it is shown only once — and paste it.

**GitLab**:

1. Open [gitlab.com/-/user_settings/personal_access_tokens](https://gitlab.com/-/user_settings/personal_access_tokens)
   (self-hosted: `https://<your site>/-/user_settings/personal_access_tokens`).
2. **Add new token**, give it a name and an expiration date.
3. Select the scope **api**.
4. **Create personal access token**, copy it — shown only once — and paste it.

A token works as a password for these repositories: give it only the
repositories and rights you need and a near expiration date, and revoke it
on the same page if it leaks.

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

Any other document can be saved to a repository with **Commit…**: paste
the repository address (or choose the account, repository, branch and
folder), then the file name. The extension selects the format (for example
`.md`, `.docx`, `.tex`).

::: tip Prefer text formats in a repository
Git shows what changed between two versions line by line — but only for
text files. A `.docx`, `.odt` or `.xlsx` is a zip archive: each commit stores
a new opaque file, and changes can be neither reviewed nor merged. So when
saving to a repository, the **Format** list puts the text formats first
(Markdown `.md`, LaTeX `.tex`, CSV `.csv`) and proposes one by default —
`report.docx` becomes `report.md`, `marks.xlsx` becomes `marks.csv`. The
binary formats stay available: choose one when you need its exact layout
(a CSV keeps one sheet, without formatting).
:::

**Save as…** still downloads a local copy in any format.

## A repository as a folder

**Open a folder** also lists your Git accounts (⎇): choose one, then a
repository and a branch — or choose **⎇ GitHub / GitLab repository…** and
paste the repository address (`https://github.com/owner/name`, or
`…/tree/dev` for a branch), the account being added if needed — and the
repository opens in the folder panel like a folder of the device — tree, search, links between notes, master
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
