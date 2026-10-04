---
description: Find the documents kept in the browser on your other devices — peer to peer, end-to-end encrypted — with the risks of synchronisation explained.
---

# Syncing my devices

The documents kept **in the browser** (*Open a folder › Browser storage*)
can be found on your other devices — a laptop, a phone, a tablet — copied
**directly between them** while the application is open on both, without
any account or server of ours.

## Before you start

The window shows these warnings first, and asks you to acknowledge them:

- **Synchronisation is not a backup.** A document spoilt on one device is
  spoilt on all of them. Keep [backups](./backup.md) too (**💾**).
- **A deletion reaches every device.** A document deleted on one device is
  deleted on the others — it is kept in the **trash** of each device
  (`Documents/.pwo-trash/<date>/`) for **30 days**, then removed. A version
  replaced by a newer one goes there too.
- **It is for one person's own devices**, not for working with others: use
  [real-time collaboration](./collaboration.md) for that.

## Pairing

1. On the first device: **🔁 Sync my devices** (in *Share*, or the command
   palette), name the device, then **Create a pairing**. This makes the
   **key** of your documents, which stays on your devices.
2. To add another device, on a device already paired: **Add a device ›
   Show an invitation QR code** (or, in the command palette, *Add a device:
   show an invitation QR code*). The invitation is valid **5 minutes**, for
   **one device**; the window says, under the QR code, what to do on the new
   device.
3. On the new device, scan the QR code — with **Scan the invitation QR
   code…** (the scanner of [QRShare](./sharing.md)), the camera of the phone,
   or any QR reader: it is a link to the application, which opens ready to
   pair. You can also copy the link (**Copy the link**) and paste it in
   **Invitation link**. Read and acknowledge the warnings, check the **name
   of the device** (the other device shows it), then **Pair**: the new
   device shows **four emojis**.
4. The paired device shows *“… asks to join”* with four emojis. **Accept
   only if they are the same as on the new device.** Only then does it send
   the key, encrypted, to the new device, which starts synchronising.

The command palette (**⌘ Commands**, `Ctrl+Shift+P`) also has *Sync my
devices now* and *Pair this device: scan an invitation QR code*.

The name of a device is yours to choose: a web page cannot read the name of
the computer. On a phone, the browser may tell its model (*Pixel 7 ·
Chrome*), used as a first name; elsewhere it is the system and the browser
(*Windows · Chrome*).

A device **already paired** that opens an invitation asks first: **Join
this invitation** stops its current pairing (its documents stay) and joins
the devices of the invitation; **Keep the current pairing** ignores it.

## Synchronising

**Sync now** merges this device with the paired devices online; with
**Synchronise by itself while the application is open**, it happens when a
device arrives and every few minutes. The window lists the devices, online
or last seen, and the last synchronisation.

How the documents are merged:

- a document new or changed on one device is copied to the other;
- a document changed **on both** since the last synchronisation is kept
  twice: the newest under its name, the other as
  `report (conflict Laptop 2026-10-03 21.05).md` — the same on every device;
- a document deleted on one device and unchanged on the other goes to the
  other's trash; changed there since, it is kept (and comes back).

Hidden files and the trash are never synchronised.

## When the devices do not see each other

- **Open the application on both devices**, each on **🔁 Sync my devices**
  (or with *Synchronise by itself*): devices meet only while the
  application is open on both.
- **Compare the fingerprint of the pairing** (three emojis under the
  devices): it is the same on every device paired together. Different, the
  devices do not share the same key — pair the device again with a new
  invitation.
- **Reload the application** on both devices after an update (or close and
  reopen the installed application): an older version may still be running.
- **Read the Network line**: if no relay is reached (*0/6*), the network
  blocks them (a company or school network…) — try another network, or set
  relays and a TURN server in *Settings › Collaboration*. When no device is
  reached directly within about ten seconds (a phone on a mobile network and
  a computer on Wi-Fi, for instance), the messages also go through the
  relays, still encrypted: the line then says so.

## Security

**What protects your documents**

- The invitation (QR code or link) **never contains the key of your
  documents**: only a meeting place and a secret valid 5 minutes, for one
  device.
- The new device comes with a **public key of its own**, made for this
  pairing (ECDH P-256). The key of your documents is sent **encrypted for
  that public key alone** (AES-GCM): even someone who has the invitation and
  reads the messages passing through the relays cannot read it.
- **Nothing gets in without your approval** on a device already paired. A
  photographed QR code, or a link left in a history, is expired or already
  used.
- The **emojis** are drawn from the invitation and the public key of the
  device asking: another device asking with the same invitation, or someone
  slipping their own key in between, would show different emojis.
- The invitation is in the part of the link after `#`, which browsers do not
  send to servers; the application removes it from the address as soon as
  it opens.
- Devices find each other through public relays (or those of the
  *Collaboration* settings), which see neither the documents nor their
  names: everything is **end-to-end encrypted** with the key, and goes
  directly between the browsers when the network allows it (otherwise,
  encrypted, through the relays or the TURN server of the settings). Paths
  received from another device are checked before anything is written.

**Its limits — know them**

- **Accepting without comparing the emojis** defeats the check: anyone who
  scanned or photographed the QR code during those 5 minutes can ask to
  join, under any device name they like. The name proves nothing; the
  emojis do. Four emojis out of 64 make a wrong match unlikely (1 in 16
  million), not impossible: when in doubt, **Refuse** and show a new
  invitation.
- **The key is kept in each paired browser** (its local storage), not
  protected by a password. Whoever can use that browser profile — someone
  at the unlocked device, malware, a malicious browser extension — can read
  your documents and the key. Protect your devices with a lock screen.
- **A lost or stolen device** keeps the key and the documents it already
  has. On a device you keep, use **New key (unpair the other devices)**,
  then invite again the devices you still use: the lost one no longer gets
  new changes, but what it already holds cannot be taken back.
- The relays see **that** devices meet — the name of the meeting place (a
  random value), their network addresses, when and how much they exchange —
  but not what.
- The invitation link may stay in the history of QRShare, of the camera
  app or of the browser that opened it. Expired or used, it no longer gives
  anything.
- Codes of the first version (`pwo-sync:…`, the key itself) are still
  understood in **Invitation link**, for devices not updated yet: they give
  the key to whoever has them, without any approval. Do not share them;
  after pairing that way, prefer making a new key and inviting again.
- This synchronisation has not been audited by security specialists. For
  confidential documents, also weigh [backups](./backup.md) kept offline and
  encrypted.

**Stop synchronising this device** forgets the pairing; the documents stay
on every device.
