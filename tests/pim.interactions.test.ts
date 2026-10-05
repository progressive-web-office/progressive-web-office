import { describe, expect, it } from 'vitest';
import { firstAndLast, interactionLine, kindChoice, kindsInLines, timeline, type BuiltInKind } from '../src/pim/interactions';

// CONTACT-006: the interactions with a person, from the events and the notes.

describe('CONTACT-006 interactions', () => {
  it('writes an interaction as a line of a daily note', () => {
    expect(interactionLine(new Date(2026, 9, 4, 14, 5), { icon: '📞', label: 'Call' }, 'Ada Lovelace', ' about\nthe review ')).toBe('- 14:05 📞 Call — [[Ada Lovelace]]: about the review');
    expect(interactionLine(new Date(2026, 9, 4, 9, 0), { icon: '✉️', label: 'E-mail' }, 'Ada Lovelace')).toBe('- 09:00 ✉️ E-mail — [[Ada Lovelace]]');
  });

  it('takes the kinds built in, by id or name, and the kinds of the user', () => {
    const fr: Record<BuiltInKind, string> = { meeting: 'Réunion', call: 'Appel', email: 'E-mail', message: 'Message', other: 'Autre' };
    const label = (k: BuiltInKind) => fr[k];
    expect(kindChoice('call', label)).toEqual({ icon: '📞', label: 'Appel' });
    expect(kindChoice('📞 appel', label)).toEqual({ icon: '📞', label: 'Appel' });
    expect(kindChoice('reunion', label)).toEqual({ icon: '🤝', label: 'Réunion' });
    expect(kindChoice('🍽 Déjeuner', label)).toEqual({ icon: '🍽', label: 'Déjeuner' });
    expect(kindChoice('Visite du labo', label)).toEqual({ icon: '•', label: 'Visite du labo' });
    expect(kindChoice('  ', label)).toEqual({ icon: '•', label: 'Autre' });
  });

  it('finds the kinds used in the daily notes, the most used first', () => {
    expect(
      kindsInLines([
        '- 12:30 🍽 Lunch — [[Ada Lovelace]]: the engine',
        '- 09:00 📞 Call — [[Ada Lovelace]]',
        '- 12:15 🍽 lunch — [[Ada Lovelace]]',
        '- 18:00 Visit — [[Ada Lovelace]]',
        'Lunch with [[Ada Lovelace]].',
      ]),
    ).toEqual([
      { icon: '🍽', label: 'Lunch' },
      { icon: '📞', label: 'Call' },
      { icon: '•', label: 'Visit' },
    ]);
  });

  it('puts the events, the daily notes and the other notes in one timeline, the latest first', () => {
    const daily = (p: string) => /^Daily notes\/(\d{4}-\d{2}-\d{2})\.md$/.exec(p)?.[1];
    const items = timeline(
      [{ path: 'Events/2026-09-12 Conference.md', title: 'Conference', start: '2026-09-12T10:00' }, { path: 'Events/2026-11-02 Review.md', title: 'Review', start: '2026-11-02T14:00' }],
      [
        { from: 'Daily notes/2026-10-04.md', context: '- 14:05 📞 Call — [[Ada Lovelace]]: about the review' },
        { from: 'Daily notes/2026-09-30.md', context: 'Lunch with [[Ada Lovelace]].' },
        { from: 'Events/2026-09-12 Conference.md', context: '[[Ada Lovelace]]' },
        { from: 'Projects/Engine.md', context: 'Lead: [[Ada Lovelace]]' },
        { from: 'Notes/2026-08-01 Letter.md', context: 'From [[Ada Lovelace]]' },
      ],
      daily,
    );
    expect(items.map((i) => [i.when ?? '', i.kind, i.label])).toEqual([
      ['2026-11-02T14:00', 'event', 'Review'],
      ['2026-10-04T14:05', 'daily', '2026-10-04'],
      ['2026-09-30', 'daily', '2026-09-30'],
      ['2026-09-12T10:00', 'event', 'Conference'],
      ['2026-08-01', 'note', '2026-08-01 Letter'],
      ['', 'note', 'Engine'],
    ]);
    // The future is no contact yet; a first meeting written in the note counts.
    expect(firstAndLast(items, '2026-10-04')).toEqual({ first: '2026-08-01', last: '2026-10-04' });
    expect(firstAndLast(items, '2026-10-04', '2025-05-01')).toEqual({ first: '2025-05-01', last: '2026-10-04' });
    expect(firstAndLast([], '2026-10-04')).toEqual({});
  });
});
