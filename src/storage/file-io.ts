/** Opening and saving local files (FILE-001, FILE-005). */
import { ACCEPTED_EXTENSIONS, MIME_TYPES, fileExtension, type DocumentFormat } from '../core/format';

export function replaceExtension(name: string, ext: string): string {
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  return `${base}.${ext}`;
}

export async function readFileBytes(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

/** Show the native file picker and resolve with the chosen file (or null). */
export function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ACCEPTED_EXTENSIONS.join(',');
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.click();
  });
}

interface SaveFilePickerWindow {
  showSaveFilePicker?: (opts: unknown) => Promise<{
    createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
  }>;
}

/**
 * Deliver bytes to the user: File System Access API when available,
 * classic download otherwise. Resolves to false if the user cancelled.
 */
export async function saveFile(bytes: Uint8Array, name: string, format: DocumentFormat, as?: { mimeType: string; extension: string }): Promise<boolean> {
  // FILE-020: a template has its own media type and extension.
  const mimeType = as?.mimeType ?? MIME_TYPES[format];
  const extension = as?.extension ?? fileExtension(format);
  const blob = new Blob([bytes as BlobPart], { type: mimeType });
  const w = window as unknown as SaveFilePickerWindow;
  if (typeof w.showSaveFilePicker === 'function') {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName: name,
        types: [{ description: name, accept: { [mimeType]: [`.${extension}`] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') return false;
      // Fall through to download on other errors (e.g. sandboxed iframes).
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}
