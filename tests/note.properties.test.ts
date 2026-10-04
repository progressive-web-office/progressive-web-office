import { describe, expect, it } from 'vitest';
import { changed, newProperty, readProperties, typed, writeProperties } from '../src/document/note-properties';
import { parseFrontMatter, writeFrontMatter } from '../src/document/frontmatter';

// NOTE-001: the front matter of a note as typed properties.

const FRONT = `---
title: Réunion de rentrée
date: 2026-09-01
tags:
  - réunion
  - équipe
aliases: [Rentrée, "Kick-off, 2026"]
done: false
rating: 4
due: 2026-10-15
project: "[[Projet Alpha]]"
url: https://example.org
# a comment kept with what follows
links:
  nested: map
---
Body
`;

const props = () => {
  const f = parseFrontMatter(FRONT);
  return readProperties(f.meta, f.extra);
};

describe('NOTE-001 note properties', () => {
  it('reads each key with its type, the document properties first', () => {
    const byKey = Object.fromEntries(props().map((p) => [p.key, p.value]));
    expect(byKey).toMatchObject({
      title: { kind: 'text', text: 'Réunion de rentrée' },
      date: { kind: 'date', value: '2026-09-01' },
      tags: { kind: 'list', items: ['réunion', 'équipe'] },
      aliases: { kind: 'list', items: ['Rentrée', 'Kick-off, 2026'], inline: true },
      done: { kind: 'bool', value: false },
      rating: { kind: 'number', value: 4 },
      due: { kind: 'date', value: '2026-10-15' },
      project: { kind: 'text', text: '[[Projet Alpha]]' },
      url: { kind: 'text', text: 'https://example.org' },
      links: { kind: 'raw' },
    });
    expect(props().filter((p) => p.key).map((p) => p.key)).toEqual(['title', 'date', 'tags', 'aliases', 'done', 'rating', 'due', 'project', 'url', 'links']);
  });

  it('writes the front matter back unchanged when nothing changed', () => {
    const f = parseFrontMatter(FRONT);
    const out = writeProperties(props());
    expect(out.extra).toBe(f.extra);
    expect(out.meta).toEqual(f.meta);
  });

  it('rewrites only the property changed, in its place, in the style it had', () => {
    const list = props().map((p) =>
      p.key === 'tags' ? changed(p, { kind: 'list', items: ['réunion', 'équipe', 'rentrée'] }) : p.key === 'done' ? changed(p, { kind: 'bool', value: true }) : p.key === 'aliases' ? changed(p, { ...(p.value as { kind: 'list'; items: string[] }), items: ['Rentrée'] }) : p,
    );
    const { meta, extra } = writeProperties(list);
    expect(extra).toContain('tags:\n  - réunion\n  - équipe\n  - rentrée\naliases: [Rentrée]\ndone: true\nrating: 4');
    expect(extra).toContain('# a comment kept with what follows\nlinks:\n  nested: map');
    const again = parseFrontMatter(writeFrontMatter(meta, extra) + 'Body\n');
    expect(readProperties(again.meta, again.extra).find((p) => p.key === 'tags')!.value).toEqual({ kind: 'list', items: ['réunion', 'équipe', 'rentrée'] });
  });

  it('adds and removes properties, a document property going to the meta', () => {
    const list = [...props().filter((p) => p.key !== 'rating'), { ...newProperty('author', 'text'), value: { kind: 'text' as const, text: 'Ada' } }, newProperty('status', 'list')];
    const { meta, extra } = writeProperties(list);
    expect(meta.author).toBe('Ada');
    expect(extra).not.toContain('rating');
    expect(extra).toContain('status: []');
  });

  it('types the scalars', () => {
    expect(typed('true')).toEqual({ kind: 'bool', value: true });
    expect(typed('-3.5')).toEqual({ kind: 'number', value: -3.5 });
    expect(typed('2026-10-04T09:30')).toEqual({ kind: 'date', value: '2026-10-04T09:30' });
    expect(typed('"2026-10-04"')).toEqual({ kind: 'text', text: '2026-10-04' });
    expect(typed('{a: 1}')).toEqual({ kind: 'raw', text: '{a: 1}' });
  });
});
