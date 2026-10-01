/** Small XML helpers built on the browser DOMParser. */

// Characters not allowed in XML 1.0 documents.
// eslint-disable-next-line no-control-regex
const INVALID_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

/** Escape text for use in XML content or attribute values. */
/** Escape for an attribute value, keeping line breaks and tabs (attribute normalisation would turn them into spaces). */
export function escapeXmlAttr(text: string): string {
  return escapeXml(text).replace(/\n/g, '&#10;').replace(/\r/g, '&#13;').replace(/\t/g, '&#9;');
}

export function escapeXml(text: string): string {
  return text
    .replace(INVALID_XML_CHARS, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Parse an XML string, throwing on malformed input. */
export function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const error = doc.getElementsByTagName('parsererror')[0];
  if (error) throw new Error(`Malformed XML: ${error.textContent?.trim().split('\n')[0] ?? ''}`);
  return doc;
}

/** Element children, optionally filtered by local name (namespace agnostic). */
export function children(el: Element, localName?: string): Element[] {
  const out: Element[] = [];
  for (let n = el.firstElementChild; n; n = n.nextElementSibling) {
    if (!localName || n.localName === localName) out.push(n);
  }
  return out;
}

/** First child element with the given local name. */
export function child(el: Element, localName: string): Element | undefined {
  for (let n = el.firstElementChild; n; n = n.nextElementSibling) {
    if (n.localName === localName) return n;
  }
  return undefined;
}

/** All descendants with the given local name, in document order. */
export function descendants(el: Element | Document, localName: string): Element[] {
  return Array.from(el.getElementsByTagNameNS('*', localName));
}

/** Attribute value by local name (namespace agnostic). */
export function attr(el: Element, localName: string): string | null {
  for (const a of Array.from(el.attributes)) {
    if (a.localName === localName) return a.value;
  }
  return null;
}
