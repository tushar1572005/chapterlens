import { syllable } from 'syllable';

/**
 * Counts the syllables in a given word.
 * Strips surrounding punctuation and cleans input before counting.
 *
 * @param {string} word - Single word to score
 * @returns {number} Syllable count (at least 1 for valid words, 0 for empty/invalid)
 */
export function countSyllables(word) {
  if (typeof word !== 'string') {
    return 0;
  }

  // Strip leading and trailing non-alphanumeric characters
  const cleanWord = word.trim().replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');
  if (!cleanWord) {
    return 0;
  }

  const count = syllable(cleanWord);
  // Any word with letters should have at least 1 syllable
  return count > 0 ? count : 1;
}
