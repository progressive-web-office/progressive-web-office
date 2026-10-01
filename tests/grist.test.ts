import { describe, expect, it } from 'vitest';
import { GristClient, GristError } from '../src/grist/client';
import { gristChanges, gristToWorkbook, type GristSnapshot } from '../src/grist/workbook';
import { getCell, setCell, type Workbook } from '../src/sheet/model';

interface Call {
  method: string;
  url: string;
  body?: unknown;
  auth?: string | null;
}

function mockFetch(routes: Record<string, unknown>, calls: Call[] = []) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined, auth: new Headers(init?.headers).get('Authorization') });
    const key = `${method} ${url.replace('https://grist.example.org/api', '')}`;
    if (!(key in routes)) return new Response('{"error":"not found"}', { status: 404 });
    return new Response(JSON.stringify(routes[key]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
}

const snapshot = (): GristSnapshot => ({
  docId: 'doc1',
  tables: [
    {
      tableId: 'Students',
      columns: [
        { id: 'Name', label: 'Name', type: 'Text', isFormula: false },
        { id: 'Grade', label: 'Grade', type: 'Numeric', isFormula: false },
        { id: 'Born', label: 'Born', type: 'Date', isFormula: false },
        { id: 'Passed', label: 'Passed', type: 'Bool', isFormula: false },
        { id: 'Double', label: 'Double', type: 'Numeric', isFormula: true },
        { id: 'Tags', label: 'Tags', type: 'ChoiceList', isFormula: false },
      ],
      records: [
        { id: 1, fields: { Name: 'Ada', Grade: 15, Born: 1_356_998_400, Passed: true, Double: 30, Tags: ['L', 'math'] } },
        { id: 2, fields: { Name: 'Alan', Grade: 9.5, Born: null, Passed: false, Double: 19, Tags: null } },
      ],
    },
  ],
});

describe('GRIST-001 API client', () => {
  it('sends the API key and lists documents of every workspace', async () => {
    const calls: Call[] = [];
    const client = new GristClient(
      { serverUrl: 'https://grist.example.org/', apiKey: 'secret' },
      mockFetch(
        {
          'GET /orgs': [{ id: 2, name: 'Personal', domain: 'docs' }],
          'GET /orgs/2/workspaces': [
            { id: 10, name: 'Home', docs: [{ id: 'doc1', name: 'Class' }] },
            { id: 11, name: 'Archive', docs: [{ id: 'doc2', name: 'Old' }] },
          ],
        },
        calls,
      ),
    );
    expect(await client.listOrgs()).toEqual([{ id: 2, name: 'Personal' }]);
    expect(await client.listDocs(2)).toEqual([
      { id: 'doc1', name: 'Class', workspace: 'Home' },
      { id: 'doc2', name: 'Old', workspace: 'Archive' },
    ]);
    expect(calls[0]).toMatchObject({ url: 'https://grist.example.org/api/orgs', auth: 'Bearer secret' });
  });

  it('reads every table with its visible columns and records', async () => {
    const client = new GristClient(
      { serverUrl: 'https://grist.example.org', apiKey: 'k' },
      mockFetch({
        'GET /docs/doc1/tables': { tables: [{ id: 'Students' }] },
        'GET /docs/doc1/tables/Students/columns': {
          columns: [
            { id: 'Name', fields: { label: 'Name', type: 'Text', isFormula: false } },
            { id: 'Double', fields: { label: 'Double', type: 'Numeric', isFormula: true } },
          ],
        },
        'GET /docs/doc1/tables/Students/records': { records: [{ id: 1, fields: { Name: 'Ada', Double: 30 } }] },
      }),
    );
    expect(await client.readDocument('doc1')).toEqual({
      docId: 'doc1',
      tables: [
        {
          tableId: 'Students',
          columns: [
            { id: 'Name', label: 'Name', type: 'Text', isFormula: false },
            { id: 'Double', label: 'Double', type: 'Numeric', isFormula: true },
          ],
          records: [{ id: 1, fields: { Name: 'Ada', Double: 30 } }],
        },
      ],
    });
  });

  it('explains authentication and network failures', async () => {
    const denied = new GristClient({ serverUrl: 'https://grist.example.org', apiKey: 'bad' }, async () => new Response('{"error":"Forbidden"}', { status: 403 }));
    await expect(denied.listOrgs()).rejects.toMatchObject({ name: 'GristError', status: 403 });
    const offline = new GristClient({ serverUrl: 'https://grist.example.org', apiKey: 'k' }, async () => {
      throw new TypeError('Failed to fetch');
    });
    const err = (await offline.listOrgs().catch((e: unknown) => e)) as GristError;
    expect(err).toBeInstanceOf(GristError);
    expect(err.status).toBe(0);
  });

  it('applies changes: update, add, then delete', async () => {
    const calls: Call[] = [];
    const client = new GristClient(
      { serverUrl: 'https://grist.example.org', apiKey: 'k' },
      mockFetch({ 'PATCH /docs/doc1/tables/T/records': {}, 'POST /docs/doc1/tables/T/records': { records: [{ id: 9 }] }, 'POST /docs/doc1/tables/T/data/delete': null }, calls),
    );
    await client.apply('doc1', [{ tableId: 'T', update: [{ id: 1, fields: { A: 2 } }], add: [{ A: 3 }], remove: [4] }]);
    expect(calls.map((c) => [c.method, c.url.replace('https://grist.example.org/api', ''), c.body])).toEqual([
      ['PATCH', '/docs/doc1/tables/T/records', { records: [{ id: 1, fields: { A: 2 } }] }],
      ['POST', '/docs/doc1/tables/T/records', { records: [{ fields: { A: 3 } }] }],
      ['POST', '/docs/doc1/tables/T/data/delete', [4]],
    ]);
  });
});

describe('GRIST-002 tables as sheets', () => {
  it('builds one sheet per table: id column, labels, typed values', () => {
    const wb = gristToWorkbook(snapshot());
    const sheet = wb.sheets[0]!;
    expect(sheet.name).toBe('Students');
    const row = (r: number) => Array.from({ length: 7 }, (_, c) => getCell(sheet, [r, c])?.value ?? null);
    expect(row(0)).toEqual(['id', 'Name', 'Grade', 'Born', 'Passed', 'Double', 'Tags']);
    expect(row(1)).toEqual([1, 'Ada', 15, 41275, true, 30, 'math']);
    expect(getCell(sheet, [1, 3])?.numFmt).toBe('yyyy-mm-dd');
    expect(row(2)).toEqual([2, 'Alan', 9.5, null, false, 19, null]);
  });
});

describe('GRIST-003 changes sent back', () => {
  const edited = (edit: (wb: Workbook) => void) => {
    const wb = gristToWorkbook(snapshot());
    edit(wb);
    return gristChanges(snapshot(), wb);
  };

  it('finds nothing when nothing changed', () => {
    expect(edited(() => undefined)).toEqual([]);
  });

  it('sends only the changed editable cells, converting dates back', () => {
    const changes = edited((wb) => {
      const s = wb.sheets[0]!;
      setCell(s, [1, 2], { value: 16 });
      setCell(s, [2, 3], { value: 41276, numFmt: 'yyyy-mm-dd' });
      setCell(s, [1, 5], { value: 99 }); // formula column: ignored
      setCell(s, [1, 6], { value: 'physics' }); // list column: not written
    });
    expect(changes).toEqual([{ tableId: 'Students', update: [{ id: 1, fields: { Grade: 16 } }, { id: 2, fields: { Born: 1_357_084_800 } }], add: [], remove: [] }]);
  });

  it('adds rows without id and removes rows whose id disappeared', () => {
    const changes = edited((wb) => {
      const s = wb.sheets[0]!;
      // Row 2 (Alan) deleted: shift the new row up.
      for (let c = 0; c < 7; c++) setCell(s, [2, c], undefined);
      setCell(s, [2, 1], { value: 'Grace' });
      setCell(s, [2, 2], { value: 18 });
    });
    expect(changes).toEqual([{ tableId: 'Students', update: [], add: [{ Name: 'Grace', Grade: 18 }], remove: [2] }]);
  });

  it('ignores sheets that are not tables of the document', () => {
    const changes = edited((wb) => {
      wb.sheets.push({ name: 'Notes', cells: new Map() });
      setCell(wb.sheets[1]!, [1, 1], { value: 'x' });
    });
    expect(changes).toEqual([]);
  });
});
