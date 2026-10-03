/**
 * CODE-019: a folder is a project. The file run, the other files of its
 * folder (modules, headers, data) and an optional `pwo.toml` naming the entry
 * point and its options are copied into the sandbox under `/project`.
 *
 * No imports: the sandbox worker bundles this module.
 */

/** Options of `pwo.toml`. */
export interface ProjectConfig {
  /** The file to run, relative to the project, whatever file is open. */
  main?: string;
  /** Arguments of the program (`sys.argv[1:]`, `argv`, `commandArgs(TRUE)`). */
  args?: string[];
  /** Options of the C/C++ compiler. */
  cflags?: string[];
  /** C/C++ files compiled together (patterns with `*`); by default those of the entry point's folder. */
  sources?: string[];
  /** A file read as the standard input. */
  stdin?: string;
}

/** What the sandbox receives. */
export interface RunProject {
  /** Files by path relative to the project. */
  files: Record<string, Uint8Array>;
  /** The entry point, relative to the project. */
  entry: string;
  config: ProjectConfig;
}

export interface Project extends RunProject {
  /** The project folder, relative to the open folder ('' for its root). */
  root: string;
  /** Files left out (too large, or beyond the limits). */
  skipped: string[];
}

/** Where the project is copied in the sandbox. */
export const PROJECT_DIR = '/project';

/** Files that mark the root of a project. */
const MARKERS = ['pwo.toml', 'pyproject.toml', 'setup.py', 'package.json', 'tsconfig.json', 'CMakeLists.txt', 'Makefile', 'DESCRIPTION'];

/** Folders never copied: version control, dependencies, caches, environments. */
const IGNORED = new Set(['node_modules', '__pycache__', 'venv', 'env', 'build', 'target']);

const dirname = (p: string): string => p.slice(0, Math.max(0, p.lastIndexOf('/')));
const join = (dir: string, name: string): string => (dir ? `${dir}/${name}` : name);

/** The folder of the file, or the nearest folder above it holding a project file. */
export function projectRoot(paths: readonly string[], file: string): string {
  const all = new Set(paths);
  for (let dir = dirname(file); ; dir = dirname(dir)) {
    if (MARKERS.some((m) => all.has(join(dir, m)))) return dir;
    if (!dir) break;
  }
  return dirname(file);
}

/** The same as `projectRoot`, listing the folders above the file one by one. */
export async function findProjectRoot(file: string, children: (dir: string) => Promise<string[]>): Promise<string> {
  for (let dir = dirname(file); ; dir = dirname(dir)) {
    const names = new Set(await children(dir).catch(() => []));
    if (MARKERS.some((m) => names.has(m))) return dir;
    if (!dir) break;
  }
  return dirname(file);
}

/** The files of a project, relative to it. */
export function projectPaths(paths: readonly string[], root: string): string[] {
  const prefix = root ? `${root}/` : '';
  return paths
    .filter((p) => p.startsWith(prefix))
    .map((p) => p.slice(prefix.length))
    .filter((p) => !p.split('/').some((part, i, parts) => (i < parts.length - 1 && (part.startsWith('.') || IGNORED.has(part))) || part === '.DS_Store'))
    .sort();
}

/** Read `pwo.toml`: keys with a string or an array of strings (a subset of TOML). */
export function parsePwoToml(text: string): ProjectConfig {
  const config: Record<string, string | string[]> = {};
  const lines = text.split(/\r?\n/);
  const fail = (n: number, why: string): never => {
    throw new Error(`pwo.toml, line ${n + 1}: ${why}`);
  };
  // Strings in double (with escapes) or single quotes; comments after #.
  const STRING = /^\s*("(?:[^"\\]|\\.)*"|'[^']*')\s*/;
  const unquote = (s: string): string => (s.startsWith('"') ? (JSON.parse(s) as string) : s.slice(1, -1));
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line || line.startsWith('#') || line.startsWith('[')) continue;
    const m = /^([A-Za-z_][\w-]*)\s*=\s*(.*)$/.exec(line);
    if (!m) fail(i, 'expected key = value');
    const key = m![1]!;
    let rest = m![2]!;
    if (rest.startsWith('[')) {
      // An array, maybe over several lines.
      const start = i;
      rest = rest.slice(1);
      const items: string[] = [];
      for (;;) {
        rest = rest.replace(/^[\s,]*/, '');
        if (!rest || rest.startsWith('#')) {
          if (++i >= lines.length) fail(start, 'unclosed array');
          rest = lines[i]!.trim();
          continue;
        }
        if (rest.startsWith(']')) break;
        const s = STRING.exec(rest);
        if (!s) fail(i, 'expected a string in the array');
        items.push(unquote(s![1]!));
        rest = rest.slice(s![0].length);
      }
      config[key] = items;
    } else {
      const s = STRING.exec(rest);
      // Numbers and booleans are accepted, and ignored.
      if (!s) {
        if (/^(true|false|[-+]?\d[\d_.eE+-]*)\s*(#.*)?$/.test(rest)) continue;
        fail(i, 'expected a string');
      }
      config[key] = unquote(s![1]!);
    }
  }
  const out: ProjectConfig = {};
  const str = (k: 'main' | 'stdin'): void => void (typeof config[k] === 'string' && (out[k] = config[k] as string));
  const list = (k: 'args' | 'cflags' | 'sources'): void => {
    const v = config[k];
    if (v !== undefined) out[k] = Array.isArray(v) ? v : [v];
  };
  str('main');
  list('args');
  list('cflags');
  list('sources');
  str('stdin');
  return out;
}

