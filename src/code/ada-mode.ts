/**
 * CODE-020: colours of Ada code (no grammar comes with the editor): its
 * keywords, comments (`--`), strings, characters, numbers (`16#FF#`, `1_000`)
 * and attributes (`'First`), whatever their case.
 */
import type { StreamParser } from '@codemirror/language';

const KEYWORDS = new Set(
  (
    'abort abs abstract accept access aliased all and array at begin body case constant declare delay delta digits do else elsif end entry exception exit for function generic goto if in interface is limited loop mod new not null of or others out overriding package parallel pragma private procedure protected raise range record rem renames requeue return reverse select separate some subtype synchronized tagged task terminate then type until use when while with xor'
  ).split(' '),
);
const ATOMS = new Set(['true', 'false']);
const TYPES = new Set(['integer', 'natural', 'positive', 'float', 'long_float', 'boolean', 'character', 'string', 'duration', 'wide_string', 'unbounded_string']);

export const ada: StreamParser<unknown> = {
  name: 'ada',
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match('--')) {
      stream.skipToEnd();
      return 'comment';
    }
    if (stream.match(/^"(?:[^"]|"")*"/)) return 'string';
    // A character ('a'), not an attribute (X'First).
    if (stream.match(/^'.'/)) return 'string';
    if (stream.match(/^\d[\d_]*#[\da-fA-F_.]+#(?:[eE][+-]?\d+)?/) || stream.match(/^\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?/)) return 'number';
    if (stream.match(/^'[A-Za-z_]\w*/)) return 'attribute';
    const word = stream.match(/^[A-Za-z_]\w*/) as RegExpMatchArray | null;
    if (word) {
      const w = word[0].toLowerCase();
      if (KEYWORDS.has(w)) return 'keyword';
      if (ATOMS.has(w)) return 'atom';
      if (TYPES.has(w)) return 'type';
      return 'variable';
    }
    stream.next();
    return null;
  },
  languageData: { commentTokens: { line: '--' } },
};
