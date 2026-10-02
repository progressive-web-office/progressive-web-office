/** Paths of the file system module: `/`-separated, relative to a provider root. */
import { FsError } from './types';

/** `a//b/./c/../d/` → `a/b/d`; refuses to climb above the root. */
export function normalize(path: string): string {
  const out: string[] = [];
  for (const seg of path.replace(/\\/g, '/').split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      if (!out.length) throw new FsError('Invalid', path, `Path leaves the root: ${path}`);
      out.pop();
    } else out.push(seg);
  }
  return out.join('/');
}

export const join = (...parts: string[]): string => normalize(parts.filter(Boolean).join('/'));
export const dirname = (path: string): string => {
  const p = normalize(path);
  return p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
};
export const basename = (path: string): string => normalize(path).split('/').pop() ?? '';
export const extname = (path: string): string => {
  const b = basename(path);
  const i = b.lastIndexOf('.');
  return i > 0 ? b.slice(i).toLowerCase() : '';
};

/** `target` as written from a file at `from` (`../b/c.md`). */
export function relative(from: string, target: string): string {
  const a = dirname(from).split('/').filter(Boolean);
  const b = normalize(target).split('/');
  let common = 0;
  while (common < a.length && common < b.length - 1 && a[common] === b[common]) common++;
  return [...Array(a.length - common).fill('..'), ...b.slice(common)].join('/');
}

/** A link `href` written in the file at `from`, as a path from the root. */
export const resolve = (from: string, href: string): string => (href.startsWith('/') ? normalize(href) : join(dirname(from), href));

/** Whether `path` is `dir` or inside it. */
export const isInside = (path: string, dir: string): boolean => !dir || path === dir || path.startsWith(`${dir}/`);

/** Names a file system accepts on every platform. */
export function checkName(name: string): string {
  const n = name.trim();
  if (!n || n === '.' || n === '..' || /[\\/:*?"<>|\u0000-\u001f]/.test(n)) throw new FsError('Invalid', name, `Invalid name: ${name}`);
  return n;
}

export const byKindThenName = (a: { kind: string; name: string }, b: { kind: string; name: string }): number =>
  a.kind === b.kind ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) : a.kind === 'directory' ? -1 : 1;
