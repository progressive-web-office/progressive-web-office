/**
 * The languages example (FILE-018, CODE-017, CODE-018): one small runnable
 * program in each language the cells run — Python, JavaScript, Lua, SQL,
 * C, C++ and R. The cells have no output yet: the runtimes are downloaded
 * on the first run, after asking.
 */
import type { TemplateLang } from './content';

const fence = (body: string, info: string): string => `\`\`\`${info}\n${body.trim()}\n\`\`\``;

interface Texts {
  title: string;
  intro: string;
  python: [heading: string, text: string];
  javascript: [heading: string, text: string];
  lua: [heading: string, text: string];
  sql: [heading: string, text: string, between: string];
  c: [heading: string, text: string];
  cpp: [heading: string, text: string];
  r: [heading: string, text: string, between: string];
  files: [heading: string, text: string];
  /** Data shared by the programs: the marks of a class. */
  names: string[];
  subject: [string, string];
  words: string;
}

const TEXTS: Record<TemplateLang, Texts> = {
  en: {
    title: 'Languages',
    intro:
      'Code cells run in **Python, JavaScript, Lua, SQL, C, C++ and R**, in an isolated sandbox. Press ▶ on a cell, or **⏩** to run them all. JavaScript needs no download; the other languages are downloaded the first time, after asking you (Python, Lua, SQL and C/C++ then work offline). Cells of the same language share their variables, in document order.',
    python: ['Python', 'Python runs with Pyodide; `numpy`, `pandas` or `matplotlib` are installed when a cell imports them.'],
    javascript: ['JavaScript', 'JavaScript runs at once. `console.log` prints, `display(...)` shows a value.'],
    lua: ['Lua', 'Lua 5.4 (wasmoon, about 0.5 MB). Variables stay from one cell to the next.'],
    sql: ['SQL', 'SQLite (sql.js, about 0.7 MB). The database lives in memory for the session: a first cell creates a table…', '…and a later one queries it. The result of a query shows as a table.'],
    c: ['C', 'C and C++ are compiled by Clang (about 100 MB, downloaded once), then run. Each cell is a whole program, with its `main`. Programs print, but read neither input nor files.'],
    cpp: ['C++', 'The standard C++ library is there, without exceptions.'],
    r: ['R', 'R runs with webR (about 40 MB, kept by the browser cache, not offline). The `datasets` are there; install packages with `webr::install("dplyr")`.', 'Plots show under the cell.'],
    files: ['Files', 'Source files run too: open a `.py`, `.js`, `.ts`, `.lua`, `.sql`, `.c`, `.cpp` or `.R` file and press ▶ Run (Ctrl+Enter).'],
    names: ['Alice', 'Bruno', 'Chloé', 'Driss', 'Emma'],
    subject: ['maths', 'physics'],
    words: 'the quick brown fox jumps over the lazy dog the end',
  },
  fr: {
    title: 'Langages',
    intro:
      'Les cellules de code s’exécutent en **Python, JavaScript, Lua, SQL, C, C++ et R**, dans un bac à sable isolé. Appuyez sur ▶ sur une cellule, ou sur **⏩** pour toutes les exécuter. JavaScript ne demande aucun téléchargement ; les autres langages sont téléchargés la première fois, après vous l’avoir demandé (Python, Lua, SQL et C/C++ fonctionnent ensuite hors ligne). Les cellules d’un même langage partagent leurs variables, dans l’ordre du document.',
    python: ['Python', 'Python s’exécute avec Pyodide ; `numpy`, `pandas` ou `matplotlib` s’installent quand une cellule les importe.'],
    javascript: ['JavaScript', 'JavaScript s’exécute tout de suite. `console.log` affiche, `display(...)` montre une valeur.'],
    lua: ['Lua', 'Lua 5.4 (wasmoon, environ 0,5 Mo). Les variables restent d’une cellule à l’autre.'],
    sql: ['SQL', 'SQLite (sql.js, environ 0,7 Mo). La base vit en mémoire pour la session : une première cellule crée une table…', '…et une suivante l’interroge. Le résultat d’une requête s’affiche en tableau.'],
    c: ['C', 'C et C++ sont compilés par Clang (environ 100 Mo, téléchargés une fois), puis exécutés. Chaque cellule est un programme complet, avec son `main`. Les programmes affichent, mais ne lisent ni entrée ni fichiers.'],
    cpp: ['C++', 'La bibliothèque standard C++ est là, sans les exceptions.'],
    r: ['R', 'R s’exécute avec webR (environ 40 Mo, gardés par le cache du navigateur, pas hors ligne). Les `datasets` sont là ; installez des paquets avec `webr::install("dplyr")`.', 'Les graphiques s’affichent sous la cellule.'],
    files: ['Fichiers', 'Les fichiers source s’exécutent aussi : ouvrez un fichier `.py`, `.js`, `.ts`, `.lua`, `.sql`, `.c`, `.cpp` ou `.R` et appuyez sur ▶ Exécuter (Ctrl+Entrée).'],
    names: ['Alice', 'Bruno', 'Chloé', 'Driss', 'Emma'],
    subject: ['maths', 'physique'],
    words: 'le chat dort et le chien dort aussi sur le tapis',
  },
};

