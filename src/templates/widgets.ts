/**
 * The interactive widgets example (FILE-018, CODE-016): an anywidget slider
 * in Python driving a plot, and a widget written in a JavaScript cell. The
 * cells have no output yet: widgets come alive when the cells run.
 */
import type { TemplateLang } from './content';

const fence = (body: string, info: string): string => `\`\`\`${info}\n${body.trim()}\n\`\`\``;

/** A slider as an anywidget front-end module (AFM). */
const SLIDER_ESM = `export default {
  render({ model, el }) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    const value = document.createElement("output");
    input.type = "range";
    for (const k of ["min", "max", "step"]) input[k] = model.get(k);
    input.value = model.get("value");
    const show = () => {
      label.firstChild.textContent = model.get("label") + " ";
      value.textContent = " " + model.get("value");
      input.value = model.get("value");
    };
    label.append("", input, value);
    input.addEventListener("change", () => {
      model.set("value", Number(input.value));
      model.save_changes();
    });
    model.on("change:value", show);
    show();
    el.append(label);
  },
};`;

/** A counter written in a JavaScript cell. */
const COUNTER_ESM = `export default {
  render({ model, el }) {
    const button = document.createElement("button");
    const show = () => { button.textContent = "👍 " + model.get("count"); };
    button.addEventListener("click", () => {
      model.set("count", model.get("count") + 1);
      model.save_changes();
    });
    model.on("change:count", show);
    show();
    el.append(button);
  },
}`;

interface Texts {
  title: string;
  intro: string;
  python: [heading: string, text: string, label: string, after: string];
  javascript: [heading: string, text: string, after: string];
  instruments: [heading: string, text: string];
  outro: string;
  plot: { title: string; x: string };
  count: string;
}

const TEXTS: Record<TemplateLang, Texts> = {
  en: {
    title: 'Interactive widgets',
    intro:
      'Cells can show **interactive widgets**, built on [anywidget](https://anywidget.dev). Press **⏩** to run every cell (the first run of Python downloads it, then it works offline), then move the slider and click the button.',
    python: [
      'A slider in Python',
      'The slider is an anywidget: a small web module and the values it shares with Python. `pwo.ui(...)` makes it **reactive**: when you move it, the cells using `freq` run again.',
      'Frequency (Hz)',
      'This cell uses `freq`: it runs again by itself when the slider moves.',
    ],
    javascript: [
      'A widget in JavaScript',
      'JavaScript cells create widgets too, with `widget(module, values)`; `display(...)` shows them and `ui(...)` makes them reactive. No download is needed.',
      'Click the button: this cell counts with it.',
    ],
    instruments: [
      'Instrument panels',
      'The [anywidget instruments](https://anywidgetinstruments.github.io/) (knobs, gauges, tanks, LEDs, alarms; automotive and flight instruments) work here too: install them with `await pwo.install("…/wheel.txt")`, or use their front end from JavaScript with `importWidget(url)`. See *Code cells › Widgets* in the documentation.',
    ],
    outro: 'Saving or printing keeps a picture of each widget, shown in print, in Word and OpenDocument exports and when the document is reopened.',
    plot: { title: 'Signal', x: 't (s)' },
    count: 'clicks so far:',
  },
  fr: {
    title: 'Widgets interactifs',
    intro:
      'Les cellules peuvent afficher des **widgets interactifs**, construits avec [anywidget](https://anywidget.dev). Appuyez sur **⏩** pour exécuter toutes les cellules (la première exécution de Python le télécharge, ensuite tout fonctionne hors ligne), puis déplacez le curseur et cliquez sur le bouton.',
    python: [
      'Un curseur en Python',
      'Le curseur est un anywidget : un petit module web et les valeurs qu’il partage avec Python. `pwo.ui(...)` le rend **réactif** : quand vous le déplacez, les cellules qui utilisent `freq` s’exécutent à nouveau.',
      'Fréquence (Hz)',
      'Cette cellule utilise `freq` : elle se relance d’elle-même quand le curseur bouge.',
    ],
    javascript: [
      'Un widget en JavaScript',
      'Les cellules JavaScript créent aussi des widgets, avec `widget(module, valeurs)` ; `display(...)` les affiche et `ui(...)` les rend réactifs. Aucun téléchargement n’est nécessaire.',
      'Cliquez sur le bouton : cette cellule compte avec lui.',
    ],
    instruments: [
      'Tableaux de bord d’instruments',
      'Les [anywidget instruments](https://anywidgetinstruments.github.io/) (boutons rotatifs, jauges, cuves, voyants, alarmes ; instruments automobiles et de vol) fonctionnent aussi : installez-les avec `await pwo.install("…/wheel.txt")`, ou utilisez leur front-end depuis JavaScript avec `importWidget(url)`. Voir *Cellules de code › Widgets* dans la documentation.',
    ],
    outro: 'Enregistrer ou imprimer garde une image de chaque widget, montrée à l’impression, dans les exports Word et OpenDocument et à la réouverture du document.',
    plot: { title: 'Signal', x: 't (s)' },
    count: 'clics jusqu’ici :',
  },
};

export function widgetsMarkdown(lang: TemplateLang): string {
  const T = TEXTS[lang];
  const slider = `import anywidget
import traitlets
import pwo


class Slider(anywidget.AnyWidget):
    _esm = """
${SLIDER_ESM}
"""
    value = traitlets.Float(1).tag(sync=True)
    min = traitlets.Float(0).tag(sync=True)
    max = traitlets.Float(10).tag(sync=True)
    step = traitlets.Float(0.5).tag(sync=True)
    label = traitlets.Unicode("").tag(sync=True)


freq = pwo.ui(Slider(value=2, min=0.5, max=5, step=0.5, label=${JSON.stringify(T.python[2])}))
freq`;
  const plot = `import numpy as np
import matplotlib.pyplot as plt

_t = np.linspace(0, 2, 500)
plt.figure(figsize=(6, 2.6))
plt.plot(_t, np.sin(2 * np.pi * freq.value * _t))
plt.title(f"${T.plot.title}, f = {freq.value} Hz")
plt.xlabel(${JSON.stringify(T.plot.x)})
plt.grid(alpha=0.3)
plt.tight_layout()`;
  const counter = `const clicks = ui(widget(\`${COUNTER_ESM}\`, { count: 0 }));
display(clicks);`;
  const reader = `console.log(${JSON.stringify(T.count)}, clicks.get("count"));`;
  return `${[
    `# ${T.title}`,
    T.intro,
    `## ${T.python[0]}`,
    T.python[1],
    fence(slider, 'python {run}'),
    T.python[3],
    fence(plot, 'python {run}'),
    `## ${T.javascript[0]}`,
    T.javascript[1],
    fence(counter, 'javascript {run}'),
    T.javascript[2],
    fence(reader, 'javascript {run}'),
    `## ${T.instruments[0]}`,
    T.instruments[1],
    T.outro,
  ].join('\n\n')}\n`;
}
