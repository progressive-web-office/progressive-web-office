/** Minimal Grist REST API client (GRIST-001..GRIST-003). */

export type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface GristConfig {
  /** Server address, e.g. https://grist.example.org (no /api). */
  serverUrl: string;
  apiKey: string;
}

export interface GristOrg {
  id: number;
  name: string;
}

export interface GristDoc {
  id: string;
  name: string;
  workspace: string;
}

export interface GristColumn {
  id: string;
  label: string;
  /** Grist column type: Text, Numeric, Int, Bool, Date, DateTime:<tz>, Choice, ChoiceList, Ref:<table>… */
  type: string;
  isFormula: boolean;
}

export type GristValue = string | number | boolean | null | unknown[];

export interface GristRecord {
  id: number;
  fields: Record<string, GristValue>;
}

export interface GristTable {
  tableId: string;
  columns: GristColumn[];
  records: GristRecord[];
}

export interface GristTableChanges {
  tableId: string;
  update: GristRecord[];
  add: Record<string, GristValue>[];
  remove: number[];
}

export class GristError extends Error {
  constructor(
    message: string,
    /** HTTP status, or 0 when the server could not be reached (network, CORS). */
    readonly status: number,
  ) {
    super(message);
    this.name = 'GristError';
  }
}

export class GristClient {
  private readonly base: string;

  constructor(
    private readonly config: GristConfig,
    private readonly fetchFn: FetchFn = (input, init) => fetch(input, init),
  ) {
    this.base = `${config.serverUrl.trim().replace(/\/+$/, '').replace(/\/api$/, '')}/api`;
  }

  async listOrgs(): Promise<GristOrg[]> {
    const orgs = await this.request<{ id: number; name: string }[]>('GET', '/orgs');
    return orgs.map((o) => ({ id: o.id, name: o.name }));
  }

  async listDocs(orgId: number): Promise<GristDoc[]> {
    const workspaces = await this.request<{ name: string; docs?: { id: string; name: string }[] }[]>('GET', `/orgs/${orgId}/workspaces`);
    return workspaces.flatMap((w) => (w.docs ?? []).map((d) => ({ id: d.id, name: d.name, workspace: w.name })));
  }

  async readDocument(docId: string): Promise<{ docId: string; tables: GristTable[] }> {
    const doc = encodeURIComponent(docId);
    const { tables } = await this.request<{ tables: { id: string }[] }>('GET', `/docs/${doc}/tables`);
    const out: GristTable[] = [];
    for (const { id } of tables) {
      const table = encodeURIComponent(id);
      const [{ columns }, { records }] = await Promise.all([
        this.request<{ columns: { id: string; fields: { label?: string; type?: string; isFormula?: boolean } }[] }>('GET', `/docs/${doc}/tables/${table}/columns`),
        this.request<{ records: GristRecord[] }>('GET', `/docs/${doc}/tables/${table}/records`),
      ]);
      out.push({
        tableId: id,
        columns: columns.map((c) => ({ id: c.id, label: c.fields.label || c.id, type: c.fields.type ?? 'Any', isFormula: !!c.fields.isFormula })),
        records,
      });
    }
    return { docId, tables: out };
  }

  /** Apply changes table by table: updates, then additions, then deletions. */
  async apply(docId: string, changes: GristTableChanges[]): Promise<void> {
    const doc = encodeURIComponent(docId);
    for (const c of changes) {
      const path = `/docs/${doc}/tables/${encodeURIComponent(c.tableId)}`;
      if (c.update.length) await this.request('PATCH', `${path}/records`, { records: c.update });
      if (c.add.length) await this.request('POST', `${path}/records`, { records: c.add.map((fields) => ({ fields })) });
      if (c.remove.length) await this.request('POST', `${path}/data/delete`, c.remove);
    }
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchFn(this.base + path, {
        method,
        headers: { Authorization: `Bearer ${this.config.apiKey}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch (err) {
      throw new GristError((err as Error).message || 'Network error', 0);
    }
    const text = await res.text();
    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      try {
        message = (JSON.parse(text) as { error?: string }).error ?? message;
      } catch {
        /* not JSON */
      }
      throw new GristError(message, res.status);
    }
    return (text ? JSON.parse(text) : null) as T;
  }
}
