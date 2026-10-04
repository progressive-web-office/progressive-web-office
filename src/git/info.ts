/**
 * GIT-013: who can see a repository and who works on it — its visibility
 * (public, private, or internal to the site on GitLab), the role of the
 * account, and the collaborators with their roles.
 */
import { busyText, h } from '../app/dom';
import { t } from '../i18n';
import { canWrite, type GitClient, type GitRepo, type GitRole, type GitVisibility } from './types';

export const visibilityOf = (repo: GitRepo): GitVisibility => repo.visibility ?? (repo.private ? 'private' : 'public');

const ICON: Record<GitVisibility, string> = { public: '🌐', private: '🔒', internal: '🏢' };

export const roleLabel = (role: GitRole): string => t(`git.role.${role}` as 'git.role.read');

/** `🔒 Private`, with what it means as its title. */
export function visibilityBadge(repo: GitRepo): HTMLElement {
  const v = visibilityOf(repo);
  return h('span', { class: `git-visibility ${v}`, title: t(`git.visibility.${v}Hint` as 'git.visibility.publicHint') }, `${ICON[v]} ${t(`git.visibility.${v}` as 'git.visibility.public')}`);
}

/** The short text of a repository: `🔒 Private · you: maintainer`. */
export function repoSummary(repo: GitRepo): string {
  const v = visibilityOf(repo);
  return `${ICON[v]} ${t(`git.visibility.${v}` as 'git.visibility.public')}${repo.role ? ` · ${t('git.yourRole', { role: roleLabel(repo.role) })}` : ''}`;
}

/** The panel of a repository: visibility, role, and the collaborators (loaded when opened). */
export function repoInfo(client: GitClient | undefined, repo: GitRepo, signedIn: boolean): HTMLElement {
  const v = visibilityOf(repo);
  const people = h('ul', { class: 'git-people' });
  const details = h('details', { class: 'git-collaborators' }, h('summary', {}, t('git.collaborators')), people);
  let loaded = false;
  details.addEventListener('toggle', () => {
    if (!details.open || loaded) return;
    loaded = true;
    if (!client || !signedIn) {
      people.replaceChildren(h('li', { class: 'hint' }, t('git.collaboratorsSignIn')));
      return;
    }
    people.replaceChildren(h('li', { class: 'hint' }, ...busyText(t('git.loading'))));
    client
      .listCollaborators(repo.id)
      .then((list) => {
        people.replaceChildren(
          ...(list.length
            ? list.map((p) => h('li', {}, h('strong', {}, p.name ?? p.login), p.name ? ` (@${p.login})` : '', ' — ', h('span', { class: `git-role ${p.role}` }, roleLabel(p.role)), canWrite(p.role) ? '' : h('span', { class: 'hint' }, ` · ${t('git.readOnlyRole')}`)))
            : [h('li', { class: 'hint' }, t('git.noCollaborators'))]),
        );
      })
      .catch((err: unknown) => {
        const status = (err as { status?: number }).status;
        people.replaceChildren(h('li', { class: 'hint' }, status === 403 || status === 404 || status === 401 ? t('git.collaboratorsHidden') : t('error.git', { message: (err as Error).message })));
      });
  });
  return h(
    'div',
    { class: 'git-info' },
    h('p', {}, visibilityBadge(repo), ' ', h('span', { class: 'hint' }, t(`git.visibility.${v}Hint` as 'git.visibility.publicHint'))),
    h('p', {}, repo.role ? t('git.yourRole', { role: roleLabel(repo.role) }) : signedIn ? '' : t('git.noRoleSignedOut'), repo.role ? h('span', { class: 'hint' }, ` — ${canWrite(repo.role) ? t('git.canWrite') : t('git.cannotWrite')}`) : ''),
    details,
  );
}
