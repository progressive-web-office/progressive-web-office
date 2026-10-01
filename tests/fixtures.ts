import { addResource, emptyDocument, paragraph, type RichDocument } from '../src/document/model';

/** 1x1 transparent PNG. */
export const PNG_1PX = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
);

/** A document exercising every feature of the model (DOC-011 round-trips). */
export function richSample(): RichDocument {
  const doc = emptyDocument();
  const img = addResource(doc, PNG_1PX, 'image/png', 'pixel.png');
  doc.meta = { title: 'Sample' };
  doc.blocks = [
    paragraph('Main title', { style: 'h1' }),
    paragraph('Section', { style: 'h2' }),
    {
      type: 'paragraph',
      style: 'normal',
      align: 'justify',
      runs: [
        { text: 'Plain, ' },
        { text: 'bold', bold: true },
        { text: ', ' },
        { text: 'italic', italic: true },
        { text: ', ' },
        { text: 'underline', underline: true },
        { text: ', ' },
        { text: 'strike', strike: true },
        { text: ', ' },
        { text: 'all', bold: true, italic: true, underline: true, strike: true },
        { text: ' and a ' },
        { text: 'link', link: 'https://example.org/' },
        { text: '.' },
      ],
    },
    { type: 'paragraph', style: 'normal', align: 'center', runs: [{ text: 'Centered\nsecond line' }] },
    paragraph('first', { list: { ordered: false, level: 0 } }),
    paragraph('nested', { list: { ordered: false, level: 1 } }),
    paragraph('second', { list: { ordered: false, level: 0 } }),
    paragraph('one', { list: { ordered: true, level: 0 } }),
    paragraph('two', { list: { ordered: true, level: 0 } }),
    {
      type: 'table',
      rows: [
        [{ blocks: [paragraph('A1')] }, { blocks: [{ type: 'paragraph', style: 'normal', runs: [{ text: 'B1', bold: true }] }] }],
        [{ blocks: [paragraph('A2')] }, { blocks: [paragraph('B2')] }],
      ],
    },
    paragraph('A wise quote', { style: 'quote' }),
    paragraph('const x = 1;', { style: 'code' }),
    { type: 'paragraph', style: 'normal', runs: [{ text: 'Image: ' }, { image: img, alt: 'pixel', width: 10, height: 10 }] },
    { type: 'paragraph', style: 'normal', runs: [{ text: 'Use ' }, { text: 'npm test', code: true }] },
    paragraph('Small', { style: 'h3' }),
  ];
  return doc;
}
