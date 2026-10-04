---
description: Back up the documents kept in the browser — dated, encrypted archives to a file, a folder or a Nextcloud / WebDAV account — and restore them.
---

# Backups

What you keep **in the browser** — the files of its storage (*Open a folder ›
Browser storage*), recent files, drafts, your templates and the versions of
your documents — lives only there. Clearing the browser's data, a lost or
broken device, or a mistake can lose it. A **backup** is a dated copy of all
of it, kept elsewhere.

## The last backup, always in sight

The **💾** button in the header tells how old the last backup is (**💾 3 d**,
**💾 today**, **💾 !** when there was none) and turns orange when a backup is
due. The start screen reminds you too, with **Back up now**.

## Backing up

**💾** opens the backup window:

- **Where**: a file downloaded each time, a **folder** of this computer
  (chosen once — a USB drive, a synchronised folder…; Chromium-based
  browsers), or a **Nextcloud / WebDAV** account (in its `PWO backups`
  folder);
- **Remind me**: never, every day, every week or every month;
- **Encrypt with a password** (recommended): AES-GCM with a key derived
  from the password (PBKDF2, 600,000 iterations). Without the password,
  nobody can restore the backup — not even you: write it down. It is never
  kept in the browser; it can be remembered until the application is closed.

**Back up now** writes `pwo-backup-YYYY-MM-DD-HHMM.pwobackup`. In a folder or
a WebDAV account, backups are **kept for the last 7 days** (the newest of
each day), then **one a week for 8 weeks**; older ones are removed, other
files are never touched, and the newest backup is always kept.

## Restoring

**💾 › Restore…**: choose a backup file, or one of the backups where they
go; type its password; then tick the files to put back. Files already here
are **kept**: the restored copy goes next to them
(`letter (restored 2026-10-03).md`), unless you tick **Replace the files
already here**; identical files are left as they are. Recent files, drafts,
templates and versions are added when not there yet.

## Backup is not synchronisation

Synchronisation copies changes between devices — a document deleted or
spoilt on one is deleted or spoilt on all of them. A backup keeps the
documents **as they were on its date**: deleting a document does not touch
the backups.

**The 3-2-1 rule**: keep **3** copies of your documents, on **2** different
media, **1** of them in another place (a Nextcloud account, a USB drive kept
at home…).

## What is in a backup

A backup is a ZIP archive (encrypted as a whole when a password is set) with
a `manifest.json` (date, files, numbers of records), the files under
`files/`, and the records of the browser's database under `records/`. The
settings and accounts (tokens, passwords) are **not** included.

## Moving to the new address

Progressive Web Office moves from `s-celles.github.io/progressive-web-office`
to <https://progressive-web-office.github.io/progressive-web-office/>.
The browser keeps documents **per site**, so the documents kept at the old
address do not follow on their own:

1. At the old address, the start screen shows a notice: choose
   **Back up now** and save the backup.
2. Open the new address, then **💾 Backup → Restore…** and pick that backup.
3. Install the application again from the new address if you had installed it.
