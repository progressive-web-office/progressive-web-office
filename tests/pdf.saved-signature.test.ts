import { beforeEach, describe, expect, it } from 'vitest';
import { forgetSignature, loadSignature, rememberSignature } from '../src/pdf/saved-signature';

describe('PDF-014 remembered signature', () => {
  beforeEach(() => localStorage.clear());
  it('is kept only when remembered, and forgotten on request', () => {
    expect(loadSignature()).toBeUndefined();
    rememberSignature({ png: new Uint8Array([137, 80, 78, 71, 0, 255]), width: 120, height: 40 });
    expect(loadSignature()).toEqual({ png: new Uint8Array([137, 80, 78, 71, 0, 255]), width: 120, height: 40 });
    forgetSignature();
    expect(loadSignature()).toBeUndefined();
  });
  it('ignores damaged data', () => {
    localStorage.setItem('pwo.pdf.signature', '{"png":3}');
    expect(loadSignature()).toBeUndefined();
  });
});
