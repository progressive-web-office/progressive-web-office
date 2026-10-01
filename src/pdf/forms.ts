/**
 * PDF form inspection and saving with pdf-lib (PDF-008..PDF-015):
 * AcroForm field values, flattening, signature images and free text.
 */
import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFName,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
  rgb,
  StandardFonts,
} from '@pdfme/pdf-lib';

export type FieldType = 'text' | 'checkbox' | 'radio' | 'dropdown' | 'list' | 'other';

export interface FieldWidget {
  page: number;
  /** [x, y, width, height] in PDF points, origin at the bottom-left of the page. */
  rect: [number, number, number, number];
  /** Export value for radio-button widgets. */
  option?: string;
}

export interface FormField {
  name: string;
  type: FieldType;
  value: string | boolean | string[];
  options?: string[];
  multiline?: boolean;
  readOnly: boolean;
  maxLength?: number;
  widgets: FieldWidget[];
}

export interface PdfInfo {
  pageCount: number;
  fields: FormField[];
  /** Set when the document cannot be modified (encrypted, XFA). */
  readOnlyReason?: string;
  readOnlyCode?: 'encrypted' | 'xfa' | 'unreadable';
}

export type Stamp =
  | { kind: 'image'; page: number; x: number; y: number; width: number; height: number; png: Uint8Array }
  | { kind: 'text'; page: number; x: number; y: number; width: number; height: number; text: string; size: number };

export interface PdfEdits {
  values: Record<string, string | boolean | string[]>;
  stamps: Stamp[];
  flatten: boolean;
}

async function load(bytes: Uint8Array): Promise<{ doc: PDFDocument; encrypted: boolean }> {
  try {
    return { doc: await PDFDocument.load(bytes, { updateMetadata: false }), encrypted: false };
  } catch (err) {
    if ((err as Error).name === 'EncryptedPDFError' || /encrypt/i.test((err as Error).message)) {
      return { doc: await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false }), encrypted: true };
    }
    throw err;
  }
}

export async function inspectPdf(bytes: Uint8Array): Promise<PdfInfo> {
  const { doc, encrypted } = await load(bytes);
  const info: PdfInfo = { pageCount: doc.getPageCount(), fields: [] };
  if (encrypted) {
    info.readOnlyReason = 'This PDF is encrypted; it can be viewed but not filled or signed.';
    info.readOnlyCode = 'encrypted';
    return info;
  }
  // Check before getForm(): pdf-lib strips XFA data when building the form.
  const hasXfa = doc.catalog.getAcroForm()?.dict.has(PDFName.of('XFA')) ?? false;
  const form = doc.getForm();
  if (hasXfa) {
    info.readOnlyReason = 'This PDF uses an XFA form, which is not supported; it can be viewed but not filled.';
    info.readOnlyCode = 'xfa';
  }
  const pageRefs = doc.getPages().map((p) => p.ref);
  for (const field of form.getFields()) {
    const widgets: FieldWidget[] = field.acroField.getWidgets().map((w) => {
      const r = w.getRectangle();
      const pageRef = w.P();
      let page = pageRef ? pageRefs.findIndex((ref) => ref === pageRef || ref.toString() === pageRef.toString()) : -1;
      if (page < 0) page = doc.getPages().findIndex((p) => p.node.Annots()?.asArray().some((a) => a.toString() === doc.context.getObjectRef(w.dict)?.toString()));
      return { page: Math.max(0, page), rect: [r.x, r.y, r.width, r.height] };
    });
    const base = { name: field.getName(), readOnly: field.isReadOnly(), widgets };
    if (field instanceof PDFTextField) {
      const f: FormField = { ...base, type: 'text', value: field.getText() ?? '', multiline: field.isMultiline() };
      const max = field.getMaxLength();
      if (max !== undefined) f.maxLength = max;
      info.fields.push(f);
    } else if (field instanceof PDFCheckBox) {
      info.fields.push({ ...base, type: 'checkbox', value: field.isChecked() });
    } else if (field instanceof PDFRadioGroup) {
      const options = field.getOptions();
      widgets.forEach((w, i) => (w.option = options[i]));
      info.fields.push({ ...base, type: 'radio', value: field.getSelected() ?? '', options });
    } else if (field instanceof PDFDropdown) {
      info.fields.push({ ...base, type: 'dropdown', value: field.getSelected()[0] ?? '', options: field.getOptions() });
    } else if (field instanceof PDFOptionList) {
      info.fields.push({ ...base, type: 'list', value: field.getSelected(), options: field.getOptions() });
    } else {
      info.fields.push({ ...base, type: 'other', value: '' });
    }
  }
  return info;
}

export async function applyEdits(bytes: Uint8Array, edits: PdfEdits): Promise<Uint8Array> {
  const { doc, encrypted } = await load(bytes);
  if (encrypted) throw new Error('Encrypted PDF files cannot be modified.');
  const form = doc.getForm();
  for (const [name, value] of Object.entries(edits.values)) {
    const field = form.getFieldMaybe(name);
    if (!field || field.isReadOnly()) continue;
    if (field instanceof PDFTextField) field.setText(String(value));
    else if (field instanceof PDFCheckBox) (value ? field.check() : field.uncheck());
    else if (field instanceof PDFRadioGroup) {
      if (value) field.select(String(value));
      else field.clear();
    } else if (field instanceof PDFDropdown) {
      if (value) field.select(String(value));
      else field.clear();
    } else if (field instanceof PDFOptionList) {
      const values = Array.isArray(value) ? value : [String(value)];
      if (values.length) field.select(values);
      else field.clear();
    }
  }
  if (form.getFields().length) {
    const font = await doc.embedFont(StandardFonts.Helvetica);
    form.updateFieldAppearances(font);
  }
  const pages = doc.getPages();
  for (const stamp of edits.stamps) {
    const page = pages[stamp.page];
    if (!page) continue;
    if (stamp.kind === 'image') {
      const image = await doc.embedPng(stamp.png);
      page.drawImage(image, { x: stamp.x, y: stamp.y, width: stamp.width, height: stamp.height });
    } else {
      const font = await doc.embedFont(StandardFonts.Helvetica);
      page.drawText(stamp.text, { x: stamp.x, y: stamp.y + stamp.height * 0.2, size: stamp.size, font, color: rgb(0, 0, 0) });
    }
  }
  if (edits.flatten) form.flatten();
  return doc.save();
}
