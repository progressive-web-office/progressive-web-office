import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { R_BOOTSTRAP, rSandboxHtml, WEBR_ORIGIN } from '../src/code/r-frame-html';

describe('CODE-018 the R sandbox page', () => {
  const expected = rSandboxHtml(createHash('sha256').update(R_BOOTSTRAP).digest('base64'));
  const path = `${process.cwd()}/public/r-sandbox.html`;

  it('is generated from r-frame-html.ts (UPDATE_R_SANDBOX=1 writes it)', () => {
    if (process.env.UPDATE_R_SANDBOX) writeFileSync(path, expected);
    expect(readFileSync(path, 'utf8')).toBe(expected);
  });

  it('reaches only the webR sites, and runs only its bootstrap and webR', () => {
    const csp = /content="([^"]+)"/.exec(expected)![1]!;
    expect(csp).toContain("default-src 'none'");
    expect(csp).toMatch(new RegExp(`connect-src ${WEBR_ORIGIN} https://repo\\.r-wasm\\.org blob: data:`));
    expect(csp).not.toContain('unsafe-inline\' ' + WEBR_ORIGIN);
  });
});
