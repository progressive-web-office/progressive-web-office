import { describe, expect, it } from 'vitest';
import { readability, syllables } from '../src/document/readability';

describe('DOC-033 readability', () => {
  it('counts syllables in English and French', () => {
    expect(['cat', 'table', 'reading', 'make', 'wanted', 'jumped', 'beautiful'].map((w) => syllables(w, 'en'))).toEqual([1, 2, 2, 1, 2, 1, 3]);
    expect(['chat', 'table', 'parlent', 'électricité', 'école', 'oui'].map((w) => syllables(w, 'fr'))).toEqual([1, 1, 1, 5, 2, 1]);
  });

  it('scores short simple sentences as easy and long technical ones as hard', () => {
    const easy = readability('The cat sat on the mat. It was warm. The dog ran.', 'en')!;
    expect(easy.level).toBe('easy');
    const hard = readability('The characterization of nonlinear electromechanical transducers necessitates comprehensive experimental identification methodologies incorporating sophisticated parameter estimation algorithms.', 'en')!;
    expect(hard.level).toBe('veryHard');
    const fr = readability('Le chat dort. Il fait beau. Nous allons au parc.', 'fr')!;
    expect(fr.level).toBe('easy');
    expect(fr.sentences).toBe(3);
    expect(readability('Too short', 'en')).toBeUndefined();
  });
});