export interface ProjectLimits {
  maxFiles: number;
  maxFileBytes: number;
  maxBytes: number;
}

const LIMITS: ProjectLimits = { maxFiles: 2000, maxFileBytes: 10 * 1024 * 1024, maxBytes: 50 * 1024 * 1024 };

/**
 * The project of `file` (a path of the open folder): its files, with `text`
 * (being edited, maybe not saved) for `file`, and its entry point.
 */
export async function loadProject(
  paths: readonly string[],
  file: string,
  text: string,
  read: (path: string) => Promise<Uint8Array>,
  limits: Partial<ProjectLimits> = {},
  size?: (path: string) => number | undefined,
): Promise<Project> {
  const { maxFiles, maxFileBytes, maxBytes } = { ...LIMITS, ...limits };
  const root = projectRoot(paths, file);
  const self = file.slice(root ? root.length + 1 : 0);
  const files: Record<string, Uint8Array> = {};
  const skipped: string[] = [];
  let total = 0;
  for (const p of projectPaths(paths, root)) {
    if (p === self) {
      files[p] = new TextEncoder().encode(text);
      continue;
    }
    if (p === 'pwo.toml') {
      files[p] = await read(join(root, p));
      continue;
    }
    const known = size?.(p);
    if (Object.keys(files).length >= maxFiles || (known !== undefined && (known > maxFileBytes || total + known > maxBytes))) {
      skipped.push(p);
      continue;
    }
    const bytes = await read(join(root, p));
    if (bytes.length > maxFileBytes || total + bytes.length > maxBytes) {
      skipped.push(p);
      continue;
    }
    files[p] = bytes;
    total += bytes.length;
  }
  files[self] ??= new TextEncoder().encode(text);
  const toml = files['pwo.toml'];
  const config = toml ? parsePwoToml(new TextDecoder().decode(toml)) : {};
  const main = config.main?.replace(/^\.\//, '');
  if (main && !(main in files)) throw new Error(`pwo.toml: main = "${config.main}" is not a file of the project`);
  return { root, entry: main ?? self, files, config, skipped };
}

/** Normalise `a/./b/../c` into `a/c`; undefined when it leaves the project. */
export function normalise(path: string): string | undefined {
  const out: string[] = [];
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!out.length) return undefined;
      out.pop();
    } else out.push(part);
  }
  return out.join('/');
}

/** The file a relative import of `from` names in a JavaScript project. */
export function resolveModule(files: ReadonlySet<string>, from: string, spec: string): string | undefined {
  const base = normalise(join(dirname(from), spec));
  if (base === undefined) return undefined;
  // TypeScript names its modules with the extension of their output (`./util.js` for util.ts).
  const ts = base.replace(/\.(m?)js$/, '.$1ts');
  for (const candidate of [base, ts, ...['.js', '.mjs', '.ts', '.mts', '.json'].map((e) => base + e), ...['index.js', 'index.mjs', 'index.ts'].map((i) => join(base, i))]) {
    if (files.has(candidate)) return candidate;
  }
  return undefined;
}

/** Rewrite the relative imports of a JavaScript module (`from "./x"`, `import "./x"`, `import("./x")`). */
export function rewriteImports(code: string, map: (spec: string) => string): string {
  return code.replace(/(\bfrom\s*|\bimport\s*\(?\s*)(["'])(\.{1,2}\/[^"']*)\2/g, (_all, head: string, quote: string, spec: string) => `${head}${quote}${map(spec)}${quote}`);
}

/** Whether a project path matches a pattern of `sources` (`*` within a folder, `**` across folders). */
export function matches(pattern: string, path: string): boolean {
  const re = pattern
    .replace(/^\.\//, '')
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\/?/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\u0000/g, '(?:.*/)?');
  return new RegExp(`^${re}$`).test(path);
}

const C_SOURCE = /\.(c|cc|cpp|cxx|c\+\+)$/i;

/** The C/C++ files compiled with the entry point: those of `sources`, or those of its folder. */
export function cSources(project: RunProject): string[] {
  const all = Object.keys(project.files).filter((p) => C_SOURCE.test(p));
  const chosen = project.config.sources ? all.filter((p) => project.config.sources!.some((s) => matches(s, p))) : all.filter((p) => dirname(p) === dirname(project.entry));
  return [project.entry, ...chosen.filter((p) => p !== project.entry).sort()];
}
