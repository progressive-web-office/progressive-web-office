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
   palette), name the device, then **Create a pairing**. A **pairing code**
   (`pwo-sync:…`) and its QR code are shown.
2. On each other device: **🔁 Sync my devices**, then type, paste or scan the
   code and **Pair**.

The code holds a secret of 144 bits. **Anyone who gets it can read your
documents**: show it only to your own devices.

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

## Security

Devices find each other through public relays (or those of the
*Collaboration* settings), which see neither the documents nor their names:
everything is **end-to-end encrypted** with the pairing's secret, and goes
directly between the browsers when the network allows it (otherwise,
encrypted, through the relays or the TURN server of the settings). Paths
received from another device are checked before anything is written.

**New code (revoke the others)** makes a new pairing: the devices paired
with the old code stop synchronising with this one until they are paired
again. **Stop synchronising this device** forgets the pairing; the
documents stay on every device.
