/** Version and git commit of this build, injected by Vite (UI-012, UI-013), and its dependencies (UI-017). */
import type { Dependency } from './dependencies';
declare const __APP_VERSION__: string;
declare const __GIT_COMMIT__: string;
declare const __BUILD_DATE__: string;
declare const __DEPENDENCIES__: Dependency[];

export const BUILD = {
  version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0',
  commit: typeof __GIT_COMMIT__ === 'string' && __GIT_COMMIT__ ? __GIT_COMMIT__ : 'unknown',
  date: typeof __BUILD_DATE__ === 'string' ? __BUILD_DATE__ : new Date(0).toISOString(),
  dependencies: typeof __DEPENDENCIES__ !== 'undefined' && Array.isArray(__DEPENDENCIES__) ? __DEPENDENCIES__ : [],
};

export const shortCommit = (): string => (BUILD.commit === 'unknown' ? BUILD.commit : BUILD.commit.slice(0, 7));

/**
 * UI-012: the version with the date of the build as Semantic Versioning
 * build metadata — `0.1.0+20261004`: the date tells how recent a build is,
 * and is ignored when versions are compared (semver §10).
 */
export function semverWithDate(version: string, isoDate: string): string {
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!day || isoDate.startsWith('1970-')) return version;
  const core = version.replace(/\+.*$/, '');
  return `${core}+${day[1]}${day[2]}${day[3]}`;
}

export const fullVersion = (): string => semverWithDate(BUILD.version, BUILD.date);

/** "v0.1.0+20261004 (6cae6fc)". */
export const versionLabel = (): string => `v${fullVersion()} (${shortCommit()})`;
