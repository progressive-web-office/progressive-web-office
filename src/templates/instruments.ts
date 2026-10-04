/**
 * The instrument panel examples (CODE-016, FILE-018): the anywidget
 * instruments installed from their published wheels, one example per family —
 * industrial (process), automation (control loop, state machine), aeronautics
 * (the basic six) and automotive (cluster) — reactive controls (`pwo.ui`)
 * driving indicators, as in their marimo galleries.
 */
import type { TemplateLang } from './content';
import { SLIDER_ESM } from './widgets';

const SITE = 'https://anywidgetinstruments.github.io';
/** The wheels published with the instruments' demos (the core first). */
export const INSTRUMENTS_WHEELS = `${SITE}/anywidget-instruments-industrial/marimo/gallery/public/wheel.txt`;
export const AERONAUTICS_WHEELS = `${SITE}/anywidget-instruments-aeronautics/marimo/flight/public/wheels.txt`;
export const AUTOMOTIVE_WHEELS = `${SITE}/anywidget-instruments-automotive/marimo/dials/public/wheels.txt`;

const fence = (body: string, info: string): string => `\`\`\`${info}\n${body.trim()}\n\`\`\``;
const q = (s: string): string => JSON.stringify(s);
const run = (code: string): string => fence(code, 'python {run}');
const install = (wheels: string): string => `import pwo

await pwo.install(${q(wheels)})`;

/** The four examples, named in each so that one leads to the others. */
const SERIES: Record<TemplateLang, string> = {
  en: 'The same instruments in the other examples: *Instrument panel* (industrial process), *Automation panel* (control loop and state machine), *Flight instruments* and *Car dashboard*.',
  fr: 'Les mêmes instruments dans les autres exemples : *Tableau de bord d’instruments* (procédé industriel), *Pupitre d’automatisme* (boucle de régulation et machine d’états), *Instruments de vol* et *Tableau de bord automobile*.',
};

const PRESS: Record<TemplateLang, string> = {
  en: 'Press **⏩**: the first cell downloads the instruments (you are asked first; they are then kept for offline use), the next ones show the panel.',
  fr: 'Appuyez sur **⏩** : la première cellule télécharge les instruments (votre accord est demandé ; ils sont ensuite gardés pour le hors-ligne), les suivantes affichent le tableau.',
};

const INSTALL: Record<TemplateLang, [heading: string, text: string]> = {
  en: ['Installing the instruments', 'The instruments are not on the Python package index yet: they are installed from the wheels published with their demos.'],
  fr: ['Installer les instruments', 'Les instruments ne sont pas encore sur l’index des paquets Python : ils sont installés depuis les wheels publiées avec leurs démos.'],
};

const SAFETY: Record<TemplateLang, string> = {
  en: 'These widgets are for visualization, teaching and simulation: they are not certified instruments and must never control real equipment, a vehicle or an aircraft. Saving or printing keeps a picture of each one.',
  fr: 'Ces widgets servent à la visualisation, à l’enseignement et à la simulation : ce ne sont pas des instruments certifiés et ils ne doivent jamais commander un équipement réel, un véhicule ou un aéronef. Enregistrer ou imprimer garde une image de chacun.',
};

/** A slider and a grid for the families without controls of their own (no download). */
const SLIDER_AND_GRID = `import anywidget
import ipywidgets
import traitlets


class Slider(anywidget.AnyWidget):
    _esm = """
${SLIDER_ESM}
"""
    value = traitlets.Float(1).tag(sync=True)
    min = traitlets.Float(0).tag(sync=True)
    max = traitlets.Float(10).tag(sync=True)
    step = traitlets.Float(0.5).tag(sync=True)
    label = traitlets.Unicode("").tag(sync=True)


class Grid(ipywidgets.GridBox):
    # A short text for the grid: some instruments have no \`value\` to show in it.
    def __repr__(self):
        return f"<Grid of {len(self.children)} widgets>"


def grid(children, columns=3):
    """Widgets side by side, \`columns\` per row."""
    return Grid(
        list(children),
        layout=ipywidgets.Layout(grid_template_columns=f"repeat({columns}, max-content)", grid_gap="12px"),
    )`;

