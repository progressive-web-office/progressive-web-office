/**
 * PDF form inspection and saving with pdf-lib (PDF-008..PDF-015):
 * AcroForm field values, flattening, signature images and free text.
 */
import {
  PDFCheckBox,
  PDFDict,
  PDFDocument,
  PDFDropdown,
  PDFHexString,
  PDFName,
  PDFOptionList,
  PDFRadioGroup,
  PDFString,
  PDFTextField,
  rgb,
  StandardFonts,
  TextAlignment,
  type PDFField,
} from '@pdfme/pdf-lib';
import { writeAnnotations, type PdfNote } from './annotations';
import { formatActions, parseFormatScripts, type FieldFormat } from './field-format';

/**
 * FORM-005: the properties of a field, as in the forms of PDF readers: its
 * tooltip, required, read-only, value by default, and for a text its
 * length, boxes, alignment, size of text and format; for a list, whether one
 * may type another value and whether the choices are sorted.
 */
export interface FieldSettings {
  tooltip?: string;
  required?: boolean;
  readOnly?: boolean;
  /** A text, or the choice of a list, filled in at first. */
  defaultValue?: string;
  /** A check box checked at first. */
  checked?: boolean;
  maxLength?: number;
  /** One box per character (needs `maxLength`). */
  comb?: boolean;
  align?: 'left' | 'center' | 'right';
  /** In points; 0 or none: fit to the field. */
  fontSize?: number;
  format?: FieldFormat;
  /** A drop-down list in which another value can be typed. */
  editable?: boolean;
  sorted?: boolean;
  /** The choices of a drop-down list (changed on an existing one). */
  options?: string[];
}

/** The message of a value refused by the format, written in the file's scripts. */
export const INVALID_VALUE = 'The value does not have the expected format.';

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
  /** FORM-005: what the file says of the field beyond its value. */
  tooltip?: string;
  required?: boolean;
  comb?: boolean;
  align?: 'left' | 'center' | 'right';
  format?: FieldFormat;
  editable?: boolean;
  sorted?: boolean;
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

/** FORM-001: kinds of fields drawn on a PDF. */
export const NEW_FIELD_KINDS = ['text', 'multiline', 'checkbox', 'dropdown', 'radio'] as const;
export type NewFieldKind = (typeof NEW_FIELD_KINDS)[number];

/** FORM-001: a field drawn on a page, made a real AcroForm field on saving. */
export interface NewField {
  kind: NewFieldKind;
  name: string;
  page: number;
  /** [x, y, width, height] in PDF points, origin at the bottom-left of the page. */
  rect: [number, number, number, number];
  /** Choices of a drop-down list. */
  options?: string[];
  /** The value of this button of a radio group (its other buttons are other fields of the same name). */
  option?: string;
  required?: boolean;
  /** FORM-005: its other properties. */
  settings?: FieldSettings;
}

