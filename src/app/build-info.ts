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

/** "v0.0.13 (6cae6fc)", as QRShare shows it. */
export const versionLabel = (): string => `v${BUILD.version} (${shortCommit()})`;
