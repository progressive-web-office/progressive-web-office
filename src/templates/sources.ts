/**
 * FILE-030: templates kept in one's own repository (GitHub, GitLab, Gitea /
 * Forgejo) or cloud folder (Nextcloud / WebDAV), offered in the gallery.
 */
import { basename, walk, type StorageProvider } from '../fs';

export interface TemplateSource {
  id: string;
  kind: 'git' | 'dav';
  /** Shown name. */
  label: string;
  /** git: the address of the repository, maybe of a branch and a folder. */
  url?: string;
  /** dav: the account and the folder. */
  accountId?: string;
  folder?: string;
}

export interface SourceTemplate {
  name: string;
  path: string;
}

const KEY = 'pwo.templateSources';

export function loadSources(): TemplateSource[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? (raw as TemplateSource[]).filter((s) => s && (s.kind === 'git' || s.kind === 'dav') && typeof s.label === 'string') : [];
  } catch {
    return [];
  }
}

function save(sources: TemplateSource[]): void {
  try {
    if (sources.length) localStorage.setItem(KEY, JSON.stringify(sources));
    else localStorage.removeItem(KEY);
  } catch {
    /* not kept */
  }
}

export function addSource(source: Omit<TemplateSource, 'id'>): TemplateSource {
  const id = `${source.kind}:${source.url ?? `${source.accountId}/${source.folder ?? ''}`}`;
  const entry = { ...source, id };
  save([...loadSources().filter((s) => s.id !== id), entry]);
  return entry;
}

export function removeSource(id: string): void {
  save(loadSources().filter((s) => s.id !== id));
}

/** Documents a template can be made of (the folder panel's openable files). */
const TEMPLATE_FILE = /\.(odt|ott|docx|dotx|md|markdown|mdz|tex|ods|ots|xlsx|xltx|csv|odp|otp|pptx|potx|svg|png|jpe?g)$/i;

/** The templates of a folder of a storage, at most `max`, by name. */
export async function templatesIn(provider: StorageProvider, dir: string, max = 300): Promise<SourceTemplate[]> {
  const out: SourceTemplate[] = [];
  for await (const e of walk(provider, dir)) {
    if (!TEMPLATE_FILE.test(e.path) || e.path.split('/').some((p) => p.startsWith('.'))) continue;
    out.push({ name: basename(e.path).replace(/\.[^.]+$/, ''), path: e.path });
    if (out.length >= max) break;
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** The storage of a source and the folder of its templates. */
export async function openSource(source: TemplateSource): Promise<{ provider: StorageProvider; dir: string }> {
  if (source.kind === 'dav') {
    const { loadDavAccounts, davClient, davLabel } = await import('../webdav/ui');
    const { WebDavProvider } = await import('../webdav/provider');
    const account = loadDavAccounts().find((a) => a.id === source.accountId);
    if (!account) throw new Error('The account of this cloud folder is no longer in this browser.');
    return { provider: new WebDavProvider(davClient(account), `webdav:${account.id}`, davLabel(account)), dir: source.folder ?? '' };
  }
  const [{ parseRepoAddress, hostOfApi }, { loadAccounts, clientFor }, { GitRepoProvider }] = await Promise.all([import('../git/url'), import('../git/accounts'), import('../git/provider')]);
  const at = parseRepoAddress(source.url ?? '');
  if (!at) throw new Error('This repository address is not understood.');
  const found = loadAccounts().find((a) => a.provider === at.provider && (a.apiUrl.replace(/\/+$/, '') === at.apiUrl || hostOfApi(a.apiUrl) === at.host));
  // Without an account of the site, a public repository is read without a token.
  const client = clientFor(found ?? { provider: at.provider, apiUrl: at.apiUrl, token: '' });
  const repo = await client.getRepo(at.path);
  return { provider: new GitRepoProvider(client, repo, at.branch ?? repo.defaultBranch), dir: at.isFile ? '' : (at.inside ?? '') };
}
