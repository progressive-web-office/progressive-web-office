---
description: Create and edit PowerPoint and OpenDocument presentations, and present them full screen.
---

# Presentations

The presentation editor opens **PowerPoint** (`.pptx`) and **OpenDocument
Presentation** (`.odp`) files.

## Layout

- **Left**: slide thumbnails — click one to edit it.
- **Centre**: the current slide.
- **Bottom**: speaker notes for the current slide.

## Slides

| Button | Action |
|--------|--------|
| **+ Slide** | add a slide (title + bullet list) after the current one |
| ⧉ | duplicate the current slide |
| ↑ ↓ | move the current slide |
| 🗑 | delete the current slide |
| **▶ Present** (<kbd>F5</kbd>) | start the slideshow from the current slide |

## Shapes

- **T** text box, **▭** rectangle, **◯** ellipse, **🖼** image.
- Click a shape to select it; drag to move it, drag the corner handle to
  resize it. Arrow keys move the selected shape (<kbd>Shift</kbd>: 10 px).
- Double-click (or <kbd>Enter</kbd>) to edit its text; <kbd>Esc</kbd> to stop.
- <kbd>Delete</kbd> removes the selected shape; ⬆ ⬇ change its stacking
  order; the colour picker sets its fill colour.
- **B / I / U**, font size, text colour, alignment and bullets apply to the
  selected text while editing, or to the whole shape otherwise.
- The font size field suggests the usual sizes, up to 300 pt, and takes
  any size from 1 to 999 pt: type it and press <kbd>Enter</kbd>.
  <kbd>↑</kbd> / <kbd>↓</kbd> step to the next size, by 20 % past the
  largest one.
- <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd> undo and redo.

## Slideshow

| Key | Action |
|-----|--------|
| <kbd>→</kbd>, <kbd>↓</kbd>, <kbd>Space</kbd>, <kbd>Page Down</kbd>, <kbd>Enter</kbd>, click | next slide |
| <kbd>←</kbd>, <kbd>↑</kbd>, <kbd>Page Up</kbd>, <kbd>Backspace</kbd>, right-click | previous slide |
| <kbd>Home</kbd> / <kbd>End</kbd> | first / last slide |
| <kbd>Esc</kbd> | exit |

The slideshow uses the full screen when the browser allows it.

## What is preserved

Slide size, text boxes and placeholders (title, subtitle, body — with
geometry inherited from the layout and master in `.pptx`), rectangles,
ellipses, pictures, solid fill and outline colours, theme colours, slide
backgrounds, bold/italic/underline/strikethrough, font size and colour,
alignment, bullets and numbering, speaker notes. Tables are imported as text.

Not preserved: animations and transitions, gradients and effects, SmartArt,
charts, embedded media, rotation, custom geometries (imported as rectangles),
master and layout designs (slides are saved with a blank master).
