/** Editor views: one per document kind, loaded lazily to keep startup fast. */
import type { AgentTool } from '../ai/tools';
import type { PrintSettings } from '../print/settings';
import { t } from '../i18n';
import type { DocumentFormat, DocumentKind } from '../core/format';

/** An extra "Save as" entry that writes a copy without changing the open document (e.g. a flattened PDF). */
export interface SaveVariant {
  id: string;
  label: string;
  format: DocumentFormat;
  /** Appended to the file name, before the extension. */
  suffix: string;
  save(): Promise<Uint8Array>;
}

export interface EditorView {
  /** Root element mounted by the shell. */
  readonly element: HTMLElement;
  /** Serialise the current content (undefined for read-only views). */
  save?(format: DocumentFormat): Uint8Array | Promise<Uint8Array>;
  /** Short status text (word count, selection...). */
  status?(): string;
  /** Called by the shell once the element is in the DOM. */
  mounted?(): void;
  focus?(): void;
  /** Optional print hook (default: window.print()). */
  print?(): void;
  /** Printable content for the print preview (PRINT-001). */
  printContent?(settings: PrintSettings): HTMLElement | Promise<HTMLElement>;
  /** Extra "Save as" entries writing copies (PDF-010). */
  saveVariants?(): SaveVariant[];
  /** Real-time collaboration on this document (COLLAB-002). */
  collab?(): import('../collab/parts').CollabAdapter;
  /** Offline synchronisation of this document through QR codes (COLLAB-008). */
  syncable?(): SyncableDocument;
  /** Tools for AI agents working on this document (AI-001, AI-006). */
  agentTools?(): AgentTool[];
  /** Show the document without allowing changes (FILE-017). */
  setReadOnly?(readOnly: boolean): void;
  /** Show the first match of a search (FOLDER-002). */
  find?(query: string): void;
  /** The document with its sub-documents as `include` blocks, to assemble (DOC-028). */
  masterDocument?(): import('../document/model').RichDocument | undefined;
  destroy(): void;
}

/** A text document that can be read and replaced by the offline synchronisation (COLLAB-008). */
export interface SyncableDocument {
  read(): import('../document/model').RichDocument;
  /** Replace the content (properties, images, blocks) with a synchronised one. */
  write(doc: import('../document/model').RichDocument): void;
}

export interface ViewContext {
  /** Notify the shell that content changed (sets the modified flag). */
  changed(): void;
  /** Ask the shell to refresh the status bar. */
  statusChanged(): void;
  /** Ask the user to pick one option; resolves to null when cancelled. */
  choose(title: string, message: string, options: string[], preselected: string): Promise<string | null>;
  /** Open a link relative to the document from its folder; false when it is not such a link (FOLDER-003). */
  openLink?(href: string): boolean;
  /** Documents of the open folder, relative to this document (DOC-028). */
  folderDocuments?(): Promise<string[]> | undefined;
}

/** Create a view for existing file bytes. */
export async function openView(
  format: DocumentFormat,
  bytes: Uint8Array,
  ctx: ViewContext,
  fileName = 'document',
  /** Pictures referenced by a Markdown note, read from its folder (FOLDER-005). */
  resolveImage?: import('../document/markdown-reader').MarkdownReadOptions['resolveImage'],
): Promise<EditorView> {
  switch (format) {
    case 'docx':
    case 'odt':
    case 'md':
    case 'mdz':
    case 'tex':
    case 'texzip': {
      const [{ DocumentEditor }, { readDocument }] = await Promise.all([import('../document/editor'), import('../document/io')]);
      const doc = await readDocument(format, bytes, {
        chooseEntry: (candidates, preselected) =>
          ctx.choose(t('mdz.chooseTitle'), t('mdz.chooseMessage'), candidates, preselected),
        ...(resolveImage ? { resolveImage } : {}),
      });
      return new DocumentEditor(doc, ctx);
    }
    case 'xlsx':
    case 'ods':
    case 'csv': {
      const [{ SheetEditor }, { readWorkbook }] = await Promise.all([import('../sheet/grid'), import('../sheet/io')]);
      return new SheetEditor(readWorkbook(format, bytes, fileName), ctx, format);
    }
    case 'pptx':
    case 'odp': {
      const [{ SlideEditor }, { readPresentation }] = await Promise.all([import('../slides/editor'), import('../slides/io')]);
      return new SlideEditor(readPresentation(format, bytes), ctx, format);
    }
    case 'pdf': {
      const { createPdfViewer } = await import('../pdf/viewer');
      return createPdfViewer(bytes, ctx);
    }
    default:
      throw new Error(`Editing ${format} files is not available yet.`);
  }
}

/** Create a view for a new, empty document of the given kind. */
export async function newView(kind: DocumentKind, ctx: ViewContext, format?: DocumentFormat): Promise<EditorView> {
  switch (kind) {
    case 'document': {
      const [{ DocumentEditor }, { emptyDocument }] = await Promise.all([import('../document/editor'), import('../document/model')]);
      return new DocumentEditor(emptyDocument(), ctx);
    }
    case 'spreadsheet': {
      const [{ SheetEditor }, { newWorkbook }] = await Promise.all([import('../sheet/grid'), import('../sheet/model')]);
      return new SheetEditor(newWorkbook(), ctx, format === 'xlsx' ? 'xlsx' : 'ods');
    }
    case 'presentation': {
      const [{ SlideEditor }, { emptyPresentation }] = await Promise.all([import('../slides/editor'), import('../slides/model')]);
      return new SlideEditor(emptyPresentation(), ctx, format === 'pptx' ? 'pptx' : 'odp');
    }
    default:
      throw new Error(`Creating a ${kind} is not available yet.`);
  }
}
