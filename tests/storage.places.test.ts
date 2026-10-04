import { beforeEach, describe, expect, it } from 'vitest';
import { parseRepoAddress, repoWebUrl } from '../src/git/url';
import { forgetPlace, forgetPlaces, forgetPlacesOfAccount, loadPlaces, MAX_PLACES, originsEnabled, placesEnabled, rememberPlace, setOriginsEnabled, setPlacesEnabled } from '../src/storage/places';

describe('FILE-028 network places remembered', () => {
  beforeEach(() => localStorage.clear());

  it('remembers places, the last used first, once each', () => {
    rememberPlace({ kind: 'git', url: 'https://github.com/a/b', label: 'a/b', accountId: 'x' }, 1);
    rememberPlace({ kind: 'dav', url: 'https://cloud.example.org/remote.php/dav/files/me/', label: 'me@cloud.example.org', folder: 'Docs' }, 2);
    rememberPlace({ kind: 'git', url: 'https://github.com/a/b', label: 'a/b', accountId: 'x' }, 3);
    expect(loadPlaces().map((p) => [p.id, p.lastUsed])).toEqual([
      ['git:https://github.com/a/b', 3],
      ['dav:https://cloud.example.org/remote.php/dav/files/me/', 2],
    ]);
    for (let i = 0; i < MAX_PLACES + 3; i++) rememberPlace({ kind: 'git', url: `https://github.com/a/r${i}`, label: `a/r${i}` }, 10 + i);
    expect(loadPlaces()).toHaveLength(MAX_PLACES);
  });

  it('forgets one place, the account of places, or all of them', () => {
    rememberPlace({ kind: 'git', url: 'https://github.com/a/b', label: 'a/b', accountId: 'x' });
    rememberPlace({ kind: 'git', url: 'https://github.com/a/c', label: 'a/c', accountId: 'x' });
    forgetPlace('git:https://github.com/a/b');
    expect(loadPlaces().map((p) => p.label)).toEqual(['a/c']);
    forgetPlacesOfAccount('x');
    expect(loadPlaces()[0]!.accountId).toBeUndefined();
    forgetPlaces();
    expect(loadPlaces()).toEqual([]);
  });

  it('remembers nothing when turned off, and forgets what it had', () => {
    rememberPlace({ kind: 'git', url: 'https://github.com/a/b', label: 'a/b' });
    setPlacesEnabled(false);
    expect(placesEnabled()).toBe(false);
    expect(loadPlaces()).toEqual([]);
    expect(rememberPlace({ kind: 'git', url: 'https://github.com/a/b', label: 'a/b' })).toBeUndefined();
    setPlacesEnabled(true);
    expect(rememberPlace({ kind: 'git', url: 'https://github.com/a/b', label: 'a/b' })).toBeDefined();
  });

  it('keeps origins unless turned off (FILE-029)', () => {
    expect(originsEnabled()).toBe(true);
    setOriginsEnabled(false);
    expect(originsEnabled()).toBe(false);
  });

  it('writes repository addresses that read back (FILE-029)', () => {
    const gh = repoWebUrl('github', 'https://api.github.com', 'me/notes', 'main', 'docs/report été.odt', true);
    expect(gh).toBe('https://github.com/me/notes/blob/main/docs/report%20%C3%A9t%C3%A9.odt');
    expect(parseRepoAddress(gh)).toMatchObject({ provider: 'github', path: 'me/notes', branch: 'main', inside: 'docs/report été.odt', isFile: true });
    const gl = repoWebUrl('gitlab', 'https://gitlab.example.org/api/v4', 'group/sub/proj', 'dev', 'a');
    expect(gl).toBe('https://gitlab.example.org/group/sub/proj/-/tree/dev/a');
    expect(parseRepoAddress(gl)).toMatchObject({ provider: 'gitlab', path: 'group/sub/proj', branch: 'dev', inside: 'a' });
    expect(repoWebUrl('github', 'https://api.github.com', 'me/notes')).toBe('https://github.com/me/notes');
  });
});
