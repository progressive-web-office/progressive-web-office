import { describe, expect, it } from 'vitest';
import { MemoryProvider, readText, walk } from '../src/fs';
import { pimAgentTools } from '../src/pim/agent-tools';

// CONTACT-007, CAL-007: the contacts and the calendar as tools of AI agents.

async function setup() {
  const provider = new MemoryProvider('memory', 'Notes', { 'People/Ada Lovelace.md': '---\ntitle: Ada Lovelace\ntype: "[[Person]]"\nemails:\n  - ada@example.org\n---\n' });
  const daily = new Map<string, string>();
  // The daily notes, and the links to a note found by reading every note (as the index would).
  const tools = pimAgentTools({
    provider,
    noteNames: () => [...daily.keys()].map((p) => p.replace(/^.*\//, '').replace(/\.md$/, '')).concat('Ada Lovelace'),
    backlinks: async (path) => {
      const name = path.replace(/^.*\//, '').replace(/\.md$/, '');
      const out: { from: string; context: string }[] = [];
      for await (const e of walk(provider, '')) {
        if (e.kind !== 'file' || e.path === path) continue;
        for (const line of (await readText(provider, e.path)).split('\n')) if (line.includes(`[[${name}]]`)) out.push({ from: e.path, context: line });
      }
      return out;
    },
    appendToDaily: async (date, line) => {
      const p = (n: number) => String(n).padStart(2, '0');
      const path = `Daily notes/${date.getFullYear()}/${p(date.getMonth() + 1)}/${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}.md`;
      const text = (await readText(provider, path).catch(() => '# Day\n')) + `${line}\n`;
      await provider.write(path, new Blob([text]));
      daily.set(path, text);
      return path;
    },
    changed: () => undefined,
  });
  const run = (name: string, input: Record<string, unknown>) => tools.find((t) => t.name === name)!.run(input);
  return { provider, run, tools };
}

describe('CONTACT-007 CAL-007 tools of agents', () => {
  it('offers the contacts and the calendar, those changing them marked', async () => {
    const { tools } = await setup();
    expect(tools.map((t) => [t.name, t.mutates])).toEqual([
      ['find_contacts', false],
      ['get_contact', false],
      ['save_contact', true],
      ['log_interaction', true],
      ['list_events', false],
      ['create_event', true],
    ]);
  });

  it('tells interactions read in the e-mail, into the daily notes, and gives them back', async () => {
    const { provider, run } = await setup();
    expect(await run('log_interaction', { name: 'ada@example.org', kind: 'email', summary: 'Sent the notes on the engine.', when: '2026-10-02T09:15' })).toBe('Written in Daily notes/2026/10/2026-10-02.md, linked to People/Ada Lovelace.md.');
    await run('log_interaction', { name: 'Ada Lovelace', kind: 'call', summary: 'Agreed on the review.', when: '2026-10-04T14:05' });
    // An unknown sender: a contact is made of the address.
    expect(await run('log_interaction', { name: 'charles@example.org', kind: 'email', summary: 'Asked for a meeting.', when: '2026-10-03T08:00' })).toBe('Written in Daily notes/2026/10/2026-10-03.md, linked to People/charles@example.org.md.');
    expect(await readText(provider, 'Daily notes/2026/10/2026-10-04.md')).toBe('# Day\n- 14:05 📞 Call — [[Ada Lovelace]]: Agreed on the review.\n');
    const ada = JSON.parse(await run('get_contact', { name: 'Ada Lovelace' })) as Record<string, unknown>;
    expect(ada).toMatchObject({ name: 'Ada Lovelace', emails: ['ada@example.org'], first_met: '2026-10-02', last_contact: '2026-10-04' });
    expect((ada.interactions as { when: string }[]).map((i) => i.when)).toEqual(['2026-10-04T14:05', '2026-10-02T09:15']);
    expect(await readText(provider, 'People/Ada Lovelace.md')).toContain('first met: 2026-10-02\nlast contact: 2026-10-04\n');
    expect(JSON.parse(await run('find_contacts', { query: 'example.org' }))).toHaveLength(2);
    // A kind of the user's.
    await run('log_interaction', { name: 'Ada Lovelace', kind: '🍽 Lunch', summary: 'The engine.', when: '2026-10-04T12:30' });
    expect(await readText(provider, 'Daily notes/2026/10/2026-10-04.md')).toContain('- 12:30 🍽 Lunch — [[Ada Lovelace]]: The engine.\n');
    expect(await run('log_interaction', { name: 'Ada', summary: 'x' })).toMatch(/^A name and a kind/);
    expect(await run('log_interaction', { name: 'Ada', kind: 'call', summary: 'x', when: 'yesterday' })).toBe('The time is written YYYY-MM-DDTHH:mm.');
  });

  it('saves contacts, the fields given replacing those of the contact', async () => {
    const { provider, run } = await setup();
    expect(await run('save_contact', { name: 'Ada Lovelace', organization: 'Analytical Engines', phones: ['+44 20 7946 0000'] })).toBe('Updated People/Ada Lovelace.md.');
    const text = await readText(provider, 'People/Ada Lovelace.md');
    expect(text).toContain('emails:\n  - ada@example.org\n');
    expect(text).toContain('organization: Analytical Engines\n');
    expect(await run('save_contact', { name: 'Mary Somerville', birthday: '1780-12-26' })).toBe('Created People/Mary Somerville.md.');
    expect(await run('save_contact', { name: 'X', birthday: '26/12/1780' })).toBe('The birthday is written YYYY-MM-DD.');
  });

  it('creates and lists events', async () => {
    const { run } = await setup();
    expect(await run('create_event', { title: 'Engine review', start: '2026-10-06T14:00', end: '2026-10-06T15:00', attendees: ['Ada Lovelace', 'charles@example.org'] })).toBe('Created Events/2026/10/06/2026-10-06 Engine review.md.');
    await run('create_event', { title: 'Holiday', start: '2026-10-12', end: '2026-10-13' });
    const events = JSON.parse(await run('list_events', { from: '2026-10-01', to: '2026-11-01' })) as Record<string, unknown>[];
    expect(events.map((e) => [e.title, e.start, e.attendees])).toEqual([
      ['Engine review', '2026-10-06T14:00', ['Ada Lovelace', 'charles@example.org']],
      ['Holiday', '2026-10-12', []],
    ]);
    expect(await run('create_event', { title: 'x', start: 'tomorrow' })).toMatch(/^A title and a start/);
  });
});
