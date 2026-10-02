/**
 * The lab report example (FILE-018): Python cells (numpy, matplotlib, SymPy)
 * opened with their output and figures already drawn. The cells live in
 * `lab/<lang>/*.py`; `scripts/template-figures.py` runs them and stores their
 * output in `lab/outputs.json` and their figures in `lab/figures/`.
 */
import type { TemplateLang } from './content';
import outputs from './lab/outputs.json';

const CODE = import.meta.glob<string>('./lab/*/*.py', { query: '?raw', import: 'default', eager: true });
const FIGURES = import.meta.glob<string>('./lab/figures/*.png', { query: '?inline', import: 'default', eager: true });

interface Texts {
  title: string;
  intro: string;
  sections: [heading: string, text: string][];
  outro: string;
}

const TEXTS: Record<TemplateLang, Texts> = {
  en: {
    title: 'Lab report with Python',
    intro:
      'This example mixes text, equations and **Python cells** (numpy, matplotlib, SymPy). The results and figures below were computed in advance: press **⏩** to run every cell again in your browser (the first run downloads Python, then it works offline), or change a value and press **▶**.',
    sections: [
      ['Measurements and least-squares fit', 'The voltage across a resistor is measured for ten currents; Ohm’s law $U = RI$ gives the resistance as the slope of the fitted line.'],
      ['Damped oscillations', 'The free response $x(t) = x_0\\,e^{-\\zeta\\omega_0 t}\\cos(\\omega_d t)$ for three damping ratios $\\zeta$.'],
      ['Frequency response', 'A first-order low-pass filter, $\\underline{H} = \\dfrac{1}{1 + j f/f_c}$: gain and phase on a logarithmic frequency axis.'],
      ['Statistics of repeated measurements', 'The spread of 200 measurements of $g$, their mean, standard deviation $s$ and standard uncertainty $u = s/\\sqrt{n}$.'],
      ['A field map', 'Equipotential lines of two opposite charges.'],
      ['Symbolic calculation', 'SymPy solves the differential equation of an RC circuit, $RC\\,\\dfrac{du}{dt} + u = E$, exactly.'],
    ],
    outro: 'Variables are shared between cells, like in a notebook: `rng` and `np`, defined in the first cell, are used by the next ones.',
  },
  fr: {
    title: 'Compte rendu de TP avec Python',
    intro:
      'Cet exemple mêle texte, équations et **cellules Python** (numpy, matplotlib, SymPy). Les résultats et figures ci-dessous ont été calculés à l’avance : appuyez sur **⏩** pour réexécuter toutes les cellules dans votre navigateur (la première exécution télécharge Python, ensuite tout fonctionne hors ligne), ou modifiez une valeur et appuyez sur **▶**.',
    sections: [
      ['Mesures et ajustement par les moindres carrés', 'La tension aux bornes d’une résistance est mesurée pour dix intensités ; la loi d’Ohm $U = RI$ donne la résistance comme pente de la droite ajustée.'],
      ['Oscillations amorties', 'La réponse libre $x(t) = x_0\\,e^{-\\zeta\\omega_0 t}\\cos(\\omega_d t)$ pour trois facteurs d’amortissement $\\zeta$.'],
      ['Réponse en fréquence', 'Un filtre passe-bas du premier ordre, $\\underline{H} = \\dfrac{1}{1 + j f/f_c}$ : gain et phase sur une échelle de fréquences logarithmique.'],
      ['Statistique de mesures répétées', 'La dispersion de 200 mesures de $g$, leur moyenne, leur écart-type $s$ et l’incertitude-type $u = s/\\sqrt{n}$.'],
      ['Une carte de champ', 'Les équipotentielles de deux charges opposées.'],
      ['Calcul formel', 'SymPy résout exactement l’équation différentielle d’un circuit RC, $RC\\,\\dfrac{du}{dt} + u = E$.'],
    ],
    outro: 'Les variables sont partagées entre les cellules, comme dans un notebook : `rng` et `np`, définis dans la première cellule, servent aux suivantes.',
  },
};

interface CellOutput {
  cell: string;
  text: string;
  figures: string[];
}

const fence = (body: string, info: string): string => {
  const ticks = '`'.repeat(Math.max(3, ...[...body.matchAll(/`+/g)].map((m) => m[0].length + 1)));
  return `${ticks}${info}\n${body.replace(/\n$/, '')}\n${ticks}`;
};

/** The example as Markdown, cells followed by their stored output (CODE-006). */
export function labMarkdown(lang: TemplateLang): string {
  const T = TEXTS[lang];
  const cells = (outputs as Record<TemplateLang, CellOutput[]>)[lang];
  const parts = [`---\ntitle: ${T.title}\n---`, `# ${T.title}`, T.intro];
  cells.forEach((out, i) => {
    const [heading, text] = T.sections[i] ?? [out.cell, ''];
    const code = CODE[`./lab/${lang}/${out.cell}`];
    if (code === undefined) throw new Error(`missing cell ${lang}/${out.cell}`);
    parts.push(`## ${heading}`, text, fence(code, 'python {run}'));
    if (out.text) parts.push(fence(out.text, 'text {output}'));
    const figures = out.figures.map((name) => FIGURES[`./lab/figures/${name}`]).filter((uri): uri is string => !!uri);
    if (figures.length) parts.push(figures.map((uri) => `![Output](${uri} "output")`).join(' '));
  });
  parts.push(T.outro);
  return `${parts.join('\n\n')}\n`;
}
