import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';

// PLUG-009, PLUG-010, SIGN-003: the formats shared with DigitalSignalix, as JSON Schemas.

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');
const schema = (name: string): Record<string, unknown> => JSON.parse(read(`schemas/${name}`)) as Record<string, unknown>;

// Strict, but for conditional `required` (allowed by the standard, refused by Ajv's strictRequired).
const ajv = new Ajv2020({ strict: true, strictRequired: false, allowUnionTypes: true, allErrors: true });
ajv.addFormat('date-time', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/);
ajv.addFormat('uri', /^[a-z][a-z0-9+.-]*:[^\s]*$/i);
const NAMES = ['plugin-manifest-1.schema.json', 'plugin-registry-1.schema.json', 'plugin-message-1.schema.json', 'provenance-1.schema.json'];
for (const name of NAMES) ajv.addSchema(schema(name));
const validate = (name: string, value: unknown): boolean => {
  const fn = ajv.getSchema(`https://progressive-web-office.github.io/schemas/${name}`)!;
  const ok = fn(value) as boolean;
  if (!ok && process.env.SHOW_ERRORS) console.log(name, fn.errors);
  return ok;
};

/** The JSON blocks of a page of the documentation. */
const blocks = (page: string): unknown[] => [...read(page).matchAll(/```json\n([\s\S]*?)\n```/g)].map((m) => JSON.parse(m[1]!) as unknown);

/** The schema a document of the docs follows, by its version field. */
function schemaOf(doc: Record<string, unknown>): string | undefined {
  if ('manifestVersion' in doc) return 'plugin-manifest-1.schema.json';
  if ('registryVersion' in doc) return 'plugin-registry-1.schema.json';
  if (doc.type === 'pwo-plugin') return 'plugin-message-1.schema.json';
  if ('provenanceVersion' in doc) return 'provenance-1.schema.json';
  return undefined;
}

const manifest = () => (blocks('docs/plugins.md') as Record<string, unknown>[]).find((d) => 'manifestVersion' in d)!;
const registry = () => (blocks('docs/plugins.md') as Record<string, unknown>[]).find((d) => 'registryVersion' in d)! as { plugins: { versions: Record<string, unknown>[] }[] };