const MARKS = [
  [14, 12],
  [9.5, 11],
  [17, 15.5],
  [12, 8],
  [15.5, 16],
];

export function languagesMarkdown(lang: TemplateLang): string {
  const T = TEXTS[lang];
  const fr = lang === 'fr';
  const python = `from statistics import mean, stdev

marks = ${JSON.stringify(MARKS.map((m) => m[0]))}
print(f"${fr ? 'moyenne' : 'mean'} = {mean(marks):.2f}, ${fr ? 'écart-type' : 'standard deviation'} = {stdev(marks):.2f}")
print("${fr ? 'au-dessus de la moyenne' : 'above the mean'}:", [m for m in marks if m > mean(marks)])`;
  const javascript = `const fib = (n) => (n < 2 ? n : fib(n - 1) + fib(n - 2));
console.log(Array.from({ length: 15 }, (_, i) => fib(i)).join(", "));`;
  const lua = `local counts = {}
for word in ("${T.words}"):gmatch("%a+") do
  counts[word] = (counts[word] or 0) + 1
end
local words = {}
for word in pairs(counts) do words[#words + 1] = word end
table.sort(words, function(a, b) return counts[a] > counts[b] or (counts[a] == counts[b] and a < b) end)
for i = 1, 3 do print(words[i], counts[words[i]]) end`;
  const rows = T.names.flatMap((name, i) => T.subject.map((s, j) => `  ('${name}', '${s}', ${MARKS[i]![j]})`));
  const sqlCreate = `CREATE TABLE marks (student TEXT, subject TEXT, mark REAL);
INSERT INTO marks VALUES
${rows.join(',\n')};`;
  const sqlQuery = `SELECT subject, COUNT(*) AS students, ROUND(AVG(mark), 2) AS average, MAX(mark) AS best
FROM marks
GROUP BY subject
ORDER BY average DESC;`;
  const c = `#include <stdio.h>

int main(void) {
  /* ${fr ? 'Crible d’Ératosthène' : 'Sieve of Eratosthenes'} */
  char composite[101] = {0};
  for (int i = 2; i <= 100; i++) {
    if (composite[i]) continue;
    printf("%d ", i);
    for (int j = i * i; j <= 100; j += i) composite[j] = 1;
  }
  printf("\\n");
  return 0;
}`;
  const cpp = `#include <algorithm>
#include <iostream>
#include <string>
#include <vector>

int main() {
  std::vector<std::string> names = {${T.names.map((n) => `"${n}"`).join(', ')}};
  std::vector<double> marks = {${MARKS.map((m) => m[0]).join(', ')}};
  std::vector<size_t> order(names.size());
  for (size_t i = 0; i < order.size(); i++) order[i] = i;
  std::sort(order.begin(), order.end(), [&](size_t a, size_t b) { return marks[a] > marks[b]; });
  for (size_t i : order) std::cout << names[i] << "\\t" << marks[i] << "\\n";
}`;
  const rFit = `fit <- lm(mpg ~ wt, data = mtcars)
summary(fit)$coefficients`;
  const rPlot = `plot(mtcars$wt, mtcars$mpg, pch = 19, col = "steelblue",
     xlab = "${fr ? 'Masse (1000 lb)' : 'Weight (1000 lb)'}", ylab = "${fr ? 'Miles par gallon' : 'Miles per gallon'}")
abline(fit, col = "firebrick", lwd = 2)`;
  return `${[
    `# ${T.title}`,
    T.intro,
    `## ${T.python[0]}`,
    T.python[1],
    fence(python, 'python {run}'),
    `## ${T.javascript[0]}`,
    T.javascript[1],
    fence(javascript, 'javascript {run}'),
    `## ${T.lua[0]}`,
    T.lua[1],
    fence(lua, 'lua {run}'),
    `## ${T.sql[0]}`,
    T.sql[1],
    fence(sqlCreate, 'sql {run}'),
    T.sql[2],
    fence(sqlQuery, 'sql {run}'),
    `## ${T.c[0]}`,
    T.c[1],
    fence(c, 'c {run}'),
    `## ${T.cpp[0]}`,
    T.cpp[1],
    fence(cpp, 'cpp {run}'),
    `## ${T.r[0]}`,
    T.r[1],
    fence(rFit, 'r {run}'),
    T.r[2],
    fence(rPlot, 'r {run}'),
    `## ${T.files[0]}`,
    T.files[1],
  ].join('\n\n')}\n`;
}
