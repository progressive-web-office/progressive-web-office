/**
 * Readability (DOC-033): reading ease of a text, Flesch for English and
 * Kandel–Moles (its French adaptation) for French, from the average
 * sentence length and the average number of syllables per word.
 */

export interface Readability {
  /** 0 (very hard) to 100 (very easy), possibly beyond. */
  score: number;
  level: 'easy' | 'fair' | 'hard' | 'veryHard';
  words: number;
  sentences: number;
  /** Words per sentence. */
  sentenceLength: number;
  syllablesPerWord: number;
}

const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

/** Syllables of a word, by groups of vowels (with French and English silent endings). */
export function syllables(word: string, lang: string): number {
  const w = word.toLowerCase().replace(/[^a-zàâäéèêëîïôöûùüÿœæ]/g, '');
  if (!w) return /\d/.test(word) ? Math.max(1, Math.ceil(word.length / 2)) : 0;
  let groups = (w.match(/[aeiouyàâäéèêëîïôöûùüÿœæ]+/g) ?? []).length;
  if (/^fr/i.test(lang)) {
    // A final mute e (or es, ent of verbs) is not pronounced.
    if (/[^aeiouy]e(s|nt)?$/.test(w) && groups > 1) groups--;
  } else if (/^en/i.test(lang) || !lang) {
    if (/[^aeiouy]e$/.test(w) && !/[^aeiouy]le$/.test(w) && groups > 1) groups--;
    if (/[^aeiouy]ed$/.test(w) && !/[td]ed$/.test(w) && groups > 1) groups--;
  }
  return Math.max(1, groups);
}

export function readability(text: string, lang: string): Readability | undefined {
  const words = text.match(WORD) ?? [];
  if (words.length < 3) return undefined;
  const sentences = Math.max(1, (text.match(/[.!?…]+(?=\s|$)|[.!?…]+["»”)]/g) ?? []).length || 1);
  const syll = words.reduce((s, w) => s + syllables(w, lang), 0);
  const sentenceLength = words.length / sentences;
  const syllablesPerWord = syll / words.length;
  const score = /^fr/i.test(lang) ? 207 - 1.015 * sentenceLength - 73.6 * syllablesPerWord : 206.835 - 1.015 * sentenceLength - 84.6 * syllablesPerWord;
  const level = score >= 70 ? 'easy' : score >= 50 ? 'fair' : score >= 30 ? 'hard' : 'veryHard';
  return { score: Math.round(score), level, words: words.length, sentences, sentenceLength: Math.round(sentenceLength * 10) / 10, syllablesPerWord: Math.round(syllablesPerWord * 100) / 100 };
}
