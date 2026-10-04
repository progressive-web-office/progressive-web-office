/**
 * The graph of the links between the notes of a folder (FOLDER-018): Mermaid
 * draws the notes and their links; a click on a note (or on its name in the
 * list, for the keyboard) opens it.
 */
import { busyText, button, h } from '../app/dom';
import { t } from '../i18n';
import { noteName } from './vault';

const escape = (s: string): string => s.replace(/"/g, '#quot;').replace(/</g, '#lt;').replace(/>/g, '#gt;');

/** Mermaid source of the graph; nodes are `n<index>` in the order of `notes`. */
export function notesGraphSource(notes: string[], links: { from: string; to: string }[]): string {
  const index = new Map(notes.map((n, i) => [n, i]));
  const lines = ['flowchart LR'];
  notes.forEach((n, i) => lines.push(`  n${i}["${escape(noteName(n))}"]`));
  const seen = new Set<string>();
  for (const l of links) {
    const a = index.get(l.from);
    const b = index.get(l.to);
    if (a === undefined || b === undefined) continue;
    // A link both ways is drawn once, with two arrows.
    if (seen.has(`${b}-${a}`)) {
      lines[lines.indexOf(`  n${b} --> n${a}`)] = `  n${b} <--> n${a}`;
      continue;
    }
    seen.add(`${a}-${b}`);
    lines.push(`  n${a} --> n${b}`);
  }
  return lines.join('\n');
}

export function notesGraphDialog(host: HTMLElement, notes: string[], links: { from: string; to: string }[]): Promise<string | null> {
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'dialog notes-graph-dialog', 'aria-labelledby': 'notes-graph-title' });
    const finish = (path: string | null): void => {
      dialog.close();
      dialog.remove();
      resolve(path);
    };
    const graph = h('div', { class: 'notes-graph' }, h('p', { class: 'hint' }, ...busyText(t('folder.graphDrawing'))));
    const linked = new Set(links.flatMap((l) => [l.from, l.to]));
    dialog.append(
      h('h2', { id: 'notes-graph-title' }, t('folder.graph')),
      h('p', { class: 'hint' }, t('folder.graphHint', { notes: notes.length, links: links.length, alone: notes.filter((n) => !linked.has(n)).length })),
      graph,
      h('details', {}, h('summary', {}, t('code.dagAsList')), h('ul', { role: 'list' }, ...notes.map((n) => h('li', {}, button(n, () => finish(n), { className: 'link' }))))),
      h('div', { class: 'dialog-actions' }, button(t('common.close'), () => finish(null))),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(null);
    });
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    if (!notes.length) {
      graph.replaceChildren(h('p', { class: 'hint' }, t('folder.noNotes')));
      return;
    }
    void (async () => {
      try {
        const { renderDiagramSvg } = await import('../diagram/mermaid');
        const { svg } = await renderDiagramSvg(notesGraphSource(notes, links));
        const root = document.importNode(new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement, true);
        root.setAttribute('role', 'img');
        root.setAttribute('aria-label', t('folder.graph'));
        graph.replaceChildren(root);
        for (const node of root.querySelectorAll<SVGGElement>('g.node')) {
          const i = Number(/(?:^|-)n(\d+)-\d+$/.exec(node.id)?.[1]);
          const path = notes[i];
          if (!path) continue;
          node.dataset.note = path;
          node.style.cursor = 'pointer';
          node.addEventListener('click', () => finish(path));
        }
      } catch {
        graph.replaceChildren(h('p', { class: 'hint' }, t('code.dagFailed')));
      }
    })();
  });
}
