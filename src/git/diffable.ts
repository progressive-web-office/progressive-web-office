/**
 * GIT-010: formats Git can compare. A repository keeps every version and
 * shows what changed between two of them line by line — only for text files:
 * a `.docx` or `.odt` is a zip archive, a new opaque blob at each commit.
 * Text formats are proposed first, without being imposed.
 */

/** Extensions of text formats, in order of preference. */
const TEXT_EXTENSIONS = ['md', 'tex', 'csv', 'jl', 'py', 'txt'];

export const isDiffable = (ext: string): boolean => TEXT_EXTENSIONS.includes(ext.toLowerCase());

const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase();
};

/** `name` with extension `ext` (replacing its own, or added). */
export function withExtension(name: string, ext: string): string {
  const dot = name.lastIndexOf('.');
  return `${dot > 0 ? name.slice(0, dot) : name}.${ext}`;
}

/**
 * The extensions offered when saving to a repository: text formats first,
 * then the others, each once.
 */
export function orderForGit(exts: string[]): { text: string[]; binary: string[] } {
  const unique = [...new Set(exts.map((e) => e.toLowerCase()))];
  const text = unique.filter(isDiffable).sort((a, b) => TEXT_EXTENSIONS.indexOf(a) - TEXT_EXTENSIONS.indexOf(b));
  return { text, binary: unique.filter((e) => !isDiffable(e)) };
}

/**
 * The name proposed when saving `name` to a repository: kept when already a
 * text format (or when no text format is possible), else given the first text
 * format available — `report.docx` → `report.md`, `marks.xlsx` → `marks.csv`.
 */
export function preferDiffable(name: string, exts: string[]): string {
  const ext = extensionOf(name);
  if (isDiffable(ext)) return name;
  const { text } = orderForGit(exts);
  // A notebook's own formats (.jl, .py) are proposed only for a notebook.
  const first = text.find((e) => e !== 'jl' && e !== 'py');
  return first ? withExtension(name || 'document', first) : name;
}