const page = (parts: string[]): string => `${parts.join('\n\n')}\n`;

// --- industrial --------------------------------------------------------------------

interface IndustrialTexts {
  title: string;
  intro: string;
  controls: [heading: string, text: string];
  indicators: [heading: string, text: string];
  process: [heading: string, text: string];
  labels: { setpoint: string; gain: string; run: string; level: string; output: string; temperature: string; running: string; display: string; pump: string; valve: string; mixer: string; high: string; low: string };
}

const INDUSTRIAL: Record<TemplateLang, IndustrialTexts> = {
  en: {
    title: 'Instrument panel',
    intro: 'Knobs, switches and indicators from the [anywidget instruments](https://anywidgetinstruments.github.io/) (industrial). Turn the knobs and flip the switch: the indicators and the process line follow.',
    controls: ['Controls', '`pwo.ui(...)` makes each control reactive: when you change it, the cells using it run again.'],
    indicators: ['Indicators', 'This cell uses the three controls: it runs again, and redraws the indicators, when one of them changes.'],
    process: ['Process line', 'A pump, a valve and a mixer with their tags, and a stack light: red when the tank is high, amber blinking when it is low, green while running.'],
    labels: { setpoint: 'Setpoint', gain: 'Gain', run: 'Run', level: 'Level', output: 'Output', temperature: 'Temperature', running: 'Running', display: 'Display', pump: 'Feed pump', valve: 'Outlet valve', mixer: 'Mixer', high: 'High', low: 'Low' },
  },
  fr: {
    title: 'Tableau de bord d’instruments',
    intro: 'Boutons rotatifs, interrupteurs et indicateurs des [anywidget instruments](https://anywidgetinstruments.github.io/) (industriels). Tournez les boutons et basculez l’interrupteur : les indicateurs et la ligne de procédé suivent.',
    controls: ['Commandes', '`pwo.ui(...)` rend chaque commande réactive : quand vous la changez, les cellules qui l’utilisent s’exécutent à nouveau.'],
    indicators: ['Indicateurs', 'Cette cellule utilise les trois commandes : elle se relance, et redessine les indicateurs, quand l’une d’elles change.'],
    process: ['Ligne de procédé', 'Une pompe, une vanne et un agitateur avec leurs repères, et une colonne lumineuse : rouge quand la cuve est haute, orange clignotant quand elle est basse, verte en marche.'],
    labels: { setpoint: 'Consigne', gain: 'Gain', run: 'Marche', level: 'Niveau', output: 'Sortie', temperature: 'Température', running: 'En marche', display: 'Affichage', pump: 'Pompe d’alimentation', valve: 'Vanne de sortie', mixer: 'Agitateur', high: 'Haut', low: 'Bas' },
  },
};

export function instrumentsMarkdown(lang: TemplateLang): string {
  const T = INDUSTRIAL[lang];
  const L = T.labels;
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
  const process = `pumping = run.value and level < 95
ai.Panel(
    [
        ai.Pump(value="running" if pumping else "stopped", tag="P-101", label=${q(L.pump)}),
        ai.Valve(value="open" if level > 20 else "closed", tag="XV-102", label=${q(L.valve)}),
        ai.Motor(value="forward" if pumping else "stopped", tag="M-103", label=${q(L.mixer)}),
        ai.StackLight(
            value=["on" if level >= 90 else "off", "blink" if level <= 10 else "off", "on" if run.value else "off"],
            labels=[${q(L.high)}, ${q(L.low)}, ${q(L.run)}],
        ),
    ],
    columns=4,
)`;
  return page([
    `# ${T.title}`,
    `${T.intro} ${PRESS[lang]}`,
    `## ${INSTALL[lang][0]}`,
    INSTALL[lang][1],
    run(install(INSTRUMENTS_WHEELS)),
    `## ${T.controls[0]}`,
    T.controls[1],
    run(controls),
    `## ${T.indicators[0]}`,
    T.indicators[1],
    run(indicators),
    `## ${T.process[0]}`,
    T.process[1],
    run(process),
    SERIES[lang],
    SAFETY[lang],
  ]);
}

// --- automation --------------------------------------------------------------------

