import { beforeEach, describe, expect, it } from 'vitest';
import { linkMention, loadBacklinkSettings, mentions, saveBacklinkSettings } from '../src/folder/backlinks';

// FOLDER-026: backlinks settings and unlinked mentions.

describe('FOLDER-026 unlinked mentions', () => {
  it('finds the name or an alias as a whole word, any case', () => {
    expect(mentions('We met about project alpha today.', ['Project Alpha'])).toBe(true);
    expect(mentions('The Alphabet book.', ['Alpha'])).toBe(false);
    expect(mentions('Écrit par PA.', ['Project Alpha', 'PA'])).toBe(true);
    expect(mentions('nothing', [''])).toBe(false);
  });

  it('makes the first plain mention a link, leaving links, code and front matter alone', () => {
    const text = '---\ntitle: Project Alpha\n---\nSee [[Project Alpha]] and `Project Alpha`, then [the plan](Project Alpha.md).\nThe project alpha starts.\n';
    expect(linkMention(text, 'Project Alpha')).toBe(text.replace('The project alpha starts', 'The [[Project Alpha|project alpha]] starts'));
    expect(linkMention('Ask PA.', 'Project Alpha', ['PA'])).toBe('Ask [[Project Alpha|PA]].');
    expect(linkMention('Project Alpha is late.', 'Project Alpha')).toBe('[[Project Alpha]] is late.');
    expect(linkMention('Only [[Project Alpha]].', 'Project Alpha')).toBeUndefined();
  });
});

describe('FOLDER-026 settings', () => {
  beforeEach(() => localStorage.clear());

  it('shows the backlinks at the bottom of the page by default, and keeps the choice', () => {
    expect(loadBacklinkSettings()).toEqual({ position: 'bottom', context: true, sort: 'name', unlinked: true, collapsed: false });
    saveBacklinkSettings({ position: 'side', context: false, sort: 'date', unlinked: false, collapsed: true });
    expect(loadBacklinkSettings()).toEqual({ position: 'side', context: false, sort: 'date', unlinked: false, collapsed: true });
  });
});
