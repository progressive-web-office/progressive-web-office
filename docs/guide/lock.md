# Locking the application

The application can be **locked** (LOCK-001..LOCK-005): when it starts,
nothing of what this browser keeps is shown before you open the lock — and
what it keeps is **encrypted**, so that it cannot be read from the
browser's storage either.

## Setting the lock

**⚙ Settings → Security**:

- **Lock with a passkey…** — your fingerprint, face, the PIN of the device,
  or a security key. The passkey must give a secret to encrypt with (the
  PRF extension of passkeys; most recent devices and browsers do). If it
  does not, you are told so: lock with a passphrase, or another passkey.
- or **a passphrase** of 12 characters or more, where no passkey can
  encrypt.
- **Lock again after** a delay without use (5 minutes to 4 hours, or
  never).

A **recovery key** is then shown, **once**: eight groups of four letters
and digits. Keep it out of the device — printed, or in a safe place; it
opens the lock if your passkey is lost. Without a passkey (or the
passphrase) and without the recovery key, nobody can read the data again —
you included.

## What is encrypted

Everything this browser keeps for you is encrypted (AES-GCM, 256 bits)
with one random key, itself kept only wrapped by your passkey's secret, by
the recovery key, or by the passphrase:

- the documents of the browser's storage (their content);
- the recent files, the drafts, the versions and your templates;
- the accounts (cloud, Git, Grist, Zotero) with their passwords and tokens.

Not encrypted: the names of the files of the browser's storage, your
preferences (theme, language…), and the documents of a folder of the device,
a repository or a server, which stay where they are and as they are.
Shared documents and backups are protected by their own passwords; the
synchronisation between your devices is encrypted end to end on its own.

## Opening the lock

When the application starts: **🔑 Unlock with a passkey**, or the
passphrase, or **Use the recovery key**. The key that decrypts stays in
memory only; **Lock now** (in the settings), or the delay without use,
forgets it and starts the application again.

## Several devices, removing the lock

**Add a passkey** lets another passkey open the lock — a security key, or
the passkey of another device. **Remove the lock…** decrypts everything
and removes the lock.

A lock protects a device that is shared, lost or left open. It does not
protect against a program that reads the screen or the memory while the
application is open.
