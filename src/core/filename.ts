/** File names (FILE-026): renaming the open file keeps its extension. */

/** `report.docx` → `report` and `.docx` (a leading dot is part of the name). */
export function splitExtension(name: string): { stem: string; ext: string } {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? { stem: name.slice(0, dot), ext: name.slice(dot) } : { stem: name, ext: '' };
}

/** Characters no file system accepts in a name. */
const FORBIDDEN = /[/\\:*?"<>|\u0000-\u001f]/;

/**
 * The new name for `oldName` from what the user typed: the old extension is
 * kept (and not doubled when typed again); null for an unusable name.
 */
export function renamedKeepingExtension(oldName: string, typed: string): string | null {
  const { ext } = splitExtension(oldName);
  let stem = typed.trim();
  if (ext && stem.toLowerCase().endsWith(ext.toLowerCase())) stem = stem.slice(0, -ext.length).trim();
  if (!stem || FORBIDDEN.test(stem) || /^\.+$/.test(stem)) return null;
  return stem + ext;
}
