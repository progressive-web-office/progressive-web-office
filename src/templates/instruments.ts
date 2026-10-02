/**
 * The instrument panel example (CODE-016, FILE-018): the anywidget
 * instruments (industrial) installed from their published wheels, reactive
 * controls (`pwo.ui`) driving indicators, as in their marimo gallery.
 */
import type { TemplateLang } from './content';

/** The wheels published with the instruments' demos (core first). */
export const INSTRUMENTS_WHEELS = 'https://anywidgetinstruments.github.io/anywidget-instruments-industrial/marimo/gallery/public/wheel.txt';

const fence = (body: string, info: string): string => `\`\`\`${info}\n${body.trim()}\n\`\`\``;

interface Texts {
  title: string;
  intro: string;
  install: [heading: string, text: string];
  controls: [heading: string, text: string];
  indicators: [heading: string, text: string];
  outro: string;
  labels: { setpoint: string; gain: string; run: string; level: string; output: string; temperature: string; running: string; display: string };
}

const TEXTS: Record<TemplateLang, Texts> = {
  en: {
    title: 'Instrument panel',
    intro:
      'Knobs, switches and indicators from the [anywidget instruments](https://anywidgetinstruments.github.io/) (industrial). Press **⏩**: the first cell downloads the instruments (you are asked first; they are then kept for offline use), the next ones show the panel. Turn the knobs and flip the switch: the indicators follow.',
    install: ['Installing the instruments', 'The instruments are not on the Python package index yet: they are installed from the wheels published with their demos.'],
    controls: ['Controls', '`pwo.ui(...)` makes each control reactive: when you change it, the cells using it run again.'],
    indicators: ['Indicators', 'This cell uses the three controls: it runs again, and redraws the indicators, when one of them changes.'],
    outro:
      'These widgets are for visualization, teaching and simulation: they are not certified instruments and must never control real equipment. Saving or printing keeps a picture of each one.',
    labels: { setpoint: 'Setpoint', gain: 'Gain', run: 'Run', level: 'Level', output: 'Output', temperature: 'Temperature', running: 'Running', display: 'Display' },
  },
  fr: {
    title: 'Tableau de bord d’instruments',
    intro:
      'Boutons rotatifs, interrupteurs et indicateurs des [anywidget instruments](https://anywidgetinstruments.github.io/) (industriels). Appuyez sur **⏩** : la première cellule télécharge les instruments (votre accord est demandé ; ils sont ensuite gardés pour le hors-ligne), les suivantes affichent le tableau. Tournez les boutons et basculez l’interrupteur : les indicateurs suivent.',
    install: ['Installer les instruments', 'Les instruments ne sont pas encore sur l’index des paquets Python : ils sont installés depuis les wheels publiées avec leurs démos.'],
    controls: ['Commandes', '`pwo.ui(...)` rend chaque commande réactive : quand vous la changez, les cellules qui l’utilisent s’exécutent à nouveau.'],
    indicators: ['Indicateurs', 'Cette cellule utilise les trois commandes : elle se relance, et redessine les indicateurs, quand l’une d’elles change.'],
    outro:
      'Ces widgets servent à la visualisation, à l’enseignement et à la simulation : ce ne sont pas des instruments certifiés et ils ne doivent jamais commander un équipement réel. Enregistrer ou imprimer garde une image de chacun.',
    labels: { setpoint: 'Consigne', gain: 'Gain', run: 'Marche', level: 'Niveau', output: 'Sortie', temperature: 'Température', running: 'En marche', display: 'Affichage' },
  },
};

export function instrumentsMarkdown(lang: TemplateLang): string {
  const T = TEXTS[lang];
  const L = T.labels;
  const q = (s: string): string => JSON.stringify(s);
  const install = `import pwo

await pwo.install(${q(INSTRUMENTS_WHEELS)})`;
  const controls = `import anywidget_instruments_industrial as ai

setpoint = pwo.ui(ai.Knob(60, step=1, unit="%", label=${q(L.setpoint)}))
gain = pwo.ui(ai.Knob(1.0, min=0, max=2, step=0.05, label=${q(L.gain)}))
run = pwo.ui(ai.ToggleSwitch(True, label=${q(L.run)}))
ai.Panel([setpoint, gain, run], columns=3)`;
  const indicators = `level = min(setpoint.value * gain.value if run.value else 0.0, 100.0)
ai.Panel(
    [
        ai.Tank(level, unit="%", label=${q(L.level)}, hi=90, lo=10, show_limits=True),
        ai.Gauge(level, unit="%", label=${q(L.output)}, hi=80, hihi=95),
        ai.Thermometer(20 + level / 4, min=0, max=50, unit="°C", label=${q(L.temperature)}),
        ai.LED(run.value, label=${q(L.running)}),
        ai.SevenSegment(level, digits=5, decimals=1, label=${q(L.display)}),
    ],
    columns=3,
)`;
  return `${[
    `# ${T.title}`,
    T.intro,
    `## ${T.install[0]}`,
    T.install[1],
    fence(install, 'python {run}'),
    `## ${T.controls[0]}`,
    T.controls[1],
    fence(controls, 'python {run}'),
    `## ${T.indicators[0]}`,
    T.indicators[1],
    fence(indicators, 'python {run}'),
    T.outro,
  ].join('\n\n')}\n`;
}
