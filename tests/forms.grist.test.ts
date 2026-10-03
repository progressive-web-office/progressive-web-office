import { describe, expect, it } from 'vitest';
import { GristClient } from '../src/grist/client';
import { gristColumnId, gristType, sendAnswersToGrist } from '../src/forms/grist';
import { answersTable, readDocumentAnswers } from '../src/forms/collect';
import { readMarkdown } from '../src/document/markdown-reader';
import { writeDocument } from '../src/document/io';

/** A Grist server in memory, for the requests the answers need. */
function fakeGrist(tables: Record<string, { columns: { id: string; fields: { label: string; type: string } }[]; records: { id: number; fields: Record<string, unknown> }[] }> = {}) {
  const calls: string[] = [];
  const fetchFn = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const path = url.pathname.replace('/api/docs/d1', '');
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push(`${method} ${path}`);
    const ok = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
    if (path === '/tables' && method === 'GET') return ok({ tables: Object.keys(tables).map((id) => ({ id })) });
    if (path === '/tables' && method === 'POST') {
      for (const t of body.tables) tables[t.id] = { columns: t.columns, records: [] };
      return ok({ tables: body.tables.map((t: { id: string }) => ({ id: t.id })) });
    }
    const m = /^\/tables\/([^/]+)\/(columns|records)$/.exec(path);
    const table = m && tables[decodeURIComponent(m[1]!)];
    if (!table) return new Response('{"error":"no"}', { status: 404 });
    if (m![2] === 'columns') {
      if (method === 'POST') table.columns.push(...body.columns);
      return ok({ columns: table.columns });
    }
    if (method === 'POST') for (const r of body.records) table.records.push({ id: table.records.length + 1, fields: r.fields });
    return ok({ records: table.records });
  };
  return { client: new GristClient({ serverUrl: 'https://grist.example.org', apiKey: 'k' }, fetchFn), tables, calls };
}

const TABLE = answersTable(
  [
    { file: 'ada.odt', answers: [{ name: 'Nom élève', value: 'Ada' }, { name: 'Photos', value: true }, { name: 'Âge', value: '15' }] },
    { file: 'alan.odt', answers: [{ name: 'Nom élève', value: 'Alan' }, { name: 'Photos', value: false }, { name: 'Âge', value: '16' }] },
  ],
  'File',
);

describe('FORM-004 answers sent to Grist', () => {
  it('makes column ids and types Grist accepts', () => {
    const taken = new Set<string>();
    expect(gristColumnId('Nom élève', taken)).toBe('Nom_eleve');
    expect(gristColumnId('Nom élève', taken)).toBe('Nom_eleve_2');
    expect(gristColumnId('1st choice', taken)).toBe('F_1st_choice');
    expect(gristColumnId('???', taken)).toBe('Field');
    expect(gristType([true, false, null])).toBe('Bool');
    expect(gristType([15, 16.5])).toBe('Numeric');
    expect(gristType(['a', 1])).toBe('Text');
  });

  it('creates a typed table and adds a record per file', async () => {
    const grist = fakeGrist();
    const sent = await sendAnswersToGrist(grist.client, 'd1', TABLE, 'Inscriptions');
    expect(sent).toEqual({ tableId: 'Inscriptions', added: 2, skipped: 0, created: true });
    expect(grist.tables.Inscriptions!.columns.map((c) => [c.id, c.fields.label, c.fields.type])).toEqual([
      ['File', 'File', 'Text'],
      ['Nom_eleve', 'Nom élève', 'Text'],
      ['Photos', 'Photos', 'Bool'],
      ['Age', 'Âge', 'Numeric'],
    ]);
    expect(grist.tables.Inscriptions!.records[0]!.fields).toEqual({ File: 'ada.odt', Nom_eleve: 'Ada', Photos: true, Age: 15 });
  });

  it('completes an existing table: new columns, files not sent twice', async () => {
    const grist = fakeGrist({
      Inscriptions: { columns: [{ id: 'File', fields: { label: 'File', type: 'Text' } }, { id: 'Nom_eleve', fields: { label: 'Nom élève', type: 'Text' } }], records: [{ id: 1, fields: { File: 'ada.odt', Nom_eleve: 'Ada' } }] },
    });
    const sent = await sendAnswersToGrist(grist.client, 'd1', TABLE, 'inscriptions');
    expect(sent).toEqual({ tableId: 'Inscriptions', added: 1, skipped: 1, created: false });
    expect(grist.tables.Inscriptions!.columns.map((c) => c.id)).toEqual(['File', 'Nom_eleve', 'Photos', 'Age']);
    expect(grist.tables.Inscriptions!.records[1]!.fields).toEqual({ File: 'alan.odt', Nom_eleve: 'Alan', Photos: false, Age: 16 });
  });
});

describe('FORM-003 answers of filled text documents', () => {
  const SOURCE = 'Name: [Ada]{.input name="Name"}\n\n[x]{.checkbox name="Photos"} and [Expert]{.choice name="Level" options="Beginner|Expert"}\n';
  it.each(['odt', 'docx', 'md'] as const)('reads the fields of a %s form', async (format) => {
    const bytes = writeDocument(readMarkdown(SOURCE), format);
    const form = await readDocumentAnswers(`ada.${format}`, bytes);
    expect(form).toEqual({ file: `ada.${format}`, answers: [{ name: 'Name', value: 'Ada' }, { name: 'Photos', value: true }, { name: 'Level', value: 'Expert' }] });
  });
});
