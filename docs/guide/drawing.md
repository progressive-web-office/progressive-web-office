# Drawings and schematics

Draw shapes, arrows and labels, or a schematic — electrical and electronic,
logic, block diagram, pneumatic or hydraulic, flowchart — right inside a text
document. The drawing is kept as an **SVG** picture that any browser or
drawing program can show, and that opens again here, editable, by a double
click.

## Starting a drawing

From the **start screen**, **✏️ New drawing or schematic** opens the editor
straight away; **Done** shows the drawing as a picture, saved with **Save**
as an `.svg` file. An `.svg` file opened in the application has an
**✏️ Edit the drawing** button (a double click works too).

In a text document, choose **Insert → ✏️ Drawing or schematic…** (also in the
right-click menu and the command palette); in a presentation, the same button
is in the slide toolbar. To change a drawing later, **double-click** it (in a
document, right-clicking it and choosing **Edit the drawing** works too).
Any SVG picture of a document opens the same way: its rectangles, circles,
lines, polygons, paths and texts become editable; what cannot be edited
(groups with transforms, embedded pictures) is kept as it is and moves as a
whole.

## Tools

| Tool | Use |
|---|---|
| ⬚ Select and move | Click a shape (Shift+click adds to the selection), drag to move it; drag on an empty spot to select everything in a rectangle |
| ▭ Rectangle, ◯ Ellipse | Drag from one corner to the other; Shift draws a square or a circle |
| ╱ Line, ➝ Arrow | Drag from one end to the other; an end dropped on a connection point stays attached to it |
| ✎ Freehand | Draw with the mouse, the finger or a pen; the stroke is smoothed |
| T Text | Click where the text goes |
| ⌐ Wire | Drag from a pin to another pin: the wire is drawn in right angles |

Everything snaps to the **grid** (10 px). Untick **Snap** to place freely, or
hold **Alt** while dragging. **Grid** shows or hides it.

The bar under the tools sets the **line colour**, the **fill** (or no fill),
the **thickness** and the **dashes** — of the selection, and of the next
shapes drawn. **Align…** lines up the selected shapes (left, centre, right,
top, middle, bottom); ⬆ and ⬇ bring them to the front or send them to the
back.

## Symbols and schematics

The panel on the left holds the symbol libraries; type in **Search a
symbol…** (for instance `resistor`, `npn`, `5/2`, `ISO 1219`, `decision`) or
choose a library:

- **Electrical and electronic (IEC 60617)**: resistor, potentiometer,
  capacitors, inductor, diodes (LED, Zener), NPN and PNP transistors,
  MOSFETs, operational amplifier, voltage and current sources, battery,
  earth, switches and push button, changeover switch, fuse, lamp, motor,
  generator, transformer, relay coil and contacts, voltmeter, ammeter,
  wattmeter, terminal;
- **Logic gates**: AND, OR, NOT, NAND, NOR, XOR, with the IEC (rectangles)
  and the ANSI (distinctive) shapes;
- **Block diagrams**: block, summing point, take-off point, integrator;
- **Pneumatic and hydraulic (ISO 1219)**: single- and double-acting
  cylinders, 3/2 and 5/2 directional valves, pump, compressor, pressure
  source, exhaust, check valve, flow control valve, pressure gauge;
- **Flowcharts (ISO 5807)**: start / end, process, decision, input / output,
  predefined process, connector.

A click places the symbol in the middle of the view. Its pins sit on the grid
and show as orange dots while the **Wire**, **Line** or **Arrow** tool is
chosen. Wires stay connected when a symbol is moved, turned (**R**, a quarter
turn) or mirrored (**M**); a dot marks where three wires or more meet, none
where they only cross.

Each symbol gets a **reference** numbered by kind — R1, R2, C1, Q1, K1… — and
a **value**, both written beside it. Values are written the usual way:
`4k7` becomes `4.7 kΩ`, `100n` on a capacitor `100 nF`, `22u` `22 µF`, `12`
on a battery `12 V`. In flowcharts and blocks the value is the text written
inside the shape.

