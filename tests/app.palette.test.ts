import { describe, expect, it } from 'vitest';
import { filterCommands } from '../src/app/palette';

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
