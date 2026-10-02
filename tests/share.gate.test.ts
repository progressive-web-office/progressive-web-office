import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { inspectReceived } from '../src/share/gate';
import { writeDocx } from '../src/document/docx-writer';

const PDF = strToU8('%PDF-1.7\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\n');
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const docx = writeDocx({ blocks: [{ type: 'paragraph', style: 'normal', runs: [{ text: 'Hi' }] }], resources: new Map(), meta: {} });

describe('SHARE-013 checking what QRShare hands over', () => {
  it('accepts the documents the app opens, whose content matches their name', () => {
    expect(inspectReceived('report.pdf', PDF)).toEqual({ ok: true, format: 'pdf' });
    expect(inspectReceived('report.docx', docx)).toEqual({ ok: true, format: 'docx' });
    expect(inspectReceived('notes.md', strToU8('# Notes\n'))).toEqual({ ok: true, format: 'md' });
    expect(inspectReceived('plot.png', PNG)).toEqual({ ok: true, format: 'image' });
    expect(inspectReceived('main.py', strToU8('print(1)\n'))).toEqual({ ok: true, format: 'text' });
    expect(inspectReceived('work.zip', zipSync({ 'a.txt': strToU8('x') }))).toEqual({ ok: true, format: 'archive' });
  });

  it('refuses what the app does not open', () => {
    expect(inspectReceived('setup.exe', new Uint8Array([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0, 0xff, 0xff]))).toEqual({ ok: false, reason: 'unknown' });
    expect(inspectReceived('data.bin', new Uint8Array([0, 1, 2, 3, 255, 254]))).toEqual({ ok: false, reason: 'unknown' });
    expect(inspectReceived('empty.docx', new Uint8Array())).toEqual({ ok: false, reason: 'empty' });
  });

  it('refuses a file disguised under the name of another format', () => {
    expect(inspectReceived('report.docx', PDF)).toEqual({ ok: false, reason: 'mismatch', format: 'pdf' });
    expect(inspectReceived('photo.png', PDF)).toEqual({ ok: false, reason: 'mismatch', format: 'pdf' });
    expect(inspectReceived('report.pdf', strToU8('<html><script>alert(1)</script></html>'))).toEqual({ ok: false, reason: 'unknown' });
    expect(inspectReceived('report.odt', zipSync({ 'a.txt': strToU8('x') }))).toEqual({ ok: false, reason: 'mismatch', format: 'archive' });
  });
});
