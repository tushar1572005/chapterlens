import { countSyllables } from './syllables.js';

/**
 * Extracts individual words from text, supporting apostrophes and contractions.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function extractWords(text) {
  if (typeof text !== 'string') {
    return [];
  }
  const matches = text.match(/[a-zA-Z0-9]+(?:['’][a-zA-Z0-9]+)?/g);
  return matches || [];
}

/**
 * Returns a human-readable readability label based on Flesch Reading Ease score.
 *
 * @param {number} fleschRE - Flesch Reading Ease score (typically 0-100)
 * @returns {string} Human-readable label
 */
export function readabilityLabel(fleschRE) {
  if (fleschRE >= 90) return 'Very Easy';
  if (fleschRE >= 80) return 'Easy';
  if (fleschRE >= 70) return 'Fairly Easy';
  if (fleschRE >= 60) return 'Standard';
  if (fleschRE >= 50) return 'Fairly Difficult';
  if (fleschRE >= 30) return 'Difficult';
  return 'Very Difficult';
}

/**
 * Computes Flesch Reading Ease score from word, sentence, and syllable counts.
 *
 * @param {number} words
 * @param {number} sentences
 * @param {number} syllables
 * @returns {number} Rounded to 1 decimal place
 */
export function computeFleschRE(words, sentences, syllables) {
  if (words <= 0 || sentences <= 0) {
    return 0;
  }
  const score = 206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words);
  return Math.round(score * 10) / 10;
}

/**
 * Computes Flesch-Kincaid Grade Level from word, sentence, and syllable counts.
 *
 * @param {number} words
 * @param {number} sentences
 * @param {number} syllables
 * @returns {number} Rounded to 1 decimal place
 */
export function computeFkGrade(words, sentences, syllables) {
  if (words <= 0 || sentences <= 0) {
    return 0;
  }
  const grade = 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59;
  return Math.round(grade * 10) / 10;
}

/**
 * Computes full readability metrics for given text or aggregate counts.
 *
 * @param {{ words: number, sentences: number, syllables: number }} counts
 * @returns {{ fleschRE: number, fkGrade: number, label: string }}
 */
export function computeReadability(counts) {
  const { words, sentences, syllables } = counts;
  const fleschRE = computeFleschRE(words, sentences, syllables);
  const fkGrade = computeFkGrade(words, sentences, syllables);
  const label = readabilityLabel(fleschRE);
  return { fleschRE, fkGrade, label };
}