describe('PLUG-009 PLUG-010 SIGN-003 JSON Schemas', () => {
  it('are draft 2020-12 schemas with their address, a title, and room for what is not known yet', () => {
    for (const name of NAMES) {
      const s = schema(name);
      expect(s.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
      expect(s.$id).toBe(`https://progressive-web-office.github.io/schemas/${name}`);
      expect(s.title).toMatch(/version 1$/);
      expect(String(s.description).length).toBeGreaterThan(80);
      expect(s.additionalProperties).toBe(true);
    }
  });

  it('accept every example of the documentation', () => {
    const seen: Record<string, number> = {};
    for (const page of ['docs/plugins.md', 'docs/digitalsignalix.md']) {
      for (const doc of blocks(page) as Record<string, unknown>[]) {
        const name = schemaOf(doc);
        if (name) {
          expect(validate(name, doc), `${page}: ${JSON.stringify(doc).slice(0, 80)}`).toBe(true);
          seen[name] = (seen[name] ?? 0) + 1;
          continue;
        }
        // The presentation sent to a Manager is DigitalSignalix's format; its provenance is PWO's.
        expect(doc).toHaveProperty('slides');
        expect(validate('provenance-1.schema.json', doc.provenance)).toBe(true);
        seen['provenance-1.schema.json'] = (seen['provenance-1.schema.json'] ?? 0) + 1;
      }
    }
    expect(seen).toEqual({ 'plugin-manifest-1.schema.json': 1, 'plugin-registry-1.schema.json': 1, 'plugin-message-1.schema.json': 4, 'provenance-1.schema.json': 2 });
  });

  it('allow unknown fields, targets and actions (hosts ignore them)', () => {
    expect(validate('plugin-manifest-1.schema.json', { ...manifest(), targets: ['signage', 'kiosk'], 'x-colour': 'blue' })).toBe(true);
    expect(validate('plugin-message-1.schema.json', { type: 'pwo-plugin', version: 1, action: 'playlist.next', extra: true })).toBe(true);
  });

  it('refuse manifests that are not valid', () => {
    const m = manifest();
    const { entry: _entry, ...noEntry } = m;
    for (const bad of [
      { ...m, manifestVersion: 2 },
      { ...m, id: 'Menu Board' },
      { ...m, version: '1.2' },
      { ...m, targets: [] },
      { ...m, kind: 'script' },
      noEntry, // code needs its page
      { ...m, kind: 'pack' }, // a pack needs its contents
      { ...m, entry: '../outside.html' },
      { ...m, permissions: { network: ['https://api.example.org/'] } }, // a host name, not an address
      { ...m, permissions: { document: 'everything' } },
    ]) {
      expect(validate('plugin-manifest-1.schema.json', bad), JSON.stringify(bad).slice(0, 120)).toBe(false);
    }
    expect(validate('plugin-manifest-1.schema.json', { manifestVersion: 1, id: 'school-templates', name: 'School templates', version: '1.0.0', license: 'CC-BY-4.0', kind: 'pack', targets: ['pwo'], contents: { templates: ['letter.odt', 'report.docx'], symbols: 'symbols/' } })).toBe(true);
  });

  it('refuse registries that are not valid', () => {
    const r = registry();
    const version = r.plugins[0]!.versions[0]!;
    const withVersion = (v: Record<string, unknown>) => ({ ...r, plugins: [{ ...r.plugins[0], versions: [v] }] });
    expect(validate('plugin-registry-1.schema.json', withVersion(version))).toBe(true);
    for (const bad of [
      { ...r, registryVersion: 2 },
      withVersion({ ...version, files: { 'manifest.json': 'ABC' } }), // not a SHA-256 in lowercase hexadecimal
      withVersion({ ...version, files: { 'index.html': 'a'.repeat(64) } }), // without its manifest
      withVersion({ ...version, base: 'http://example.org/plugin/' }), // not HTTPS
      withVersion({ ...version, revoked: { date: '2026-09-20' } }), // no reason, no time
      { ...r, plugins: [{ ...r.plugins[0], versions: [] }] },
    ]) {
      expect(validate('plugin-registry-1.schema.json', bad), JSON.stringify(bad).slice(0, 120)).toBe(false);
    }
  });

  it('refuse messages that are not valid', () => {
    const env = { type: 'pwo-plugin', version: 1 };
    for (const bad of [
      { ...env, type: 'qrshare-handoff', action: 'ready', api: 1 },
      { ...env, version: 2, action: 'ready', api: 1 },
      { ...env, action: 'ready' }, // without its version of the protocol
      { ...env, action: 'init', locale: 'fr' }, // incomplete
      { ...env, action: 'visibility', visible: 'yes' },
      { ...env, action: 'fetch', url: 'https://api.example.org' }, // a request without its id
      { ...env, action: 'fetch', id: 1, url: 'file:///etc/passwd' },
      { ...env, action: 'reply', id: 1 }, // neither result nor error
      { ...env, action: 'reply', id: 1, result: {}, error: { code: 'x', message: '' } }, // both
      { ...env, action: 'data', data: { menu: { mediaType: 'text/csv' } } }, // neither bytes nor table
      { ...env, action: 'document.write', text: 'x' }, // a request without its id
    ]) {
      expect(validate('plugin-message-1.schema.json', bad), JSON.stringify(bad)).toBe(false);
    }
  });

  it('refuse provenance records that are not valid', () => {
    const p = { provenanceVersion: 1, tool: { name: 'Progressive Web Office', version: '0.3.0' }, source: { name: 'a.odp', mediaType: 'application/vnd.oasis.opendocument.presentation', sha256: 'f'.repeat(64) }, created: '2026-10-04T09:30:00Z' };
    expect(validate('provenance-1.schema.json', p)).toBe(true);
    for (const bad of [
      { ...p, provenanceVersion: 2 },
      { ...p, created: '2026-10-04T11:30:00+02:00' }, // not in UTC
      { ...p, source: { ...p.source, sha256: 'F'.repeat(64) } },
      { ...p, slide: 0 },
      { ...p, tool: { name: 'PWO' } },
    ]) {
      expect(validate('provenance-1.schema.json', bad), JSON.stringify(bad)).toBe(false);
    }
  });
});
