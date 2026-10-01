import { describe, expect, it } from 'vitest';
import { attr, children, escapeXml, parseXml } from '../src/core/xml';

describe('core/xml', () => {
  it('escapes markup characters and drops invalid XML characters', () => {
    expect(escapeXml(`a<b>&"c'\u0001`)).toBe('a&lt;b&gt;&amp;&quot;c&apos;');
  });

  it('parses XML and reports malformed input', () => {
    const doc = parseXml('<r xmlns:w="urn:w"><w:p w:val="1"/><w:q/></r>');
    const kids = children(doc.documentElement);
    expect(kids.map((k) => k.localName)).toEqual(['p', 'q']);
    expect(attr(kids[0]!, 'val')).toBe('1');
    expect(() => parseXml('<r><unclosed></r>')).toThrow(/XML/);
  });

  it('filters children by namespace-agnostic local name', () => {
    const doc = parseXml('<r xmlns:a="urn:a"><a:x/><a:y/><a:x/></r>');
    expect(children(doc.documentElement, 'x')).toHaveLength(2);
  });
});