interface AutomationTexts {
  title: string;
  intro: string;
  tuning: [heading: string, text: string];
  response: [heading: string, text: string];
  machine: [heading: string, text: string];
  labels: { response: string; overshoot: string; mode: string; fault: string; wait: string; run: string };
}

const AUTOMATION: Record<TemplateLang, AutomationTexts> = {
  en: {
    title: 'Automation panel',
    intro: 'A temperature control loop and a machine following the PackML states, with the [anywidget instruments](https://anywidgetinstruments.github.io/) (industrial): tune the PID controller with the knobs, then drive the machine by clicking its commands.',
    tuning: ['Tuning the controller', 'The gain `Kp`, the integral time `Ti` and the derivative time `Td` of a PID controller; each knob is reactive.'],
    response: [
      'Step response',
      'The loop is simulated here, in Python: a first-order process with a dead time, its setpoint stepping from 20 to 50 °C at 10 s. The chart shows the setpoint (SP), the measure (PV) and the output (OP); the faceplate the last values; the indicator the overshoot. Change a knob: the cell runs again.',
    ],
    machine: [
      'State machine',
      'The PackML states (ISA-TR88.00.02): click the commands offered (Reset, then Start…). In AUTO the acting states (Starting, Holding…) end by themselves; in HAND they wait. The stack light follows: red stopped, amber waiting (blinking while acting), green producing.',
    ],
    labels: { response: 'Step response', overshoot: 'Overshoot', mode: 'Mode', fault: 'Stopped', wait: 'Waiting', run: 'Producing' },
  },
  fr: {
    title: 'Pupitre d’automatisme',
    intro: 'Une boucle de régulation de température et une machine qui suit les états PackML, avec les [anywidget instruments](https://anywidgetinstruments.github.io/) (industriels) : réglez le régulateur PID avec les boutons, puis pilotez la machine en cliquant sur ses commandes.',
    tuning: ['Régler le régulateur', 'Le gain `Kp`, le temps intégral `Ti` et le temps dérivé `Td` d’un régulateur PID ; chaque bouton est réactif.'],
    response: [
      'Réponse indicielle',
      'La boucle est simulée ici, en Python : un procédé du premier ordre avec un retard pur, sa consigne passant de 20 à 50 °C à 10 s. Le graphe montre la consigne (SP), la mesure (PV) et la sortie (OP) ; la face avant les dernières valeurs ; l’indicateur le dépassement. Changez un bouton : la cellule se relance.',
    ],
    machine: [
      'Machine d’états',
      'Les états PackML (ISA-TR88.00.02) : cliquez sur les commandes proposées (Reset, puis Start…). En AUTO les états actifs (Starting, Holding…) se terminent d’eux-mêmes ; en HAND ils attendent. La colonne lumineuse suit : rouge à l’arrêt, orange en attente (clignotant pendant une action), verte en production.',
    ],
    labels: { response: 'Réponse indicielle', overshoot: 'Dépassement', mode: 'Mode', fault: 'Arrêt', wait: 'Attente', run: 'Production' },
  },
};