## Netlist and bill of materials

When the drawing holds electrical symbols, two more buttons appear at the
bottom of the editor:

- **Netlist (SPICE)** downloads `schematic.cir`, ready for a SPICE simulator
  (ngspice, LTspice, Qucs-S…). Wires joined end to end or in a T form one
  net; wires that only cross do not. The earth symbol is net `0`; a
  **Terminal** whose value is set names its net (`VOUT`…), the others are
  numbered `N1`, `N2`… Values are written the SPICE way (`4.7 kΩ` → `4.7k`,
  `1 MΩ` → `1Meg`); a diode or transistor without a value gets a default
  model. Parts SPICE does not know (lamps, switches, meters…) are listed as
  comments.
- **Bill of materials** downloads a CSV file to open as a spreadsheet: one
  line per kind of component and value, with the quantity and the
  references (`2, R1 R2, Resistor, 470 Ω`).

## Keyboard

| Keys | Action |
|---|---|
| Arrows | Move the selection by a grid step (Shift: by one pixel) |
| R / M | Turn a quarter turn / mirror the selected symbols |
| Delete | Delete the selection (the wires attached are kept, loose) |
| Ctrl+D | Duplicate |
| Ctrl+A | Select all |
| Ctrl+Z / Ctrl+Y | Undo / redo |
| Escape | Clear the selection and go back to the select tool |

The **Objects** list on the right names every shape — "Resistor R1 4.7 kΩ",
"Wire", "Text: Input" — for screen readers and for reaching each one with
Tab; a click (or Enter) selects it, and the arrows then move it.

## Size, description, export

- **Width** and **Height** set the size of the drawing; **Fit to the
  content** crops it around the shapes.
- **Description** is the alternative text of the picture, read to those who
  cannot see it.
- **Download SVG** and **Download PNG** (twice the size, for sharp printing)
  save the drawing on its own.

**Done** puts the drawing in the document (or updates it), **Cancel** leaves
it as it was.

## In other formats

| Format | The drawing is kept as |
|---|---|
| ODT, Markdown, MDZ | the SVG picture, editable again |
| DOCX | a PNG picture with the SVG beside it (Word 2016 and later shows the SVG, older versions the PNG); reopened here, the SVG is read back, editable |
| LaTeX (.zip) | a PNG picture for `\includegraphics`, the SVG next to it |
| Print, PDF | drawn sharp at any size |

## Painting (bitmap pictures)

For a picture made of pixels — a sketch, a photo to touch up — use the
painting editor:

- from the **start screen**, **🎨 New painting** (a white 800 × 500 picture,
  saved as `.png`);
- a PNG, JPEG or WebP file opened in the application: **🎨 Paint on the
  picture** (or a double click); it is saved back in its own format;
- in a text document, **Insert → 🖌 Painting (new picture)…**, or right-click
  a picture → **Paint on the picture**.

| Tool | Use |
|---|---|
| ✏ Pencil | Hard-edged pixels, for pixel art and fine touches |
| 🖌 Brush | Smooth strokes; the opacity applies to the whole stroke (no darker overlaps) |
| ⌫ Eraser | Makes pixels transparent (white in a JPEG) |
| 🪣 Fill | Fills the area of the same colour around the click |
| ╱ ▭ ◯ | Line, rectangle, ellipse; Shift for 45° lines, squares and circles; **filled shapes** to fill them |
| T Text | Writes text where you click, sized by **Size** |
| 💧 Pick a colour | Takes the colour of a pixel |
| ⬚ Select | Drag a rectangle; drag it (or use the arrows, Shift: 10 px) to move its pixels; Delete clears it; Ctrl+C / Ctrl+X / Ctrl+V copy, cut and paste |

**Colour**, **Size** and **Opacity** set the tool; **Width** and **Height**
resize the canvas (the picture stays at the top left). Undo and redo with
Ctrl+Z and Ctrl+Y; zoom with − and +.
