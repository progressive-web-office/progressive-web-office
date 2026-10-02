/** The name comments and annotations are signed with (REV-001, PDF-018). */

const AUTHOR_KEY = 'pwo.comments.author';
const COLLAB_KEY = 'pwo.collab.identity';

/** The name chosen once, else the real-time collaboration name, else ''. */
export function commentAuthor(): string {
  try {
    const own = localStorage.getItem(AUTHOR_KEY);
    if (own) return own;
    const collab = JSON.parse(localStorage.getItem(COLLAB_KEY) ?? 'null') as { name?: string } | null;
    return collab?.name ?? '';
  } catch {
    return '';
  }
}

/** The name, asked once with `question` when there is none. */
export function askAuthor(question: string): string {
  let author = commentAuthor();
  if (!author) {
    author = window.prompt(question, '')?.trim() ?? '';
    if (author) {
      try {
        localStorage.setItem(AUTHOR_KEY, author);
      } catch {
        /* private mode: asked again next time */
      }
    }
  }
  return author;
}
