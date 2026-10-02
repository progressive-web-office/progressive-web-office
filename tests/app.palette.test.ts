import { describe, expect, it } from 'vitest';
import { filterCommands, splitShortcut } from '../src/app/palette';

describe('UI-018 command palette', () => {
  const commands = ['Insert table', 'Insert image', 'Table of contents', 'Bold', 'Créer une note', 'Save as format: Word document (.docx)'].map((label) => ({ label }));
  it('finds commands by words in any order, ignoring case and accents', () => {
    expect(filterCommands(commands, 'table').map((c) => c.label)).toEqual(['Table of contents', 'Insert table']);
    expect(filterCommands(commands, 'img ins').map((c) => c.label)).toEqual([]);
    expect(filterCommands(commands, 'image ins').map((c) => c.label)).toEqual(['Insert image']);
    expect(filterCommands(commands, 'creer').map((c) => c.label)).toEqual(['Créer une note']);
    expect(filterCommands(commands, 'docx').map((c) => c.label)).toEqual(['Save as format: Word document (.docx)']);
    expect(filterCommands(commands, '  ')).toHaveLength(6);
  });
});

describe('UI-018 keywords in the command palette', () => {
  it('finds a command by its keywords, in any language', () => {
    const commands = [{ label: 'Review mode', keywords: 'correction relecture proofreading' }, { label: 'Bold' }];
    expect(filterCommands(commands, 'correction').map((c) => c.label)).toEqual(['Review mode']);
    expect(filterCommands(commands, 'mode relec').map((c) => c.label)).toEqual(['Review mode']);
    expect(filterCommands(commands, 'bold').map((c) => c.label)).toEqual(['Bold']);
  });
});

describe('UI-018 shortcuts in the command palette', () => {
  it('finds the keyboard shortcut at the end of a tooltip', () => {
    expect(splitShortcut('Comment (Ctrl+Alt+M)')).toEqual({ label: 'Comment', keys: ['Ctrl+Alt+M'] });
    expect(splitShortcut('Find (Ctrl+F, Ctrl+H)')).toEqual({ label: 'Find', keys: ['Ctrl+F', 'Ctrl+H'] });
    expect(splitShortcut('Next page (k)')).toEqual({ label: 'Next page', keys: ['k'] });
    expect(splitShortcut('Zoom out (-)')).toEqual({ label: 'Zoom out', keys: ['-'] });
    expect(splitShortcut('Previous page (Page Up)')).toEqual({ label: 'Previous page', keys: ['Page Up'] });
    expect(splitShortcut('Full screen (f; Esc to leave)')).toEqual({ label: 'Full screen', keys: ['f'] });
  });

  it('leaves other parentheses alone', () => {
    expect(splitShortcut('Markdown package (.mdz)')).toEqual({ label: 'Markdown package (.mdz)', keys: [] });
    expect(splitShortcut('Sources (BibTeX)')).toEqual({ label: 'Sources (BibTeX)', keys: [] });
    expect(splitShortcut('Save')).toEqual({ label: 'Save', keys: [] });
  });
});