export function automationMarkdown(lang: TemplateLang): string {
  const T = AUTOMATION[lang];
  const L = T.labels;
  const tuning = `import anywidget_instruments_industrial as ai

kp = pwo.ui(ai.Knob(1.2, min=0, max=5, step=0.05, label="Kp"))
ti = pwo.ui(ai.Knob(20, min=1, max=100, step=1, unit="s", label="Ti"))
td = pwo.ui(ai.Knob(0, min=0, max=20, step=0.5, unit="s", label="Td"))
ai.Panel([kp, ti, td], columns=3)`;
  const response = `def closed_loop(kp, ti, td, gain=2.0, tau=20.0, delay=4.0, dt=0.2, duration=200.0):
    """Setpoint, measure and output at each step of the simulated loop."""
    pid = ai.PID(kp=kp, ti=ti, td=td, sp=20.0, output=10.0)
    pipe = [10.0] * int(delay / dt)  # the dead time
    y = 20.0
    rows = []
    for k in range(int(duration / dt)):
        pid.sp = 50.0 if k * dt >= 10.0 else 20.0
        u = pid.step(y, dt)
        pipe.append(u)
        y += dt / tau * (-y + gain * pipe.pop(0))
        rows.append((pid.sp, y, u))
    return rows


rows = closed_loop(kp.value, ti.value, td.value)
chart = ai.WaveformChart(
    n_traces=3, history=len(rows), dt=0.2, x_unit="s", y_min=0, y_max=100,
    traces=[{"name": "SP"}, {"name": "PV"}, {"name": "OP"}], label=${q(L.response)}, size=(560, 240),
)
chart.append(rows)
overshoot = max(0.0, (max(r[1] for r in rows[50:]) - 50.0) / 30.0 * 100.0)
sp, pv, op = rows[-1]
ai.Panel(
    [
        chart,
        ai.PIDFaceplate(tag="TIC-101", unit="°C", sp=sp, pv=pv, op=op),
        ai.AnalogIndicator(overshoot, max=50, unit="%", normal_hi=10, hi=20, label=${q(L.overshoot)}),
    ],
    columns=3,
)`;
  const machine = `machine = ai.StateMachine("packml", label="PackML")
light = ai.StackLight(labels=[${q(L.fault)}, ${q(L.wait)}, ${q(L.run)}])
mode = ai.SelectorSwitch("AUTO", positions=["HAND", "OFF", "AUTO"], label=${q(L.mode)})


def follow(change=None):
    """The stack light follows the state; in AUTO the acting states end by themselves."""
    if machine.is_acting and mode.value == "AUTO":
        machine.state_complete()
        return
    state = machine.value
    light.value = [
        "on" if state in ("Stopped", "Aborted") else "off",
        "blink" if machine.is_acting else "on" if state in ("Idle", "Held", "Suspended", "Complete") else "off",
        "on" if state == "Execute" else "off",
    ]


machine.observe(follow, names="value")
mode.observe(follow, names="value")
follow()
ai.Panel([machine, ai.Panel([mode, light], columns=1)], columns=2)`;
  return page([
    `# ${T.title}`,
    `${T.intro} ${PRESS[lang]}`,
    `## ${INSTALL[lang][0]}`,
    INSTALL[lang][1],
    run(install(INSTRUMENTS_WHEELS)),
    `## ${T.tuning[0]}`,
    T.tuning[1],
    run(tuning),
    `## ${T.response[0]}`,
    T.response[1],
    run(response),
    `## ${T.machine[0]}`,
    T.machine[1],
    run(machine),
    SERIES[lang],
    SAFETY[lang],
  ]);
}

// --- aeronautics -------------------------------------------------------------------

interface AeronauticsTexts {
  title: string;
  intro: string;
  controls: [heading: string, text: string];
  panel: [heading: string, text: string];
  labels: { speed: string; altitude: string; vs: string; heading: string; bank: string; pitch: string; slip: string; asi: string; attitude: string; alt: string; turn: string; hdg: string; vsi: string };
}

const AERONAUTICS: Record<TemplateLang, AeronauticsTexts> = {
  en: {
    title: 'Flight instruments',
    intro: 'The basic six of a light aircraft, in the basic T, from the [anywidget instruments](https://anywidgetinstruments.github.io/) (aeronautics). Set the flight with the sliders: the instruments follow, the turn coordinator showing the rate of turn that the bank gives at that airspeed.',
    controls: ['The flight', 'Sliders written in Python (anywidget, no download), made reactive with `pwo.ui(...)`.'],
    panel: ['The basic T', 'Airspeed, attitude and altitude above; turn, heading and vertical speed below. The rate of turn of a coordinated turn is g·tan(bank)/V.'],
    labels: { speed: 'Airspeed (kt)', altitude: 'Altitude (ft)', vs: 'Vertical speed (ft/min)', heading: 'Heading (°)', bank: 'Bank (°, right +)', pitch: 'Pitch (°, nose up +)', slip: 'Slip', asi: 'Airspeed', attitude: 'Attitude', alt: 'Altitude', turn: 'Turn', hdg: 'Heading', vsi: 'Vertical speed' },
  },
  fr: {
    title: 'Instruments de vol',
    intro: 'Les six instruments de base d’un avion léger, en T, des [anywidget instruments](https://anywidgetinstruments.github.io/) (aéronautique). Réglez le vol avec les curseurs : les instruments suivent, l’indicateur de virage montrant le taux de virage que donne l’inclinaison à cette vitesse.',
    controls: ['Le vol', 'Des curseurs écrits en Python (anywidget, sans téléchargement), rendus réactifs avec `pwo.ui(...)`.'],
    panel: ['Le T de base', 'Anémomètre, horizon artificiel et altimètre en haut ; indicateur de virage, conservateur de cap et variomètre en bas. Le taux d’un virage coordonné vaut g·tan(inclinaison)/V.'],
    labels: { speed: 'Vitesse (kt)', altitude: 'Altitude (ft)', vs: 'Vitesse verticale (ft/min)', heading: 'Cap (°)', bank: 'Inclinaison (°, droite +)', pitch: 'Assiette (°, cabré +)', slip: 'Dérapage', asi: 'Vitesse', attitude: 'Assiette', alt: 'Altitude', turn: 'Virage', hdg: 'Cap', vsi: 'Variomètre' },
  },
};

