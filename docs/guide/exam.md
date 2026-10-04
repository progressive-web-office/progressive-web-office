---
description: Exam mode — a browser set up for a test, without network, AI or pasting from outside, ended with the teacher's code.
---

# Exam mode

For a test on the students' devices: until the teacher types their code,
this browser

- **reaches no network**: no AI assistant, real-time collaboration, device
  synchronisation, repositories, Nextcloud or Grist, no downloads (code cells
  needing a runtime do not run) — only the files of the application itself;
- **pastes only what was copied in the application**: a text copied from a
  website, a chat or another file is refused;
- **refuses files dropped from outside** (opening a file of the device with
  **Open** stays possible, for a subject handed out on the device);
- **logs, with the time**, what might be cheating: leaving the window or the
  full screen, another tab or application in front, pastes and connections
  refused, wrong codes.

Saving the work stays as usual (download, a folder of the device, the
browser's storage).

## Starting it

**⚙ Settings ▸ General ▸ 🔒 Exam mode…** (or *Exam mode…* in the command
palette): name the test (shown to the students), choose a code of at least
4 characters, type it twice. The application starts again, with a banner
always in sight: the name of the test, since when, what is off, and what was
just refused. **⛶ Full screen** fills the screen (leaving it is logged).

## Ending it

**🔓 End the exam mode** in the banner asks for the code (a wrong one is
logged), then shows the **log**: how many times each thing happened, and
each event with its time. **Save the log** downloads it as text, to keep
with the copy. **📋 Log** shows it during the test.

## Its limits — know them

The exam mode **deters; it does not lock the computer**. It runs in an
ordinary browser:

- someone who opens the browser's developer tools, another browser or
  another device gets around it;
- the code is kept hashed (PBKDF2), but the mode itself is a setting of the
  browser, which a student who knows how can remove;
- other applications on the computer are not stopped — only noticed, when
  the window loses the focus.

For a real lockdown, run the application inside a **kiosk**: a managed
Chromebook in kiosk mode, [Safe Exam Browser](https://safeexambrowser.org/),
or a computer session made for exams. The exam mode then adds what those do
not know about: no AI, no network features, no outside paste, and the log.
