import { describe, it, expect } from 'vitest';
import { countSyllables } from '../src/syllables.js';

describe('countSyllables', () => {
  // 20 spot-checked words with expected syllable counts
  const spotCheckWords = [
    { word: 'cat', expected: 1 },
    { word: 'apple', expected: 2 },
    { word: 'banana', expected: 3 },
    { word: 'beautiful', expected: 3 },
    { word: 'university', expected: 5 },
    { word: 'the', expected: 1 },
    { word: 'rhythm', expected: 2 },
    { word: 'subtle', expected: 2 },
    { word: 'readability', expected: 5 },
    { word: 'pronunciation', expected: 4 },
    { word: 'encyclopedia', expected: 6 },
    { word: 'water', expected: 2 },
    { word: 'elephant', expected: 3 },
    { word: 'extraordinary', expected: 6 },
    { word: 'communication', expected: 5 },
    { word: 'book', expected: 1 },
    { word: 'unbelievable', expected: 5 },
    { word: 'whispered', expected: 2 },
    { word: 'sentence', expected: 2 },
    { word: 'difficult', expected: 3 },
  ];

  it('spot-checks 20 known words against expected syllable counts', () => {
    for (const { word, expected } of spotCheckWords) {
      expect(countSyllables(word), `Failed on "${word}"`).toBe(expected);
    }
  });

  it('strips surrounding punctuation when counting', () => {
    expect(countSyllables('"apple,"')).toBe(2);
    expect(countSyllables("'rhythm!'")).toBe(2);
    expect(countSyllables('(university)...')).toBe(5);
  });

  it('handles empty and non-string inputs safely', () => {
    expect(countSyllables('')).toBe(0);
    expect(countSyllables('   ')).toBe(0);
    expect(countSyllables('---')).toBe(0);
    expect(countSyllables(null)).toBe(0);
    expect(countSyllables(undefined)).toBe(0);
  });
});
