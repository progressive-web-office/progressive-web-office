import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import { readZip, readZipText, writeZip } from '../src/core/zip';
import { makeZip } from './helpers';

describe('core/zip', () => {
  it('reads entries of an archive', () => {
    const zip = readZip(makeZip({ 'a.txt': 'hello', 'dir/b.xml': '<b/>' }));
    expect(readZipText(zip, 'a.txt')).toBe('hello');
    expect(readZipText(zip, 'dir/b.xml')).toBe('<b/>');
    expect(readZipText(zip, 'missing')).toBeUndefined();
  });

  it('throws a friendly error on non-zip data', () => {
    expect(() => readZip(new Uint8Array([1, 2, 3]))).toThrow(/archive/i);
  });

  it('writes entries in order and stores uncompressed entries when asked (ODF mimetype)', () => {
    const bytes = writeZip([
      { path: 'mimetype', data: 'application/vnd.oasis.opendocument.text', store: true },
      { path: 'content.xml', data: '<x/>' },
    ]);
    // local file header of the first entry: compression method at offset 8 must be 0 (stored)
    expect(bytes[8]).toBe(0);
    expect(bytes[9]).toBe(0);
    // first file name starts at offset 30
    expect(new TextDecoder().decode(bytes.subarray(30, 38))).toBe('mimetype');
    const back = unzipSync(bytes);
    expect(Object.keys(back)).toEqual(['mimetype', 'content.xml']);
  });
});
