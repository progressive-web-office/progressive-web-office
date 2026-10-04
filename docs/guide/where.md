---
description: Where your documents are, and how they travel — a file, the browser's storage, sending, collaborating, Git, the cloud, synchronising devices, backups — compared in one page, with what to choose.
---

# Where are my documents?

Progressive Web Office runs **in your browser** and has **no server of its
own**: it never keeps your documents anywhere you did not choose. That is
why it offers several ways to keep a document and to make it travel — and
why they are worth telling apart. This page compares them; each links to its
own guide.

## In one table

| | Where the document is | Who sees it | Direction | Needs a network | Good for |
|---|---|---|---|---|---|
| **[File on the device](./getting-started.md#saving)** | a file of your disk (Downloads, a folder, a USB key) | you | — | no | everything, by default |
| **[Browser storage](./folders.md)** | inside this browser, on this device | you, in this browser | — | no | working without handling files; synchronising devices |
| **[Send to another device](./sharing.md)** | a **copy** goes to the other device | the one who receives it | **one way** (→) | no (QR codes) or yes | handing a file over |
| **[Link containing the document](./sharing.md#share-a-link-containing-the-document)** | in the link itself | whoever has the link | **one way** (→) | to send the link | a short document in a message |
| **[Real-time collaboration](./collaboration.md)** | on each participant's device, kept alike live | the people invited | **both ways**, **between all** participants | yes, everyone at once | writing together, now |
| **[Synchronising without a network](./offline-sync.md)** | on each device; changes merged by QR codes | the two people | **both ways**, one pair at a time | no | a computer never connected |
| **[Git repository](./git.md)** | GitHub, GitLab, Gitea / Forgejo, or a working copy | the people of the repository | **both ways**, with **every version** kept | yes (or a local copy) | versions, reviews, code and course material |
| **[Nextcloud / WebDAV](./cloud.md)** | your institution's or your own cloud | who the cloud shares with | **both ways**, one file at a time | yes | the files of your institution |
| **[Grist](./grist.md)** | a Grist table | the people of the document | **both ways** (data) | yes | collected answers, data |
| **[Synchronising my devices](./device-sync.md)** | the browser storage of **each of your devices**, kept alike | you | **both ways**, **between all** your devices | yes, devices open at once | finding the same documents on your laptop and phone |
| **[Backup](./backup.md)** | a dated, encrypted archive (file, folder, cloud) | you | a **copy kept aside** | no (or the cloud) | getting things back after a loss |
| **[History](./getting-started.md#versions)** | earlier versions of a document, in this browser | you | — | no | undoing yesterday's changes |

## The words, plainly

**Saving** keeps the document **in one place**: a file, the browser's
storage, a repository, the cloud. Saving again writes over it there.

**Sharing** (sending, a link) gives **a copy**: the other person's changes
do not come back to you, and yours do not reach them. It goes **one way**.

**Collaborating** works on **the same document** together: each one's
changes reach the others — **both ways**, and **between all** when you are
more than two. Live (real-time collaboration) or later (by QR codes).

**Versioning** (Git, the history of a document) keeps **every version**,
with who changed what and when, to compare them or go back.

**Synchronising** keeps **your own** devices alike: the documents of the
browser on your laptop are found on your phone. It is not for working with
others.

**Backing up** keeps **a copy aside**, dated, to get things back when
something goes wrong. Synchronising is **not** a backup: a document deleted
or spoilt on one device is deleted or spoilt on all of them.

## What happens when…

| | Lost on this device? | Lost everywhere? |
|---|---|---|
| I **clear the browser's data** | browser storage, recent files, drafts, history | no, if synchronised with another device or backed up |
| I **delete a document** in the browser storage | yes (in the trash of the other devices for 30 days, when synchronised) | after 30 days, unless backed up |
| I **lose my phone** | yes | no, if synchronised or backed up; [revoke it](./device-sync.md#revoking-one-device) |
| A **file on the disk** is deleted | as any file of the disk (its recycle bin) | unless copied elsewhere |
| The **cloud** or the **repository** is down | no, the copy open stays; save again later | no |

## What to choose

- **Just writing, on one computer** → save **files** (the default), and make
  a **backup** now and then.
- **The same documents on my laptop and my phone** → save **in the browser**
  and **synchronise my devices** — and keep a **backup**.
- **Giving a document to someone** → **send** it (QR codes, nothing on a
  network) or a **link** (short documents).
- **Writing together, now** → **real-time collaboration**.
- **Writing together, one of us offline** → **synchronising without a
  network** (QR codes).
- **Keeping every version, with others** (course material, a thesis, code) →
  a **Git repository**.
- **The files of my school or company** → **Nextcloud / WebDAV**.
- **Collecting answers** → forms compiled in a spreadsheet, or **Grist**.

## In the application

- **Save** asks where, when there is a choice (a file, or the browser
  synchronised with your devices); **Save as** chooses the format.
- **🗄️ In this browser** (start screen) lists the documents of the browser,
  their state on your other devices, the trash and the history of the
  synchronisations.
- **Recent files** reopen what you opened lately — from the browser's
  storage, a repository or the cloud when they came from there.
- **📤 Share** gathers sending, links, collaboration and synchronising by QR
  code; **🔁 Sync** your devices; **💾** backups, with the age of the last one.
