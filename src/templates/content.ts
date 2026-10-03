/**
 * Content of the built-in templates (FILE-018), in English and French. Text
 * documents are Markdown read by the Markdown reader, so they use the same
 * features as any file: front matter, header and footer, page numbering,
 * captions, cross-references, citations, equations, diagrams, code cells.
 */

export type TemplateLang = 'en' | 'fr';

export interface DocumentTexts {
  letter: string;
  report: string;
  minutes: string;
  exercises: string;
  tour: string;
  article: string;
  newspaper: string;
}

const EN: DocumentTexts = {
  letter: `---
title: Letter
---

Jane Smith\\
12 Garden Street\\
Springfield SP1 2AB\\
jane.smith@example.org

{date}

Mr John Doe\\
Head of Admissions\\
University of Capital City\\
1 University Avenue\\
Capital City CC1 1AA

**Subject: application for the master's programme in applied physics**

Dear Mr Doe,

I am writing to apply for the master's programme in applied physics starting next September.

Replace this paragraph with the body of your letter: why you write, what you expect, and what you enclose.

Thank you for your attention. I look forward to hearing from you.

Yours sincerely,

Jane Smith

Enclosures: CV, transcripts
`,

  report: `---
title: Project report
author: SURNAME First name
date: {date}
header-left: "{title}"
footer-center: "Page {page} of {pages}"
first-page-hidden: true
---

# Project report

**Team:**

- SURNAME1 First name1
- SURNAME2 First name2
- SURNAME3 First name3

**Supervisor:** SURNAME First name · **Date:** {date}

[TOC]

\\newpage

## Introduction

State the problem, the context and the goal of the project in a few paragraphs. End with the plan of the report.

## Method

Describe what you did and why: equipment, data, steps. Keep enough detail for someone else to reproduce it.

## Results

[Table 1](#tab-results) sums up the measurements.

| Test | Expected | Measured | Gap |
|---|---|---|---|
| 1 | 10.0 | 9.8 | 2 % |
| 2 | 20.0 | 20.3 | 1.5 % |
| 3 | 30.0 | 29.1 | 3 % |

<a id="tab-results"></a>Table 1: Measurements of the three tests

## Discussion

Compare the results with what was expected, explain the gaps, and list the limits of the work.

## Conclusion

Answer the question asked in the introduction, then give the next steps.
`,

  minutes: `---
title: Meeting minutes
footer-center: "{page}/{pages}"
---

# Meeting minutes

**Date:** {date} · **Place:** room / online · **Chair:** First name SURNAME · **Minutes:** First name SURNAME

**Present:** First name SURNAME, First name SURNAME
**Apologies:** First name SURNAME

## Agenda

1. Approval of the previous minutes
2. Progress report
3. Next steps
4. Any other business

## Discussion

### 1. Approval of the previous minutes

The minutes of the previous meeting are approved.

### 2. Progress report

Summary of what was said. One paragraph per topic.

### 3. Next steps

Decisions taken.

## Actions

| Action | Who | By |
|---|---|---|
| Send the updated plan | First name SURNAME | date |
| Book the room | First name SURNAME | date |

**Next meeting:** date and place.
`,

  exercises: `---
title: Exercise sheet
header-left: "Mathematics"
header-right: "SURNAME First name: ………………"
footer-center: "{page}"
---

# Exercise sheet: derivatives

**Class:** ……… · **Date:** {date} · **Time:** 1 hour

## Exercise 1

Compute the derivative of each function.

1. $f(x) = 3x^2 - 5x + 2$
2. $g(x) = \\sqrt{x}$
3. $h(x) = \\dfrac{1}{x^2 + 1}$

## Exercise 2

A ball thrown upwards is at height $y(t) = v_0 t - \\frac{1}{2} g t^2$, with $v_0 = 12~\\mathrm{m/s}$ and $g = 9.81~\\mathrm{m/s^2}$.

1. Find the speed $v(t) = y'(t)$.
2. When does the ball reach its highest point? What is its height then?

## Exercise 3

Study the variations of $f(x) = x^3 - 3x$ on $\\mathbb{R}$ and sketch its curve.
`,

  article: `---
title: Title of the article
author: SURNAME1 First name1; SURNAME2 First name2
keywords: first keyword, second keyword, third keyword
papersize: a4
geometry: "margin=25mm"
references:
- {"id":"knuth1984","type":"book","title":"The TeXbook","author":[{"family":"Knuth","given":"Donald E."}],"issued":{"date-parts":[[1984]]},"publisher":"Addison-Wesley"}
- {"id":"lamport1994","type":"book","title":"LaTeX: a document preparation system","author":[{"family":"Lamport","given":"Leslie"}],"issued":{"date-parts":[[1994]]},"publisher":"Addison-Wesley","edition":"2"}
---

# Title of the article

**SURNAME1 First name1**¹ · **SURNAME2 First name2**²

¹ Laboratory, University, City, Country · ² Laboratory, University, City, Country\\
*Corresponding author:* first.surname@example.org

**Abstract.** In 150 to 250 words: the question, what was done, the main results and what they mean. The abstract is read alone: no citation, no abbreviation left unexplained.

**Keywords:** first keyword, second keyword, third keyword

## Introduction

Set the context and what is already known, citing the sources that matter [@knuth1984]. State the question the article answers, then its plan.

## Materials and methods

Describe the data, the equipment and the steps precisely enough to be reproduced. The model is given by Equation [(1)](#eq-model):

$$
y(t) = y_\\infty \\left(1 - e^{-t/\\tau}\\right) \\tag{1}\\label{eq-model}
$$

where $\\tau$ is the time constant and $y_\\infty$ the final value.

## Results

[Table 1](#tab-results) gives the values measured for each sample.

| Sample | $\\tau$ (s) | $y_\\infty$ | $R^2$ |
|---|---|---|---|
| A | 1.20 | 4.98 | 0.998 |
| B | 1.35 | 5.02 | 0.996 |
| C | 1.18 | 4.95 | 0.999 |

<a id="tab-results"></a>Table 1: Parameters fitted for each sample

## Discussion

Interpret the results, compare them with earlier work [@lamport1994], and state the limits of the study.

## Conclusion

Answer the question of the introduction in a few sentences, and give the next steps.

## Acknowledgements

Funding, help received, data or software used.

<div id="refs"></div>
`,
  newspaper: `---
title: The School Gazette
papersize: a4
geometry: "margin=15mm"
footer-center: "The School Gazette · {page}"
---

# The School Gazette

[Issue 12 · {date} · Free]{.smallcaps}

---

## The garden club harvests its first pumpkins

::: {.columns count=3 gap=14 rule}
**After a whole season of work,** the pupils of the garden club picked forty-two pumpkins on Friday. The largest weighs eleven kilos: it will be shown at the entrance hall until the holidays.

The club meets every Tuesday at lunchtime. Anyone may join: no experience is needed, only a pair of boots.

"We learnt that a pumpkin drinks a lot," says Léa, in year 7. The club now plans a rainwater tank, paid for by the sale of soup at the autumn fair.

\\columnbreak

## In brief

**Library.** New comics have arrived; the library is open every day from 12:30.

**Sports day.** The cross-country race takes place on the 14th. Parents are welcome along the course.

**Lost and found.** Forty-three water bottles are waiting for their owners at the reception desk.

## Agenda

- **Mon.** Chess club, room 104
- **Wed.** Choir rehearsal
- **Fri.** Film club: *The Kid*
:::

---

::: {.columns count=2 gap=18}
## Interview: the new cook

Since September, the canteen serves a vegetarian dish every day. We asked the new cook how the menus are chosen, and what the most popular dish is so far — the answer may surprise you.

Write your questions for the next interview and leave them in the box by the library door.

## Puzzle of the week

What has a neck but no head, and wears a cap? *Answer in the next issue.*
:::
`,
  tour: `---
title: A tour of Progressive Web Office
author: Progressive Web Office
footer-center: "- {page} -"
references:
- {"id":"knuth1984","type":"article-journal","title":"Literate programming","author":[{"family":"Knuth","given":"Donald E."}],"issued":{"date-parts":[[1984]]},"container-title":"The Computer Journal","volume":"27","issue":"2","page":"97-111"}
- {"id":"shapiro2011","type":"paper-conference","title":"Conflict-free replicated data types","author":[{"family":"Shapiro","given":"Marc"},{"family":"Preguiça","given":"Nuno"}],"issued":{"date-parts":[[2011]]},"container-title":"Stabilization, Safety, and Security of Distributed Systems"}
---

# A tour of Progressive Web Office

This example shows what a text document can hold. Everything stays editable: click anywhere and change it, then save it as OpenDocument, Word, Markdown or LaTeX.

[TOC]

## Text and formatting

Text can be **bold**, *italic*, ~~struck~~, \`code\`, or a [link](https://github.com/s-celles/progressive-web-office). Footnotes are numbered automatically.[^1]

- Bulleted lists
  - with levels
- and numbered ones:

1. first
2. second

> A quotation stands out from the text.

## Equations

Inline, like $e^{i\\pi} + 1 = 0$, or displayed and numbered, like [Equation (1)](#eq-gauss):

$$
\\int_{-\\infty}^{+\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi} \\tag{1}\\label{eq-gauss}
$$

Type \`$\` then LaTeX, or use the equation editor (∑).

## Tables and captions

| Format | Opens | Saves |
|---|---|---|
| OpenDocument | yes | yes |
| Word | yes | yes |
| LaTeX | yes | yes |

<a id="tab-formats"></a>Table 1: Some of the supported formats

Captions are numbered, and references to them, like [Table 1](#tab-formats), follow when tables move.

## Diagrams

\`\`\`mermaid
flowchart LR
  A[Write] --> B[Save]
  B --> C{Share}
  C -->|QR codes| D[Another device]
  C -->|Link| E[Read-only copy]
\`\`\`

## Code cells

Code runs in a sandbox, without network access. Press ▶ to run it.

\`\`\`python {run}
squares = [n * n for n in range(1, 11)]
print(sum(squares))
\`\`\`

## Citations

Sources are kept with the document, here as BibTeX-like entries [@knuth1984; @shapiro2011]. The list of references below is built from the citations.

<div id="refs"></div>

[^1]: Like this one.
`,
};

