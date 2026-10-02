/**
 * The user's name (SET-003), set once in the settings or asked the first time
 * it is needed: it signs comments, annotations and tracked changes (REV-001,
 * PDF-018) and shows the user in a collaboration (COLLAB-003).
 */

const AUTHOR_KEY = 'pwo.comments.author';

/** The name chosen once, else ''. */
export function commentAuthor(): string {
  try {
    return localStorage.getItem(AUTHOR_KEY) ?? '';
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

/** Set the name (the settings window); an empty name is asked again when needed. */
export function saveAuthor(name: string): void {
  try {
    if (name.trim()) localStorage.setItem(AUTHOR_KEY, name.trim());
    else localStorage.removeItem(AUTHOR_KEY);
  } catch {
    /* storage unavailable */
  }
}
