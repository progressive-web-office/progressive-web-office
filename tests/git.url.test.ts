import { describe, expect, it } from 'vitest';
import { hostOfApi, parseRepoAddress, tokenPage } from '../src/git/url';

describe('GIT-008 a repository by its address', () => {
  it('reads GitHub addresses', () => {
    expect(parseRepoAddress('https://github.com/s-celles/test-pwo')).toEqual({ provider: 'github', host: 'github.com', apiUrl: 'https://api.github.com', path: 's-celles/test-pwo' });
    expect(parseRepoAddress('github.com/s-celles/test-pwo.git')?.path).toBe('s-celles/test-pwo');
    expect(parseRepoAddress('git@github.com:s-celles/test-pwo.git')?.path).toBe('s-celles/test-pwo');
    expect(parseRepoAddress('https://github.com/s-celles/test-pwo/tree/dev/docs/notes')).toMatchObject({ branch: 'dev', inside: 'docs/notes' });
    expect(parseRepoAddress('https://github.com/s-celles/test-pwo/blob/main/README.md')).toMatchObject({ branch: 'main', inside: 'README.md', isFile: true });
    expect(parseRepoAddress('https://github.example.org/team/repo')).toMatchObject({ provider: 'github', apiUrl: 'https://github.example.org/api/v3' });
  });

  it('reads GitLab addresses, with groups and self-hosted sites', () => {
    expect(parseRepoAddress('https://gitlab.com/group/sub/project')).toEqual({ provider: 'gitlab', host: 'gitlab.com', apiUrl: 'https://gitlab.com/api/v4', path: 'group/sub/project' });
    expect(parseRepoAddress('https://gitlab.com/group/project/-/tree/main/src')).toMatchObject({ path: 'group/project', branch: 'main', inside: 'src' });
    expect(parseRepoAddress('https://forge.example.org/team/project/-/blob/main/a.md')).toMatchObject({ provider: 'gitlab', apiUrl: 'https://forge.example.org/api/v4', path: 'team/project', isFile: true });
    expect(parseRepoAddress('git@gitlab.example.org:team/project.git')).toMatchObject({ provider: 'gitlab', host: 'gitlab.example.org' });
  });

  it('refuses what is not a repository', () => {
    expect(parseRepoAddress('owner/name')).toBeUndefined();
    expect(parseRepoAddress('https://github.com/s-celles')).toBeUndefined();
    expect(parseRepoAddress('not a url')).toBeUndefined();
  });

  it('GIT-009 knows where tokens are made', () => {
    expect(tokenPage('github', 'github.com')).toBe('https://github.com/settings/personal-access-tokens/new');
    expect(tokenPage('gitlab', 'gitlab.com')).toBe('https://gitlab.com/-/user_settings/personal_access_tokens');
    expect(hostOfApi('https://api.github.com')).toBe('github.com');
    expect(hostOfApi('https://gitlab.example.org/api/v4')).toBe('gitlab.example.org');
  });
});