const FR: DocumentTexts = {
  letter: `---
title: Lettre
---

Jeanne MARTIN\\
12 rue des Jardins\\
75011 Paris\\
06 12 34 56 78\\
jeanne.martin@example.org

Monsieur Jean DUPONT\\
Responsable des admissions\\
Université de Lyon\\
1 avenue de l’Université\\
69000 Lyon

Paris, le {date}

**Objet : candidature au master de physique appliquée**\\
**P. J. :** curriculum vitæ, relevés de notes

Monsieur,

Je vous adresse ma candidature au master de physique appliquée qui débute en septembre prochain.

Remplacez ce paragraphe par le corps de votre lettre : la raison de votre courrier, ce que vous attendez et les pièces jointes.

Je vous remercie de l’attention portée à ma demande et me tiens à votre disposition pour tout complément.

Je vous prie d’agréer, Monsieur, l’expression de mes salutations distinguées.

Jeanne MARTIN
`,

  report: `---
title: Rapport de projet
author: NOM Prénom
date: {date}
header-left: "{title}"
footer-center: "Page {page} sur {pages}"
first-page-hidden: true
---

# Rapport de projet

**Équipe :**

- NOM1 Prénom1
- NOM2 Prénom2
- NOM3 Prénom3

**Encadrant :** NOM Prénom · **Date :** {date}

[TOC]

\\newpage

## Introduction

Présentez le problème, le contexte et l’objectif du projet en quelques paragraphes. Terminez par le plan du rapport.

## Méthode

Décrivez ce que vous avez fait et pourquoi : matériel, données, étapes. Donnez assez de détails pour qu’une autre personne puisse le refaire.

## Résultats

Le [Tableau 1](#tab-resultats) résume les mesures.

| Essai | Attendu | Mesuré | Écart |
|---|---|---|---|
| 1 | 10,0 | 9,8 | 2 % |
| 2 | 20,0 | 20,3 | 1,5 % |
| 3 | 30,0 | 29,1 | 3 % |

<a id="tab-resultats"></a>Tableau 1 : Mesures des trois essais

## Discussion

Comparez les résultats à ce qui était attendu, expliquez les écarts et indiquez les limites du travail.

## Conclusion

Répondez à la question posée en introduction, puis donnez les suites à envisager.
`,

  minutes: `---
title: Compte rendu de réunion
footer-center: "{page}/{pages}"
---

# Compte rendu de réunion

**Date :** {date} · **Lieu :** salle / en ligne · **Animation :** Prénom NOM · **Secrétaire :** Prénom NOM

**Présents :** Prénom NOM, Prénom NOM
**Excusés :** Prénom NOM

## Ordre du jour

1. Approbation du compte rendu précédent
2. Point d’avancement
3. Prochaines étapes
4. Questions diverses

## Échanges

### 1. Approbation du compte rendu précédent

Le compte rendu de la réunion précédente est approuvé.

### 2. Point d’avancement

Résumé des échanges, un paragraphe par sujet.

### 3. Prochaines étapes

Décisions prises.

## Actions

| Action | Qui | Échéance |
|---|---|---|
| Envoyer le planning mis à jour | Prénom NOM | date |
| Réserver la salle | Prénom NOM | date |

**Prochaine réunion :** date et lieu.
`,

  exercises: `---
title: Fiche d’exercices
header-left: "Mathématiques"
header-right: "NOM Prénom : ………………"
footer-center: "{page}"
---

# Fiche d’exercices : dérivées

**Classe :** ……… · **Date :** {date} · **Durée :** 1 heure

## Exercice 1

Calculer la dérivée de chaque fonction.

1. $f(x) = 3x^2 - 5x + 2$
2. $g(x) = \\sqrt{x}$
3. $h(x) = \\dfrac{1}{x^2 + 1}$

## Exercice 2

Une balle lancée vers le haut est à la hauteur $y(t) = v_0 t - \\frac{1}{2} g t^2$, avec $v_0 = 12~\\mathrm{m/s}$ et $g = 9{,}81~\\mathrm{m/s^2}$.

1. Déterminer la vitesse $v(t) = y'(t)$.
2. À quel instant la balle atteint-elle son point le plus haut ? À quelle hauteur ?

## Exercice 3

Étudier les variations de $f(x) = x^3 - 3x$ sur $\\mathbb{R}$ et tracer l’allure de sa courbe.
`,

  article: `---
title: Titre de l’article
author: NOM1 Prénom1 ; NOM2 Prénom2
keywords: premier mot-clé, deuxième mot-clé, troisième mot-clé
lang: fr
papersize: a4
geometry: "margin=25mm"
references:
- {"id":"knuth1984","type":"book","title":"The TeXbook","author":[{"family":"Knuth","given":"Donald E."}],"issued":{"date-parts":[[1984]]},"publisher":"Addison-Wesley"}
- {"id":"lamport1994","type":"book","title":"LaTeX: a document preparation system","author":[{"family":"Lamport","given":"Leslie"}],"issued":{"date-parts":[[1994]]},"publisher":"Addison-Wesley","edition":"2"}
---

# Titre de l’article

**NOM1 Prénom1**¹ · **NOM2 Prénom2**²

¹ Laboratoire, Université, Ville, Pays · ² Laboratoire, Université, Ville, Pays\\
*Auteur correspondant :* prenom.nom@example.org

**Résumé.** En 150 à 250 mots : la question, ce qui a été fait, les principaux résultats et leur portée. Le résumé se lit seul : ni citation, ni abréviation non expliquée.

**Mots-clés :** premier mot-clé, deuxième mot-clé, troisième mot-clé

## Introduction

Présentez le contexte et ce que l’on sait déjà, en citant les sources utiles [@knuth1984]. Énoncez la question à laquelle l’article répond, puis son plan.

## Matériels et méthodes

Décrivez les données, le matériel et les étapes assez précisément pour qu’on puisse les reproduire. Le modèle est donné par l’équation [(1)](#eq-model) :

$$
y(t) = y_\\infty \\left(1 - e^{-t/\\tau}\\right) \\tag{1}\\label{eq-model}
$$

où $\\tau$ est la constante de temps et $y_\\infty$ la valeur finale.

## Résultats

Le [Tableau 1](#tab-results) donne les valeurs mesurées pour chaque échantillon.

| Échantillon | $\\tau$ (s) | $y_\\infty$ | $R^2$ |
|---|---|---|---|
| A | 1,20 | 4,98 | 0,998 |
| B | 1,35 | 5,02 | 0,996 |
| C | 1,18 | 4,95 | 0,999 |

<a id="tab-results"></a>Tableau 1 : Paramètres ajustés pour chaque échantillon

## Discussion

Interprétez les résultats, comparez-les aux travaux antérieurs [@lamport1994] et précisez les limites de l’étude.

## Conclusion

Répondez en quelques phrases à la question de l’introduction, puis donnez les perspectives.

## Remerciements

Financements, aides reçues, données ou logiciels utilisés.

<div id="refs"></div>
`,
  newspaper: `---
title: La Gazette du collège
papersize: a4
geometry: "margin=15mm"
footer-center: "La Gazette du collège · {page}"
---

# La Gazette du collège

[Numéro 12 · {date} · Gratuit]{.smallcaps}

---

## Le club jardin récolte ses premières citrouilles

::: {.columns count=3 gap=14 rule}
**Après toute une saison de travail,** les élèves du club jardin ont cueilli quarante-deux citrouilles vendredi. La plus grosse pèse onze kilos : elle sera exposée dans le hall jusqu’aux vacances.

Le club se réunit chaque mardi à midi. Tout le monde peut venir : aucune expérience n’est demandée, seulement une paire de bottes.

« Nous avons appris qu’une citrouille boit beaucoup », raconte Léa, en sixième. Le club prévoit maintenant une cuve d’eau de pluie, payée par la vente de soupe à la fête d’automne.

\\columnbreak

## En bref

**CDI.** De nouvelles bandes dessinées sont arrivées ; le CDI est ouvert tous les jours dès 12 h 30.

**Cross.** Le cross du collège a lieu le 14. Les parents sont les bienvenus le long du parcours.

**Objets trouvés.** Quarante-trois gourdes attendent leurs propriétaires à l’accueil.

## Agenda

- **Lun.** Club d’échecs, salle 104
- **Mer.** Répétition de la chorale
- **Ven.** Ciné-club : *Le Kid*
:::

---

::: {.columns count=2 gap=18}
## Entretien : le nouveau cuisinier

Depuis septembre, la cantine sert chaque jour un plat végétarien. Nous avons demandé au nouveau cuisinier comment les menus sont choisis, et quel plat a le plus de succès — la réponse pourrait vous surprendre.

Écrivez vos questions pour le prochain entretien et déposez-les dans la boîte près de la porte du CDI.

## Devinette de la semaine

Qu’est-ce qui a un col mais pas de tête, et porte un bouchon ? *Réponse dans le prochain numéro.*
:::
`,
  tour: `---
title: Découverte de Progressive Web Office
author: Progressive Web Office
footer-center: "- {page} -"
references:
- {"id":"knuth1984","type":"article-journal","title":"Literate programming","author":[{"family":"Knuth","given":"Donald E."}],"issued":{"date-parts":[[1984]]},"container-title":"The Computer Journal","volume":"27","issue":"2","page":"97-111"}
- {"id":"shapiro2011","type":"paper-conference","title":"Conflict-free replicated data types","author":[{"family":"Shapiro","given":"Marc"},{"family":"Preguiça","given":"Nuno"}],"issued":{"date-parts":[[2011]]},"container-title":"Stabilization, Safety, and Security of Distributed Systems"}
---

# Découverte de Progressive Web Office

Cet exemple montre ce qu’un document texte peut contenir. Tout reste modifiable : cliquez n’importe où pour changer le texte, puis enregistrez en OpenDocument, Word, Markdown ou LaTeX.

[TOC]

## Texte et mise en forme

Le texte peut être en **gras**, en *italique*, ~~barré~~, en \`code\`, ou être un [lien](https://github.com/s-celles/progressive-web-office). Les notes de bas de page sont numérotées automatiquement.[^1]

- Listes à puces
  - avec des niveaux
- et listes numérotées :

1. premier
2. deuxième

> Une citation se détache du texte.

## Équations

Dans le texte, comme $e^{i\\pi} + 1 = 0$, ou centrées et numérotées, comme l’[Équation (1)](#eq-gauss) :

$$
\\int_{-\\infty}^{+\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi} \\tag{1}\\label{eq-gauss}
$$

Tapez \`$\` puis du LaTeX, ou utilisez l’éditeur d’équations (∑).

## Tableaux et légendes

| Format | Ouvre | Enregistre |
|---|---|---|
| OpenDocument | oui | oui |
| Word | oui | oui |
| LaTeX | oui | oui |

<a id="tab-formats"></a>Tableau 1 : Quelques formats pris en charge

Les légendes sont numérotées, et les renvois, comme au [Tableau 1](#tab-formats), suivent quand les tableaux changent de place.

## Diagrammes

\`\`\`mermaid
flowchart LR
  A[Écrire] --> B[Enregistrer]
  B --> C{Partager}
  C -->|Codes QR| D[Autre appareil]
  C -->|Lien| E[Copie en lecture seule]
\`\`\`

## Cellules de code

Le code s’exécute dans un bac à sable, sans accès au réseau. Appuyez sur ▶ pour l’exécuter.

\`\`\`python {run}
carres = [n * n for n in range(1, 11)]
print(sum(carres))
\`\`\`

## Citations

Les sources sont gardées avec le document, ici sous forme de notices bibliographiques [@knuth1984; @shapiro2011]. La liste des références ci-dessous est construite à partir des citations.

<div id="refs"></div>

[^1]: Comme celle-ci.
`,
};

