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

As soon as the address is pasted, what was understood is shown — *GitHub
(github.com) · owner s-celles · repository test-pwo* — with the branch and
the path when the address has them, and the repository opens:

- with your account of that site, if you have one;
- **a public repository opens without any token**: it can be read and its
  files opened; saving into it (a commit) needs an account with a token;
- a private repository (or one that does not exist) asks for an account:
  the form is filled in for that site, only the token is left to paste.

## Accounts and tokens

Reading a **public** repository needs nothing. Everything else needs an
**account**: the site (GitHub or GitLab, public or your own) and a
**personal access token** (PAT) — a password made for applications, that
you create on the site, limited to the repositories and rights you choose,
and that you can revoke at any time without changing your password.

| What you do | Without a token | With a token |
|-------------|:---:|:---:|
| Open a file of a public repository, browse it as a folder | ✅ | ✅ |
| Open a private repository | ❌ | ✅ (token allowed to read it) |
| Save (commit), create, rename, delete files | ❌ | ✅ (token and role allowed to write) |
| Create a branch, propose a pull / merge request | ❌ | ✅ (pull-request right) |
| See your role and the collaborators | ❌ | ✅ (collaborators: if your role may write) |

### Adding an account

There are three ways, all ending in the same form:

- paste the address of a **private** repository: the form opens, filled in
  for its site — only the token is left to paste;
- after opening a public repository without a token, **🔑 Add a token to
  save here**; or simply **Save**: the token is asked then, and checked on
  the repository before anything is written;
- **Add account** in the window, for any site.

In the form:

1. **Provider**: GitHub or GitLab.
2. **API URL** — filled in for the public services; for your own site:

   | Forge | API URL |
   |-------|---------|
   | github.com | `https://api.github.com` |
   | GitHub Enterprise Server | `https://github.example.com/api/v3` |
   | gitlab.com | `https://gitlab.com/api/v4` |
   | Self-managed GitLab | `https://gitlab.example.com/api/v4` |

3. **Personal access token** — see below how to create it on each forge.
4. **Remember the token in this browser** — ticked by default, so that you
   do not type it again. Untick it on a shared computer: the token is then
   kept only until the application is closed (the account shows *until
   closed*).
5. **Connect**: the token is tried before the account is added.

**Forget** removes the account and its token from this device.

## Creating a personal access token (PAT), forge by forge

**How to create a token?**, under the token field, repeats the steps for the
site chosen, with a link to its token page. Whatever the forge:

- give the token **only the repositories and rights you need**;
- choose a **near expiration date** (30 to 90 days) and make a new one when
  it expires;
- copy it as soon as it is shown — **it is shown only once** — and paste it
  in Progressive Web Office; do not keep it elsewhere, never paste it in a
  document, a message, a chat or a commit;
- if it may have leaked, **revoke it** on the same page and make another.

### GitHub (github.com) — fine-grained token (recommended)

1. Signed in to GitHub, open
   [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new)
   — or *your picture › Settings › Developer settings › Personal access
   tokens › Fine-grained tokens › Generate new token*.
2. **Token name**: `PWO` (and a description if you like).
3. **Resource owner**: your account — or the **organisation** that owns the
   repositories (see below).
4. **Expiration**: 30, 60 or 90 days, or a date.
5. **Repository access**: **Only select repositories**, then pick them.
   *All repositories* also works, but gives more than needed; *Public
   repositories* is read only.
6. **Permissions › Repository permissions**:

   | Permission | Access | Needed for |
   |------------|--------|------------|
   | **Contents** | Read and write | opening and saving files, branches (essential) |
   | **Metadata** | Read-only | added by GitHub automatically |
   | **Pull requests** | Read and write | *Propose the changes…* (optional) |

   Nothing else is needed (no account permission, no administration).
7. **Generate token**, then copy it (`github_pat_…`).

**Repositories of an organisation**: choose the organisation as *Resource
owner*. Depending on its policy, the token may wait for an **approval** by an
owner of the organisation (it is then *pending*: until it is approved,
the repositories answer *not found*), or fine-grained tokens may be refused;
ask an owner, or use a classic token if the organisation allows only those.

### GitHub — classic token (when fine-grained ones are not possible)