export function aeronauticsMarkdown(lang: TemplateLang): string {
  const T = AERONAUTICS[lang];
  const L = T.labels;
  const controls = `${SLIDER_AND_GRID}


speed = pwo.ui(Slider(value=105, min=40, max=180, step=1, label=${q(L.speed)}))
altitude = pwo.ui(Slider(value=3500, min=0, max=12000, step=50, label=${q(L.altitude)}))
vs = pwo.ui(Slider(value=300, min=-2000, max=2000, step=50, label=${q(L.vs)}))
heading = pwo.ui(Slider(value=275, min=0, max=359, step=1, label=${q(L.heading)}))
bank = pwo.ui(Slider(value=-15, min=-45, max=45, step=1, label=${q(L.bank)}))
pitch = pwo.ui(Slider(value=5, min=-20, max=20, step=0.5, label=${q(L.pitch)}))
slip = pwo.ui(Slider(value=0, min=-1, max=1, step=0.05, label=${q(L.slip)}))
grid([speed, altitude, vs, heading, bank, pitch, slip], columns=2)`;
  const panel = `import math
import anywidget_instruments_aeronautics as aw

rate = math.degrees(9.80665 * math.tan(math.radians(bank.value)) / (speed.value * 1852 / 3600))
grid(
    [
        aw.AirspeedIndicator(
            value=speed.value, white_arc=[45, 85], green_arc=[55, 130], yellow_arc=[130, 163], vne=163, label=${q(L.asi)}
        ),
        aw.AttitudeIndicator(pitch=pitch.value, roll=bank.value, label=${q(L.attitude)}),
        aw.Altimeter(value=altitude.value, pressure=1013, label=${q(L.alt)}),
        aw.TurnCoordinator(rate=rate, slip=slip.value, label=${q(L.turn)}),
        aw.HeadingIndicator(value=heading.value, bug=300, label=${q(L.hdg)}),
        aw.VerticalSpeedIndicator(value=vs.value, label=${q(L.vsi)}),
    ],
    columns=3,
)`;
  return page([
    `# ${T.title}`,
    `${T.intro} ${PRESS[lang]}`,
    `## ${INSTALL[lang][0]}`,
    INSTALL[lang][1],
    run(install(AERONAUTICS_WHEELS)),
    `## ${T.controls[0]}`,
    T.controls[1],
    run(controls),
    `## ${T.panel[0]}`,
    T.panel[1],
    run(panel),
    SERIES[lang],
    SAFETY[lang],
  ]);
}

// --- automotive --------------------------------------------------------------------

interface AutomotiveTexts {
  title: string;
  intro: string;
  controls: [heading: string, text: string];
  panel: [heading: string, text: string];
  labels: { speed: string; limit: string; rpm: string; fuel: string; coolant: string; warnings: string };
}

