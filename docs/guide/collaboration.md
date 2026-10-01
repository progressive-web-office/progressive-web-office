---
description: Edit a text document or a spreadsheet with others in real time, peer to peer, with presence and a shared version history — no server stores the document.
---

# Real-time collaboration

Several people can edit the same **text document** or **spreadsheet** at the
same time. Edits appear for everyone within a second, you see who is there and
where they are working, and anyone can save and restore versions.

## Starting a session

1. Open or create a document, then click **👥** (*Collaborate*) in the toolbar.
2. Copy the **invitation link** and send it to the people you want to work
   with (email, chat, QR code…).

A bar appears above the document with the people in the session, an
**Invite** button to show the link again, **Versions**, and **Leave**.

## Joining

Open the invitation link. Progressive Web Office opens a new document and
fills it with the shared content as soon as another participant is online.
The link stays in the address bar: reloading the page rejoins the session.

## Who is here

Each participant gets a friendly name such as *Swift Crimson Falcon*, written
in the colour of its colour word. Click your own name in the bar to change it
(it is remembered on this device).

- In a spreadsheet, the cell each person has selected is outlined in their
  colour, with their name.
- In a text document, the paragraph each person is in is marked in the margin.

## How edits merge

- **Spreadsheets**: each cell is merged separately. Two people typing in
  different cells never overwrite each other; if both change the same cell at
  the same moment, everyone ends up with the same one of the two values.
- **Text documents**: each paragraph is merged separately. Edits in different
  paragraphs are all kept; if two people change the same paragraph at the same
  moment, one version of that paragraph wins, the same for everyone. Your
  caret stays in place when others' edits arrive.

Undo history is reset when someone else changes a spreadsheet, so that undoing
never brings back a state that would erase their work.

## Versions

**Versions** opens the shared history:

- **Save version** records the current state under a name, with your name and
  the date. Everyone in the session gets it, including people who join later.
- **Restore** brings the document back to a version *for everyone*. The
  current state is first saved as a version ("Before restoring…"), so a
  restore can itself be undone.

## Privacy and how it works

- **No server stores your document.** It travels directly between the
  browsers (WebRTC), end-to-end encrypted.
- To find each other, browsers exchange connection details through public
  **Nostr relays**, encrypted with the secret contained in the link. The
  relays never see the document.
- **Anyone with the link can join and edit.** Share it only with the people
  you want to work with. To stop, everyone clicks **Leave**; start a new
  session to get a new link.
- Each participant keeps the document and its history on their own device
  (browser storage), so the session continues even if the person who started
  it is offline — as long as at least one participant is online when another
  joins.
- **Saving** still works as usual: any participant can save the document as a
  file, to the cloud or to a git repository at any time.

Firewalls that block peer-to-peer connections (some corporate or school
networks) can prevent participants from connecting.

## Compatibility

The collaboration engine is the `@scelles/collab` package, shared with
[QRShare](https://github.com/s-celles/QRShare)'s collaborative editor: same
protocol, same history format.

Presentations, comments and suggested changes are not available yet.
