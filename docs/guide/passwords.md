# Passwords

A **vault of passwords** (VAULT-001..VAULT-004) is a `.kdbx` file: the open
format the password managers of every system read. Keep it in a folder, on
a server, or synchronised between your devices; on a phone or a computer,
the password managers of that format fill in your passwords in other sites
and apps from the same file — which a web application cannot do.

*New password vault…* in the command palette makes one: a name and a master
password, typed twice (a few words are best). Any `.kdbx` file opens as a
document.

## Opening a vault

Its **master password**, and its **key file** if it has one. Nobody can open
the vault without them, you included: the key is derived by Argon2id
(64 MiB, as recommended for such files), on the device.

Where the application is locked with a passkey ([Locking the
application](./lock.md)), tick **Open it with the lock of the application on
this device**: the master password is kept encrypted by the lock, and the
vault opens by itself the next times, once the lock is open.

## Entries

The groups on the left, the entries in the middle (search by title, user
name, address or tag), the entry chosen on the right:

- the **password** is hidden until **👁** shows it; **⧉** copies a value —
  user name, password, a field — to the clipboard, cleared after 30 seconds;
- **🎲** generates a new password; its strength is shown in bits;
- **one-time codes** (TOTP): an entry with an `otp` field (an
  `otpauth://totp/…` address) shows its code and the seconds left;
- **Check against known breaches**: after your consent, only the first five
  characters of a hash of the password are sent (k-anonymity, with
  padding); the password never leaves the device;
- **Keep the changes**, then save the vault; a deleted entry goes to the
  recycle bin of the vault; the previous version of an entry is kept in its
  history, as the other applications of the format do.

**Password generator** draws passwords of the length and characters chosen,
without bias, from the browser's random numbers.
