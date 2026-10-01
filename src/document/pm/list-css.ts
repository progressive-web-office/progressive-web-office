/**
 * Styles of flat list paragraphs (`p.list-item[data-list][data-level]`):
 * indentation, bullets and numbering with CSS counters, for the editor and the
 * print preview. A numbered list restarts after any paragraph that is not a
 * deeper list item; deeper levels restart under each item.
 */
const LEVELS = 9;
const BULLETS = ['•', '◦', '▪'];
const NUMBERS = ['decimal', 'lower-alpha', 'lower-roman'];

export function listCss(scope: string): string {
  const counters = (from: number): string =>
    Array.from({ length: LEVELS - from }, (_, i) => `pwo-l${from + i}`).join(' ') || 'none';
  const rules: string[] = [
    `${scope} { counter-reset: ${counters(0)} pwo-fn; }`,
    // Footnote references, numbered in reading order (DOC-022).
    `${scope} .pm-footnote::after, ${scope} .footnote::after { counter-increment: pwo-fn; content: counter(pwo-fn); vertical-align: super; font-size: 0.75em; line-height: 0; }`,
    `${scope} > :not(.list-item) { counter-reset: ${counters(0)}; }`,
    `${scope} .list-item { position: relative; margin-top: 0; margin-bottom: 2pt; }`,
    `${scope} .list-item::before { position: absolute; left: -1.4em; width: 1.2em; text-align: right; }`,
  ];
  for (let l = 0; l < LEVELS; l++) {
    const sel = `${scope} .list-item[data-level="${l}"]`;
    rules.push(`${sel} { margin-left: ${1.6 + l * 1.6}em; }`);
    rules.push(`${sel}[data-list="ul"] { counter-reset: ${counters(l)}; }`);
    rules.push(`${sel}[data-list="ul"]::before { content: '${BULLETS[l % BULLETS.length]}'; }`);
    rules.push(`${sel}[data-list="ol"] { counter-reset: ${counters(l + 1)}; counter-increment: pwo-l${l}; }`);
    rules.push(`${sel}[data-list="ol"]::before { content: counter(pwo-l${l}, ${NUMBERS[l % NUMBERS.length]}) '.'; width: 2.4em; left: -2.6em; }`);
  }
  return rules.join('\n');
}
