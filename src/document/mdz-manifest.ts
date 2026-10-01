/**
 * MDZ manifest model and validation (MD-005, MD-006, MD-007).
 * Mirrors `schemas/mdz-manifest-1.schema.json` (kept in sync by tests).
 */

/** MDZ specification version written by this application. */
export const MDZ_VERSION = '1.1.0';
export const MDZ_SUPPORTED_MAJOR = 1;

export interface MdzAsset {
  id: string;
  path: string;
  type: string;
  alt?: string;
  title?: string;
  [extra: string]: unknown;
}

export interface MdzManifest {
  version: string;
  title: string;
  author?: string | null;
  date?: string | null;
  filename?: string | null;
  /** Progressive Web Office extensions for document properties (DOC-017). */
  subject?: string | null;
  description?: string | null;
  keywords?: string[] | string | null;
  language?: string | null;
  license?: string | null;
  assets?: MdzAsset[];
  [extra: string]: unknown;
}

export type ValidationResult = { ok: true; manifest: MdzManifest } | { ok: false; errors: string[] };

/** Archive-relative path without leading slash, backslash or `..` segment. */
export function isSafeArchivePath(path: string): boolean {
  if (!path || path.startsWith('/') || path.includes('\\')) return false;
  return !path.split('/').some((seg) => seg === '..');
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const optString = (v: unknown): boolean => v === undefined || v === null || typeof v === 'string';

export function validateManifest(value: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) return { ok: false, errors: ['the manifest must be a JSON object'] };
  const version = value.version;
  if (typeof version !== 'string') {
    errors.push('"version" is required and must be a string');
  } else {
    const m = /^(0|[1-9]\d*)\.(0|[1-9]\d*)(\.(0|[1-9]\d*))?$/.exec(version);
    if (!m) errors.push(`"version" must be a semantic version, got "${version}"`);
    else if (Number(m[1]) !== MDZ_SUPPORTED_MAJOR) errors.push(`unsupported MDZ version ${version} (this application supports version ${MDZ_SUPPORTED_MAJOR}.x)`);
  }
  if (typeof value.title !== 'string') errors.push('"title" is required and must be a string');
  // Lenient: other tools may write keywords as one comma-separated string.
  if (value.keywords !== undefined && value.keywords !== null && typeof value.keywords !== 'string' && (!Array.isArray(value.keywords) || !value.keywords.every((k) => typeof k === 'string'))) errors.push('"keywords" must be an array of strings');
  for (const key of ['author', 'date', 'filename', 'subject', 'description', 'language', 'license']) {
    if (!optString(value[key])) errors.push(`"${key}" must be a string or null`);
  }
  if (value.assets !== undefined) {
    if (!Array.isArray(value.assets)) {
      errors.push('"assets" must be an array');
    } else {
      value.assets.forEach((a: unknown, i: number) => {
        if (!isObject(a)) {
          errors.push(`assets[${i}] must be an object`);
          return;
        }
        if (typeof a.id !== 'string' || !a.id) errors.push(`assets[${i}].id is required`);
        if (typeof a.type !== 'string' || !a.type) errors.push(`assets[${i}].type is required`);
        if (typeof a.path !== 'string' || !isSafeArchivePath(a.path)) errors.push(`assets[${i}].path must be a safe relative path`);
        if (a.alt !== undefined && typeof a.alt !== 'string') errors.push(`assets[${i}].alt must be a string`);
        if (a.title !== undefined && typeof a.title !== 'string') errors.push(`assets[${i}].title must be a string`);
      });
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, manifest: value as MdzManifest };
}

/** Asset category used in `assets/<category>/` and the manifest `type`. */
export function assetCategory(mediaType: string): 'image' | 'video' | 'audio' | 'file' {
  if (mediaType.startsWith('image/')) return 'image';
  if (mediaType.startsWith('video/')) return 'video';
  if (mediaType.startsWith('audio/')) return 'audio';
  return 'file';
}