export interface PdfEdits {
  values: Record<string, string | boolean | string[]>;
  /** FORM-001: fields drawn, removed and renamed. */
  newFields?: NewField[];
  removedFields?: string[];
  renamedFields?: Record<string, string>;
  /** FORM-005: properties changed on fields of the file, by their name in the file. */
  fieldSettings?: Record<string, FieldSettings>;
  stamps: Stamp[];
  flatten: boolean;
  /** Highlights and notes (PDF-018). */
  notes?: PdfNote[];
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
    const tooltip = textOf(field.acroField.dict.lookup(PDFName.of('TU')));
    const base = { name: field.getName(), readOnly: field.isReadOnly(), widgets, ...(tooltip ? { tooltip } : {}), ...(field.isRequired() ? { required: true } : {}) };
    if (field instanceof PDFTextField) {
      const f: FormField = { ...base, type: 'text', value: field.getText() ?? '', multiline: field.isMultiline() };
      const max = field.getMaxLength();
      if (max !== undefined) f.maxLength = max;
      if (field.isCombed()) f.comb = true;
      const align = field.getAlignment();
      if (align === TextAlignment.Center) f.align = 'center';
      else if (align === TextAlignment.Right) f.align = 'right';
      const format = parseFormatScripts(scriptsOf(field));
      if (format) f.format = format;
      info.fields.push(f);
    } else if (field instanceof PDFCheckBox) {
      info.fields.push({ ...base, type: 'checkbox', value: field.isChecked() });
    } else if (field instanceof PDFRadioGroup) {
      const options = field.getOptions();
      widgets.forEach((w, i) => (w.option = options[i]));
      info.fields.push({ ...base, type: 'radio', value: field.getSelected() ?? '', options });
    } else if (field instanceof PDFDropdown) {
      info.fields.push({ ...base, type: 'dropdown', value: field.getSelected()[0] ?? '', options: field.getOptions(), ...(field.isEditable() ? { editable: true } : {}), ...(field.isSorted() ? { sorted: true } : {}) });
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
  // FORM-001: the form's design first.
  for (const name of edits.removedFields ?? []) {
    const field = form.getFieldMaybe(name);
    if (field) form.removeField(field);
  }
  for (const [from, to] of Object.entries(edits.renamedFields ?? {})) form.getFieldMaybe(from)?.acroField.setPartialName(to);
  const pages0 = doc.getPages();
  const look = { borderWidth: 1, borderColor: rgb(0.45, 0.5, 0.58), backgroundColor: rgb(0.93, 0.95, 1) };
  for (const f of edits.newFields ?? []) {
    const page = pages0[f.page];
    if (!page) continue;
    const [x, y, width, height] = f.rect;
    const at = { x, y, width, height, ...look };
    let field;
    if (f.kind === 'radio') {
      const group = (form.getFieldMaybe(f.name) as PDFRadioGroup | undefined) ?? form.createRadioGroup(f.name);
      group.addOptionToPage(f.option || `${group.getOptions().length + 1}`, page, at);
      field = group;
    } else if (f.kind === 'checkbox') {
      field = form.createCheckBox(f.name);
      field.addToPage(page, at);
    } else if (f.kind === 'dropdown') {
      field = form.createDropdown(f.name);
      field.setOptions(f.options ?? []);
      field.addToPage(page, at);
    } else {
      field = form.createTextField(f.name);
      if (f.kind === 'multiline') field.enableMultiline();
      field.addToPage(page, at);
    }
    if (f.required) field.enableRequired();
    if (f.settings) applySettings(field, { ...f.settings, ...(f.required !== undefined ? { required: f.required } : {}) });
  }
  // FORM-005: properties changed on the fields of the file.
  for (const [name, settings] of Object.entries(edits.fieldSettings ?? {})) {
    const field = form.getFieldMaybe(edits.renamedFields?.[name] ?? name);
    if (field) applySettings(field, settings);
  }
  for (const [name, value] of Object.entries(edits.values)) {
    const field = form.getFieldMaybe(name);
    if (!field || field.isReadOnly()) continue;
    if (field instanceof PDFTextField) {
      // FORM-005: never longer than the field allows.
      const max = field.getMaxLength();
      field.setText(max ? String(value).slice(0, max) : String(value));
    }
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
  if (edits.notes?.length) writeAnnotations(doc, edits.notes);
  if (edits.flatten) form.flatten();
  return doc.save();
}

/** The text of a PDF string (TU, JS…), or undefined. */
function textOf(obj: unknown): string | undefined {
  return obj instanceof PDFString || obj instanceof PDFHexString ? obj.decodeText() : undefined;
}

/** The scripts of a field's actions (K keystroke, F format, V validate). */
function scriptsOf(field: PDFField): { K?: string; F?: string; V?: string } {
  const aa = field.acroField.dict.lookup(PDFName.of('AA'));
  const out: { K?: string; F?: string; V?: string } = {};
  if (!(aa instanceof PDFDict)) return out;
  for (const key of ['K', 'F', 'V'] as const) {
    const action = aa.lookup(PDFName.of(key));
    const js = action instanceof PDFDict ? textOf(action.lookup(PDFName.of('JS'))) : undefined;
    if (js) out[key] = js;
  }
  return out;
}

/** FORM-005: the properties of a field, written as PDF readers read them. */
export function applySettings(field: PDFField, s: FieldSettings): void {
  const dict = field.acroField.dict;
  if (s.tooltip !== undefined) {
    if (s.tooltip) dict.set(PDFName.of('TU'), PDFHexString.fromText(s.tooltip));
    else dict.delete(PDFName.of('TU'));
  }
  if (s.required !== undefined) (s.required ? field.enableRequired() : field.disableRequired());
  if (s.readOnly !== undefined) (s.readOnly ? field.enableReadOnly() : field.disableReadOnly());
  if (field instanceof PDFTextField) {
    if (s.maxLength !== undefined) {
      if (s.maxLength > 0) {
        // A shorter limit than the text: the text is cut, as a reader would.
        const text = field.getText() ?? '';
        if (text.length > s.maxLength) field.setText(text.slice(0, s.maxLength));
        field.setMaxLength(s.maxLength);
      } else {
        if (field.isCombed()) field.disableCombing();
        field.setMaxLength(undefined);
      }
    }
    if (s.comb !== undefined) (s.comb && field.getMaxLength() && !field.isMultiline() ? field.enableCombing() : field.disableCombing());
    if (s.align) field.setAlignment(s.align === 'center' ? TextAlignment.Center : s.align === 'right' ? TextAlignment.Right : TextAlignment.Left);
    if (s.fontSize !== undefined) field.setFontSize(Math.max(0, s.fontSize));
    if (s.defaultValue !== undefined) {
      const max = field.getMaxLength();
      const value = max ? s.defaultValue.slice(0, max) : s.defaultValue;
      field.setText(value || undefined);
      if (value) dict.set(PDFName.of('DV'), PDFHexString.fromText(value));
      else dict.delete(PDFName.of('DV'));
    }
    if ('format' in s) {
      if (!s.format) dict.delete(PDFName.of('AA'));
      else {
        const js = formatActions(s.format, INVALID_VALUE);
        const action = (code: string): PDFDict => dict.context.obj({ S: PDFName.of('JavaScript'), JS: PDFHexString.fromText(code) });
        const aa = dict.context.obj({});
        if (js.K) aa.set(PDFName.of('K'), action(js.K));
        if (js.F) aa.set(PDFName.of('F'), action(js.F));
        aa.set(PDFName.of('V'), action(js.V));
        dict.set(PDFName.of('AA'), aa);
      }
    }
  } else if (field instanceof PDFCheckBox) {
    if (s.checked !== undefined) (s.checked ? field.check() : field.uncheck());
  } else if (field instanceof PDFDropdown) {
    if (s.options) field.setOptions(s.options);
    if (s.editable !== undefined) (s.editable ? field.enableEditing() : field.disableEditing());
    if (s.sorted !== undefined) (s.sorted ? field.enableSorting() : field.disableSorting());
    if (s.defaultValue !== undefined) {
      if (s.defaultValue && (field.getOptions().includes(s.defaultValue) || field.isEditable())) field.select(s.defaultValue, field.isEditable());
      else if (!s.defaultValue) field.clear();
    }
  }
}
