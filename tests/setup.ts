/**
 * Layout APIs that jsdom does not implement but ProseMirror calls when it
 * focuses or scrolls (browsers have them).
 */
const emptyRect = (): DOMRect => ({ x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0, toJSON: () => ({}) }) as DOMRect;
const emptyList = (): DOMRectList => Object.assign([], { item: () => null }) as unknown as DOMRectList;

if (typeof Range !== 'undefined') {
  Range.prototype.getClientRects ??= emptyList;
  Range.prototype.getBoundingClientRect ??= emptyRect;
}
if (typeof Text !== 'undefined') {
  (Text.prototype as unknown as { getClientRects: () => DOMRectList }).getClientRects ??= emptyList;
}
if (typeof document !== 'undefined') {
  (document as unknown as { elementFromPoint: () => null }).elementFromPoint ??= () => null;
}
