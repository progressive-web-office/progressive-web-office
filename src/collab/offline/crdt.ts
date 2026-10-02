/**
 * A text document as a Yjs document, for the offline synchronisation
 * (COLLAB-008). The body is a `Y.XmlFragment` mirroring the ProseMirror
 * document, so that concurrent edits merge character by character; the
 * properties, header and footer and sources are small JSON values (the last
 * edit wins); images are kept by their content-addressed id.
 *
 * The editor is not bound live: the document is diffed into the Yjs document
 * before a synchronisation and read back after it.
 */
import * as Y from 'yjs';
import { updateYFragment, yXmlFragmentToProsemirrorJSON } from 'y-prosemirror';
import type { Node as PmNode } from 'prosemirror-model';
import { blocksToPm, pmToBlocks } from '../../document/pm/convert';
import { schema } from '../../document/pm/schema';
import { META_FIELDS, PAGE_NUMBER_FORMATS, cleanPageSetup, type DocumentMeta, type PageSetup, type References, type Resource, type RichDocument } from '../../document/model';

export const BODY = 'body';
export const DOC = 'doc';
export const RESOURCES = 'resources';

/** Limits checked on received content before it reaches the editor. */
export const CRDT_LIMITS = {
  /** Nodes of the document body. */
  nodes: 200_000,
  /** Characters of text in the body. */
  textChars: 5_000_000,
  /** Characters of a JSON property value (properties, page, sources). */
  json: 2_000_000,
  /** Images and their total size. */
  resources: 2_000,
  resourceBytes: 100 * 1024 * 1024,
};

const JSON_KEYS = ['meta', 'page', 'references'] as const;

const stable = (value: unknown): string => JSON.stringify(value ?? null);

/** Write the document into the Yjs document, as a minimal change. */
export function writeCrdt(ydoc: Y.Doc, doc: RichDocument, origin?: unknown): void {
  ydoc.transact(() => {
    const body = ydoc.getXmlFragment(BODY);
    updateYFragment(ydoc, body, blocksToPm(doc.blocks), { mapping: new Map(), isOMark: new Map() });
    const map = ydoc.getMap<string>(DOC);
    const values = { meta: doc.meta, page: cleanPageSetup(doc.page), references: doc.references };
    for (const key of JSON_KEYS) {
      const json = stable(values[key]);
      if (map.get(key) !== json) map.set(key, json);
    }
    const resources = ydoc.getMap<Y.Map<unknown>>(RESOURCES);
    for (const [id, res] of doc.resources) {
      if (resources.has(id)) continue;
      const entry = new Y.Map<unknown>();
      entry.set('data', res.data);
      entry.set('mediaType', res.mediaType);
      if (res.name) entry.set('name', res.name);
      resources.set(id, entry);
    }
  }, origin);
}

function bodyNode(ydoc: Y.Doc): PmNode {
  const json = { type: 'doc', content: yXmlFragmentToProsemirrorJSON(ydoc.getXmlFragment(BODY)).content ?? [] };
  if (!json.content.length) json.content = [{ type: 'paragraph' }];
  const node = schema.nodeFromJSON(json);
  node.check();
  return node;
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

function checkMeta(v: unknown): DocumentMeta {
  if (v === null) return {};
  if (!isRecord(v)) throw new Error('invalid properties');
  for (const [k, x] of Object.entries(v)) {
    if (!(META_FIELDS as readonly string[]).includes(k)) throw new Error(`invalid property ${k}`);
    if (k === 'keywords' ? !isStrings(x) : typeof x !== 'string') throw new Error(`invalid property ${k}`);
  }
  return v as DocumentMeta;
}

function checkPage(v: unknown): PageSetup | undefined {
  if (v === null) return undefined;
  if (!isRecord(v)) throw new Error('invalid page setup');
  for (const [k, zones] of Object.entries(v)) {
    // DOC-029: page numbering settings.
    if (k === 'numberFormat' && (PAGE_NUMBER_FORMATS as readonly unknown[]).includes(zones)) continue;
    if (k === 'startAt' && Number.isInteger(zones) && (zones as number) >= 0) continue;
    if (k === 'hideOnFirstPage' && typeof zones === 'boolean') continue;
    if ((k !== 'header' && k !== 'footer') || !isRecord(zones)) throw new Error('invalid page setup');
    for (const [z, text] of Object.entries(zones)) if (!['left', 'center', 'right'].includes(z) || typeof text !== 'string') throw new Error('invalid page setup');
  }
  return v as PageSetup;
}

function checkReferences(v: unknown): References | undefined {
  if (v === null) return undefined;
  if (!isRecord(v) || !Array.isArray(v.entries)) throw new Error('invalid sources');
  if (v.style !== undefined && v.style !== 'numeric' && v.style !== 'author-year') throw new Error('invalid citation style');
  for (const e of v.entries) {
    if (!isRecord(e) || typeof e.key !== 'string' || typeof e.type !== 'string' || !isRecord(e.fields) || !Object.values(e.fields).every((x) => typeof x === 'string')) throw new Error('invalid source');
  }
  return v as unknown as References;
}

function readJson(ydoc: Y.Doc, key: (typeof JSON_KEYS)[number]): unknown {
  const raw = ydoc.getMap<unknown>(DOC).get(key);
  if (raw === undefined) return null;
  if (typeof raw !== 'string') throw new Error(`invalid ${key}`);
  if (raw.length > CRDT_LIMITS.json) throw new Error(`${key} over the size limit`);
  return JSON.parse(raw);
}

function readResources(ydoc: Y.Doc): Map<string, Resource> {
  const out = new Map<string, Resource>();
  const map = ydoc.getMap<unknown>(RESOURCES);
  if (map.size > CRDT_LIMITS.resources) throw new Error('too many images (limit)');
  let total = 0;
  for (const [id, entry] of map) {
    if (!(entry instanceof Y.Map)) throw new Error('invalid image');
    const data: unknown = entry.get('data');
    const mediaType: unknown = entry.get('mediaType');
    const name: unknown = entry.get('name');
    if (!(data instanceof Uint8Array) || typeof mediaType !== 'string' || !/^image\/[\w.+-]+$/.test(mediaType) || (name !== undefined && typeof name !== 'string')) throw new Error('invalid image');
    total += data.byteLength;
    if (total > CRDT_LIMITS.resourceBytes) throw new Error('images over the size limit');
    out.set(id, { data, mediaType, ...(name ? { name } : {}) });
  }
  return out;
}

function checkLimits(node: PmNode): void {
  let nodes = 0;
  let chars = 0;
  node.descendants((n) => {
    nodes++;
    if (n.isText) chars += n.text!.length;
    if (nodes > CRDT_LIMITS.nodes || chars > CRDT_LIMITS.textChars) throw new Error('document over the size limit');
  });
}

/**
 * The document held by the Yjs document. Throws when it is not a valid
 * document of the editor's schema or goes over the limits.
 */
export function readCrdt(ydoc: Y.Doc): RichDocument {
  const node = bodyNode(ydoc);
  checkLimits(node);
  const meta = checkMeta(readJson(ydoc, 'meta'));
  const page = checkPage(readJson(ydoc, 'page'));
  const references = checkReferences(readJson(ydoc, 'references'));
  return { blocks: pmToBlocks(node), meta, resources: readResources(ydoc), ...(page ? { page } : {}), ...(references ? { references } : {}) };
}

/** Why the Yjs document is not a valid text document, or null when it is. */
export function validateCrdt(ydoc: Y.Doc): string | null {
  try {
    readCrdt(ydoc);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
