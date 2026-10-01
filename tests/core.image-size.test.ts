import { describe, expect, it } from 'vitest';
import { imageSize } from '../src/core/image-size';
import { PNG_1PX } from './fixtures';

describe('core/image-size', () => {
  it('reads PNG and GIF dimensions', () => {
    expect(imageSize(PNG_1PX)).toEqual({ width: 1, height: 1 });
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 3, 0, 2, 0]);
    expect(imageSize(gif)).toEqual({ width: 3, height: 2 });
  });
  it('reads JPEG SOF0 dimensions', () => {
    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0, 20, 0, 40, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(imageSize(jpg)).toEqual({ width: 40, height: 20 });
  });
  it('returns undefined for unknown data', () => {
    expect(imageSize(new Uint8Array([1, 2, 3]))).toBeUndefined();
  });
});