export const DOCUMENT_TEXTS: Record<TemplateLang, DocumentTexts> = { en: EN, fr: FR };

/** Labels of the spreadsheets and presentation. */
export const LABELS = {
  en: {
    budget: { sheet: 'Budget', item: 'Item', months: ['January', 'February', 'March'], total: 'Total', income: 'Income', salary: 'Salary', other: 'Other income', expenses: 'Expenses', rent: 'Rent', food: 'Food', transport: 'Transport', leisure: 'Leisure', balance: 'Balance', chart: 'Expenses by month' },
    grades: { sheet: 'Grades', student: 'Student', tests: ['Test 1', 'Test 2', 'Test 3'], average: 'Average', mention: 'Result', mentions: ['Excellent', 'Very good', 'Good', 'Pass', 'Below'], classAverage: 'Class average', passed: 'Passed', students: ['BROWN Alice', 'KHAN Bilal', 'MARTIN Chloé', 'NGUYEN David', 'SMITH Emma', 'TAHIRI Farid'] },
    invoice: { sheet: 'Invoice', title: 'INVOICE', number: 'No.', date: 'Date', client: 'Client', description: 'Description', qty: 'Qty', price: 'Unit price', amount: 'Amount', items: ['Design work (hours)', 'Printing', 'Delivery'], subtotal: 'Subtotal', tax: 'VAT', total: 'Total' },
    signs: {
      title: 'Race signs',
      event: 'Village run · 12 October',
      start: 'START',
      finish: 'FINISH',
      water: 'WATER',
      km: 'km',
      notes: 'Print one sign per page (Print, 1 slide per page), then laminate. Change the texts and colours as needed; the orientation (portrait or landscape) is next to the slide size.',
    },
    talk: {
      title: 'Title of the talk',
      subtitle: 'Speaker · Event · Date',
      slides: [
        { title: 'Outline', points: ['Context', 'What we did', 'Results', 'Next steps'], notes: 'Introduce yourself and say how long the talk lasts.' },
        { title: 'Context', points: ['The problem in one sentence', 'Why it matters', 'What already exists'], notes: '' },
        { title: 'Results', points: ['Key figure or chart', 'What it shows', 'Limits'], notes: 'Paste a chart copied from a spreadsheet (📊, Copy as image).' },
        { title: 'Thank you', points: ['Questions?', 'Contact: name@example.org'], notes: '' },
      ],
    },
  },
  fr: {
    budget: { sheet: 'Budget', item: 'Poste', months: ['Janvier', 'Février', 'Mars'], total: 'Total', income: 'Revenus', salary: 'Salaire', other: 'Autres revenus', expenses: 'Dépenses', rent: 'Loyer', food: 'Alimentation', transport: 'Transport', leisure: 'Loisirs', balance: 'Solde', chart: 'Dépenses par mois' },
    grades: { sheet: 'Notes', student: 'Élève', tests: ['Devoir 1', 'Devoir 2', 'Devoir 3'], average: 'Moyenne', mention: 'Mention', mentions: ['Très bien', 'Bien', 'Assez bien', 'Passable', 'Insuffisant'], classAverage: 'Moyenne de la classe', passed: 'Moyenne ≥ 10', students: ['BERNARD Alice', 'BENALI Bilal', 'DUBOIS Chloé', 'LEROY David', 'MOREAU Emma', 'TAHIRI Farid'] },
    invoice: { sheet: 'Facture', title: 'FACTURE', number: 'N°', date: 'Date', client: 'Client', description: 'Désignation', qty: 'Qté', price: 'Prix unitaire', amount: 'Montant', items: ['Conception (heures)', 'Impression', 'Livraison'], subtotal: 'Total HT', tax: 'TVA', total: 'Total TTC' },
    signs: {
      title: 'Panneaux de course',
      event: 'Course des trois villages · 12 octobre',
      start: 'DÉPART',
      finish: 'ARRIVÉE',
      water: 'RAVITO',
      km: 'km',
      notes: 'Imprimez un panneau par page (Imprimer, 1 diapositive par page), puis plastifiez. Changez les textes et les couleurs au besoin ; l’orientation (portrait ou paysage) se règle à côté du format des diapositives.',
    },
    talk: {
      title: 'Titre de la présentation',
      subtitle: 'Orateur · Événement · Date',
      slides: [
        { title: 'Plan', points: ['Contexte', 'Ce que nous avons fait', 'Résultats', 'Suites'], notes: 'Présentez-vous et annoncez la durée.' },
        { title: 'Contexte', points: ['Le problème en une phrase', 'Pourquoi il compte', 'Ce qui existe déjà'], notes: '' },
        { title: 'Résultats', points: ['Chiffre ou graphique clé', 'Ce qu’il montre', 'Limites'], notes: 'Collez un graphique copié depuis un tableur (📊, Copier en image).' },
        { title: 'Merci', points: ['Des questions ?', 'Contact : nom@exemple.org'], notes: '' },
      ],
    },
  },
} as const;