const AUTOMOTIVE: Record<TemplateLang, AutomotiveTexts> = {
  en: {
    title: 'Car dashboard',
    intro: 'The instrument cluster of a car from the [anywidget instruments](https://anywidgetinstruments.github.io/) (automotive): speedometer with its limit, rev counter with its red line, gear, fuel and coolant gauges, odometer and tell-tales.',
    controls: ['Driving', 'Sliders written in Python (anywidget, no download), made reactive with `pwo.ui(...)`.'],
    panel: ['The cluster', 'The gear follows the speed, an arrow suggests changing up above 3000 rpm, and the tell-tales light up: low fuel under 12 %, coolant too hot over 110 °C (blinking over 120 °C), cruise control near the limit.'],
    labels: { speed: 'Speed (km/h)', limit: 'Limit (km/h)', rpm: 'Engine speed (rpm)', fuel: 'Fuel (%)', coolant: 'Coolant (°C)', warnings: 'Warnings' },
  },
  fr: {
    title: 'Tableau de bord automobile',
    intro: 'Le combiné d’instruments d’une voiture, des [anywidget instruments](https://anywidgetinstruments.github.io/) (automobile) : compteur de vitesse avec sa limite, compte-tours avec sa zone rouge, rapport engagé, jauges de carburant et de température, compteur kilométrique et voyants.',
    controls: ['La conduite', 'Des curseurs écrits en Python (anywidget, sans téléchargement), rendus réactifs avec `pwo.ui(...)`.'],
    panel: ['Le combiné', 'Le rapport suit la vitesse, une flèche conseille de monter au-dessus de 3000 tr/min, et les voyants s’allument : réserve sous 12 %, surchauffe au-dessus de 110 °C (clignotant au-dessus de 120 °C), régulateur près de la limite.'],
    labels: { speed: 'Vitesse (km/h)', limit: 'Limite (km/h)', rpm: 'Régime (tr/min)', fuel: 'Carburant (%)', coolant: 'Liquide de refroidissement (°C)', warnings: 'Voyants' },
  },
};

export function automotiveMarkdown(lang: TemplateLang): string {
  const T = AUTOMOTIVE[lang];
  const L = T.labels;
  const controls = `${SLIDER_AND_GRID}


speed = pwo.ui(Slider(value=87, min=0, max=240, step=1, label=${q(L.speed)}))
limit = pwo.ui(Slider(value=90, min=30, max=130, step=10, label=${q(L.limit)}))
rpm = pwo.ui(Slider(value=2600, min=0, max=7500, step=50, label=${q(L.rpm)}))
fuel = pwo.ui(Slider(value=38, min=0, max=100, step=1, label=${q(L.fuel)}))
coolant = pwo.ui(Slider(value=90, min=30, max=135, step=1, label=${q(L.coolant)}))
grid([speed, limit, rpm, fuel, coolant], columns=2)`;
  const panel = `import anywidget_instruments_automotive as aa

gear = "N" if speed.value < 1 else str(1 + sum(speed.value >= v for v in (15, 30, 50, 70, 90)))
warnings = [
    ("low_fuel", "on" if fuel.value < 12 else "off"),
    ("coolant_temperature", "blinking" if coolant.value > 120 else "on" if coolant.value > 110 else "off"),
    ("low_beam", "on"),
    ("cruise_control", "on" if speed.value >= 30 and abs(speed.value - limit.value) < 5 else "off"),
]
grid(
    [
        aa.Speedometer(speed.value, limit=limit.value),
        aa.Tachometer(rpm.value, redline=6200, shift_light=5800),
        aa.GearIndicator(gear, suggestion="up" if rpm.value > 3000 and gear not in ("N", "6") else ""),
        aa.FuelGauge(fuel.value, filler_side="right"),
        aa.TemperatureGauge(coolant.value),
        aa.Odometer(48165.4, trip=123.4),
        aa.TellTaleCluster(warnings, size=(48, 48), label=${q(L.warnings)}),
    ],
    columns=3,
)`;
  return page([
    `# ${T.title}`,
    `${T.intro} ${PRESS[lang]}`,
    `## ${INSTALL[lang][0]}`,
    INSTALL[lang][1],
    run(install(AUTOMOTIVE_WHEELS)),
    `## ${T.controls[0]}`,
    T.controls[1],
    run(controls),
    `## ${T.panel[0]}`,
    T.panel[1],
    run(panel),
    SERIES[lang],
    SAFETY[lang],
  ]);
}
