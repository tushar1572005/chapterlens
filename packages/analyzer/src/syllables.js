import { syllable } from 'syllable';

const syllableCache = new Map();
const MAX_CACHE_ENTRIES = 5000;

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

  const lower = cleanWord.toLowerCase();
  const cached = syllableCache.get(lower);
  if (cached !== undefined) {
    return cached;
  }

  const count = syllable(lower);
  const result = count > 0 ? count : 1;

  if (syllableCache.size >= MAX_CACHE_ENTRIES) {
    syllableCache.clear();
  }
  syllableCache.set(lower, result);

  return result;
}