1. Open [github.com/settings/tokens/new](https://github.com/settings/tokens/new)
   (*Personal access tokens › Tokens (classic) › Generate new token
   (classic)*).
2. A note (`PWO`) and an expiration date.
3. Scope **`repo`** (private and public repositories) — or only
   **`public_repo`** for public repositories.
4. **Generate token**, copy it (`ghp_…`).

A classic token reaches **every** repository you can reach: prefer a
fine-grained one. In an organisation with **single sign-on (SAML)**, click
*Configure SSO* next to the token, then *Authorize* for the organisation.

### GitHub Enterprise Server

The same steps on your own site:
`https://<your site>/settings/personal-access-tokens/new` (fine-grained) or
`https://<your site>/settings/tokens/new` (classic). API URL:
`https://<your site>/api/v3`.

### GitLab (gitlab.com)

1. Signed in to GitLab, open
   [gitlab.com/-/user_settings/personal_access_tokens](https://gitlab.com/-/user_settings/personal_access_tokens)
   — or *your avatar › Edit profile › Access tokens* (older versions:
   *Preferences › Access Tokens*).
2. **Add new token**: a name (`PWO`) and an **expiration date** (GitLab
   requires one, at most a year).
3. **Scopes**:

   | Scope | Gives |
   |-------|-------|
   | **`api`** | reading, saving, branches, merge requests, members — **needed to save** |
   | `read_api` | reading only (open files and folders, see members) |

   `read_repository` and `write_repository` are **not enough**: they are for
   `git clone` / `git push`, not for the web API Progressive Web Office uses.
4. **Create personal access token**, copy it (`glpat-…`).

The token never gives more than **your role** in the project: saving needs
the role **Developer** or above — and **Maintainer** on a protected branch
(usually `main`); a *Reporter* or *Guest* can only read.

Instead of a personal token, a project (or group) owner can create a
**project access token** (*project › Settings › Access tokens*, role
*Developer*, scope `api`): it reaches that project only.

### Self-managed GitLab

The same steps on your own site:
`https://<your site>/-/user_settings/personal_access_tokens` (before GitLab
16: `https://<your site>/-/profile/personal_access_tokens`). API URL:
`https://<your site>/api/v4`. The site must accept requests from a web page
(CORS), as gitlab.com does; ask its administrator if every request fails
with a network error.

### Other forges

Gitea, Forgejo (Codeberg), Bitbucket and others are not supported yet.

::: warning Token storage
The token is stored **only in this browser** (local storage) — or only in
memory when *Remember the token* is unticked — and is sent **only** to the
API URL of its account. It is never written into documents, drafts,
exported files, backups or logs. Use **Forget** to delete it from this
device, and revoke it on the forge if the device is lost.
:::

## Who can see a repository, and who works on it

Once a repository is chosen, the window tells:

- its **visibility**: **🌐 Public** (anyone on the Internet can see it and
  its history; only its collaborators can change it), **🔒 Private** (only
  its collaborators, and members of its organisation or group as allowed),
  or **🏢 Internal** on GitLab (every signed-in user of the site);
- **your role** (GitHub: Read, Triage, Write, Maintain, Admin; GitLab:
  Guest, Planner, Reporter, Developer, Maintainer, Owner) and whether you can
  save there;
- **Collaborators and their roles**, opened on demand. The services show
  them only to people allowed to write in the repository, and only with a
  token.

The same is shown for a repository opened as a folder (🔒, 🌐 or 🏢 in the
folder panel), and the icon precedes the repository's name above a document
opened from it.

## Open a file

Paste its address, or pick a repository (or type `owner/name` for any
repository you can read) and a branch, then browse the folders and click a
file. Every supported format
can be opened: documents, spreadsheets, presentations, PDF, Markdown,
MDZ, LaTeX…

The header shows where the document comes from (`🔒 owner/name · branch`,
the icon telling its visibility). Choosing another repository clears the
one shown first: what is listed is always the repository you save to.

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

### An empty repository

A repository just created on GitHub or GitLab has no file and no branch
yet. It opens without error and says so; save a document in it (**Commit…**
or *Save to repository*): it becomes its first file, on its default branch.
Opened as a folder, its first file is created the same way.

**Save as…** still downloads a local copy in any format.

### Branches and pull requests from a document

The repository and branch shown in the header (`owner/name · main`) is a
button:

- **Work on a new branch…** creates a branch from the current one (named
  `pwo/<date>` unless you choose another name): the next saves are commits
  there, the default branch staying as it is;
- **Propose the changes to main…** (on another branch) opens a **pull
  request** on GitHub, or a **merge request** on GitLab, under the title you
  give, and opens it in a new tab. Save first: changes not yet committed are
  not part of the request.

## History of a document

Git keeps every committed version of every file. For a document of a
repository, **History of this document…** — in the menu of the repository
shown above the document (`🔒 owner/name · main`), or in **⎇** of the folder
panel for the document open — lists the **commits that changed it** on the
branch, newest first, with their message, author and date. For each one:

- **Changes made** — what that commit changed, compared with the one before;
- **Compare with now** — the differences between that version and the
  document as it is on screen, unsaved changes included;
- **Open** — the version replaces the content of the document, which stays
  where it is: read it, or save it to make it the newest one;
- **Restore…** — after a confirmation, a **new commit** puts that version
  back (`docs: restore report.md as of 1a2b3c4`). Nothing of the history is
  lost: the versions in between stay, and can be restored in turn.

The versions kept in the browser (**🕘 History**, see
[Versions](./getting-started.md#versions)) can be compared the same way.

### Comparing versions

The comparison shows, in one column:

- lines **added** (green, `+`), **removed** (red, struck through, `−`), and
  **changed**, with the words that went struck through in red and those that
  came underlined in green;
- unchanged lines folded around the changes (*… 12 unchanged lines* opens
  them);
- a count: *3 lines added, 1 removed, 2 changed*.

What is compared depends on the file:

| File | Compared as |
|------|-------------|
| Markdown, LaTeX, CSV, code and other text files | their text, line by line |
| Word (`.docx`), OpenDocument (`.odt`), MDZ | their text in Markdown: headings, emphasis, lists, tables, equations, citations |
| Excel (`.xlsx`), OpenDocument spreadsheets (`.ods`) | their cells: sheet, cell, value or formula before and after |
| PDF, presentations, pictures | not compared: open each version |

This is why text formats are proposed first in a repository: their history
reads line by line on the forge too.

## A repository as a folder

Opening a file from a repository also shows the repository in the folder
panel, with its whole tree, the file selected; **📁 Open the repository as a
folder** in the window opens it without a file.

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

## Git on your own computer or network

Git does not need GitHub or GitLab: a folder of your computer, or of a
shared drive of the local network, can be a **Git working copy** (made with
`git clone` or `git init`).

- **Open a folder** → *A folder of this device* and choose the working copy:
  the panel shows **⎇ branch** at the top (the `.git` folder itself is
  hidden). Documents are saved **in place**, as plain files; commit them with
  your own Git tool (command line, VS Code, GitHub Desktop, GitKraken…).
  Git, not the application, keeps the versions: `git log`, `git diff` and
  `git checkout` work on them as on any file. Prefer the text formats (`.md`,
  `.tex`, `.csv`, `.fodt`…) when you want readable diffs (see
  [GIT-010](#commit-changes)).
- **New documents right there**: in the folder panel, 📝, 📊 and 📽️ create a
  text document, a spreadsheet or a presentation in the selected folder
  (in the format family of the settings) and open it; a drawing is in the
  right-click menu. In a **repository opened as a folder** (see below), the
  same buttons create the file **as a commit**, and each **Save** is a
  commit too.

## Repositories used, and where documents come from

**Repositories used.** Every repository you open a file from, or commit to,
is listed on the start screen under **Repositories and servers used** (with
the WebDAV / Nextcloud folders). A click opens it again at once, in the
folder of the last file, even for reading without an account. **×** forgets
one, **Forget them all** forgets the list (accounts and files are not
touched). To remember nothing, untick **Remember the repositories and
servers used** in [Settings](./settings) → General.

**Where a document comes from.** A document opened from a repository, or
committed to one, keeps its address — for instance
`https://github.com/me/notes/blob/main/report.odt`:

- in the **recent files**, for every kind of document: reopened from there,
  even after closing the browser, it is tied to its repository again, and
  **Save** shows the commit dialog as usual;
- in its own **properties** (Document properties → *Source*) for
  OpenDocument and Microsoft Office text documents and presentations, and
  MDZ: a copy downloaded and opened later, on this device or another one
  with an account for the site, goes back to the same file. A Markdown file
  gets no front matter just for this (a `README.md` stays as it is).

A copy saved in another format (a `.md` of the repository saved as `.odt`)
is another file: it is not tied to the repository. When the document is
tied again, the file in the repository is read once more before the
commit, and a change made there meanwhile is still detected the next
times. **✕ Detach**, beside the repository name at the top, unties the
document (its *Source* property is cleared too). To keep no origin at all,
untick **Keep where documents come from** in the settings.

## When something goes wrong

| Message | Likely cause | What to do |
|---------|--------------|------------|
| *401* / *Bad credentials* | token mistyped, expired or revoked | **Forget** the account, create a new token, add it again |
| *403* | the token lacks a right (*Contents: Read and write*, scope `api`), the organisation has not approved it, or SSO is not authorised | check the token's rights on the forge; ask an organisation owner |
| *… is private, or does not exist* / *404* | wrong address, or the repository is not among those chosen for the token | check the address; edit the token to add the repository |
| *You can read, not save here* | your role is read only (GitHub *Read*/*Triage*, GitLab *Reporter*/*Guest*) | ask an owner for the *Write* / *Developer* role |
| saving refused on `main` (GitLab) | protected branch | save on a new branch and propose a merge request |
| *Network error* | offline, or a self-managed site refusing requests from web pages (CORS) | check the connection; ask the site's administrator |
| *The file changed in the repository* | someone committed meanwhile | see [Conflicts](#conflicts) |

