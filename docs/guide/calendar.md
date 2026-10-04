---
description: The calendar of PWO — events kept as notes of a folder, month, week, day and agenda views, daily notes, iCalendar files.
---

# Calendar

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
