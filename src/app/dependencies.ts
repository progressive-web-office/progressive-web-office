/**
 * The open-source components shipped with the app (UI-017): read from
 * package.json and node_modules at build time (see vite.config.ts), shown in
 * the About window. Runs in Node at build time and in tests, not in the app.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Dependency {
  name: string;
  version: string;
  license: string;
  /** Project page, when known. */
  url?: string;
}

interface PackageJson {
  version?: string;
  license?: string | { type?: string };
  homepage?: string;
  repository?: string | { url?: string };
  dependencies?: Record<string, string>;
}

const https = (url: string | undefined): string | undefined => {
  try {
    return url && new URL(url).protocol === 'https:' ? url.replace(/#readme$/, '') : undefined;
  } catch {
    return undefined;
  }
};

/** A web address for a package: its https homepage, else its repository; `spec` is the dependency range (e.g. `github:owner/repo#tag`). */
export function projectUrl(pkg: Pick<PackageJson, 'homepage' | 'repository'>, spec = ''): string | undefined {
  const home = https(pkg.homepage);
  if (home) return home;
  const repo = (typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url) || spec;
  // "owner/repo" and "github:owner/repo#ref" are GitHub shorthands.
  const short = /^(?:github:)?([\w.-]+\/[\w.-]+?)(?:\.git)?(?:#.*)?$/.exec(repo);
  if (short) return `https://github.com/${short[1]}`;
  const m = /^(?:git\+)?(?:https?|git|ssh):\/\/(?:git@)?([^/]+)\/(.+?)(?:\.git)?$/.exec(repo) ?? /^git@([^:]+):(.+?)(?:\.git)?$/.exec(repo);
  return m ? `https://${m[1]}/${m[2]}` : undefined;
}

/** The runtime dependencies of the project at `root`, with the versions installed in node_modules. */
export function runtimeDependencies(root: string): Dependency[] {
  const read = (path: string): PackageJson => JSON.parse(readFileSync(path, 'utf8')) as PackageJson;
  const ranges = read(join(root, 'package.json')).dependencies ?? {};
  return Object.keys(ranges)
    .filter((name) => !name.startsWith('@types/'))
    .sort()
    .map((name) => {
      const pkg = read(join(root, 'node_modules', name, 'package.json'));
      const license = typeof pkg.license === 'string' ? pkg.license : (pkg.license?.type ?? '?');
      const url = projectUrl(pkg, ranges[name]);
      return { name, version: pkg.version ?? '?', license, ...(url ? { url } : {}) };
    });
}
