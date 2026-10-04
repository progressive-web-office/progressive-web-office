---
description: The calendar and the contacts of PWO — events and people kept as notes of a folder, month, week, day and agenda views, daily notes, iCalendar and vCard files.
---

# Calendar and contacts

The calendar shows the **events of the folder open** — or, with no folder
open, of the documents kept in the browser. Open it with **📅 Calendar** on
the start screen, **🗓** beside the small calendar of the folder panel, or
*Calendar* in the command palette (`Ctrl+Shift+P`).

## Events are notes

Each event is a Markdown note of the `Events` folder (CAL-001), named after
its day and title (`Events/2026-10-05 Kick-off.md`):

```markdown
---
title: Kick-off
type: "[[Event]]"
start: 2026-10-05T09:30
end: 2026-10-05T10:30
location: Room 12
attendees:
  - "[[Ada Lovelace]]"
calendar: Work
recurrence: FREQ=WEEKLY;BYDAY=MO
uid: 0b1c…@pwo
---

The agenda, the minutes: the text of the note.
```

So an event is linked from other notes (`[[2026-10-05 Kick-off]]`), shows
its attendees' notes as links (and appears in their backlinks), is found by
the search and its tags, and its properties are shown and changed like
those of any note. An event of whole days has a `start` and `end` without
time — the end being the day after the last one, as calendars count.
Changing an event from the calendar keeps the other properties and the text
of its note.

## Views

- **Month**, **Week**, **Day** and **Agenda** (the next 30 days), today
  marked, and in the week and day views a red line at the time it is.
- **‹ ›** go back and forth, **Today** comes back; the keys `←` `→`, `t`
  (today), `m` `w` `d` `a` (the views) and `n` (a new event) do the same.
- The events of a calendar (`calendar:` of the note: *Work*, *Home*…) have
  their colour.

## Creating and changing events

- A click on a day of the month, or on an hour of the week or day, opens
  the window of a **new event** there; **＋ New event** too.
- A click on an event opens its window: title, whole day, start and end
  (moving the start moves the end), repeat (every day, week, month, year),
  location, attendees (the notes of people are proposed), calendar and
  description. **Open the note** opens it; **Delete** removes it with its
  note.
- **Dragged** to another day or hour, an event moves — its series with it,
  for a repeating event.

## With the daily notes

A click on the **date** of a day opens its daily note (created if needed).
A new daily note lists the events of its day in its `events` property, and
an event created for a day whose daily note exists is added to it (CAL-005).

## iCalendar files

**⇪** imports a `.ics` file (from another calendar): each event becomes a
note of `Events`; an event already imported is updated, not repeated. **⇩**
exports the events as a `.ics` file (CAL-003). Times given in a time zone
or in UTC are shown at your local time; repeating events follow their rule.

## Contacts

**👥 Contacts** (start screen, command palette) shows the people of the
folder: each is a note of the `People` folder (CONTACT-001):

```markdown
---
title: Ada Lovelace
type: "[[Person]]"
first name: Ada
last name: Lovelace
emails:
  - ada@example.org
phones:
  - "+33 6 12 34 56 78"
organization: "[[Analytical Engines]]"
birthday: 1815-12-10
tags:
  - person
---

What you know of her, met where, about what.
```

- The **list** is searched by name, e-mail, organisation or `#tag`
  (CONTACT-002); the **card** of a contact shows its fields — an e-mail to
  write to, a number to call, its organisation's note — then the
  **events** it attends and the **notes linking to it**, with the words
  around each link: write `[[Ada Lovelace]]` in a note, or name her among
  the attendees of an event.
- **＋ New contact**, **Edit** and **Delete** change the contacts; the name
  shown follows the first and last names until you write it.
- **Birthdays** are shown in the calendar, every year (CONTACT-004); a click
  opens the contact.
- **⇪** imports a `.vcf` file (vCard 3.0 or 4.0, from a phone or another
  address book) as notes; **⇩** exports the contacts as a `.vcf` file
  (CONTACT-003).

## Folders

Events go to `Events` and contacts to `People`, at the root of the folder
open; both are notes like the others: move, rename or link them freely.
