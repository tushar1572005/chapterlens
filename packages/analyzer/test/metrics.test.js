import { describe, it, expect } from 'vitest';
import {
  extractWords,
  readabilityLabel,
  computeFleschRE,
  computeFkGrade,
  computeReadability,
} from '../src/metrics.js';
import { countSyllables } from '../src/syllables.js';
import { segmentSentences } from '../src/segment.js';

describe('metrics', () => {
  function scorePassage(passage) {
    const sentences = segmentSentences(passage);
    const words = extractWords(passage);
    const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
    return {
      wordCount: words.length,
      sentenceCount: sentences.length,
      syllableCount: syllables,
      readability: computeReadability({
        words: words.length,
        sentences: sentences.length,
        syllables,
      }),
    };
  }

  describe('published benchmark passages (±3 tolerance)', () => {
    it('Passage 1: Gettysburg Address opening (Flesch RE 41.0 ±3, FK 15.0 ±1.5)', () => {
      const text =
        'Four score and seven years ago our fathers brought forth on this continent, a new nation, conceived in Liberty, and dedicated to the proposition that all men are created equal.';
      const { readability, wordCount, sentenceCount, syllableCount } = scorePassage(text);
      expect(wordCount).toBe(30);
      expect(sentenceCount).toBe(1);
      expect(syllableCount).toBe(48);
      expect(readability.fleschRE).toBeGreaterThanOrEqual(38);
      expect(readability.fleschRE).toBeLessThanOrEqual(44);
      expect(readability.fkGrade).toBeGreaterThanOrEqual(13.5);
      expect(readability.fkGrade).toBeLessThanOrEqual(16.5);
      expect(readability.label).toBe('Difficult');
    });

    it('Passage 2: Rudolf Flesch sample (Flesch RE 84.8 ±3, FK 5.4 ±1)', () => {
      const text = 'Sir, a man may write at any time, if he will set himself doggedly to it.';
      const { readability, wordCount, sentenceCount, syllableCount } = scorePassage(text);
      expect(wordCount).toBe(16);
      expect(sentenceCount).toBe(1);
      expect(syllableCount).toBe(20);
      expect(readability.fleschRE).toBeGreaterThanOrEqual(82);
      expect(readability.fleschRE).toBeLessThanOrEqual(88);
      expect(readability.fkGrade).toBeGreaterThanOrEqual(4.4);
      expect(readability.fkGrade).toBeLessThanOrEqual(6.4);
      expect(readability.label).toBe('Easy');
    });

    it('Passage 3: Alice in Wonderland opening sentence (Flesch RE 33.2 ±3, FK 22.8 ±1.5)', () => {
      const text =
        'Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do: once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it, and what is the use of a book, thought Alice without pictures or conversations?';
      const { readability, wordCount, sentenceCount, syllableCount } = scorePassage(text);
      expect(wordCount).toBe(57);
      expect(sentenceCount).toBe(1);
      expect(syllableCount).toBe(78);
      expect(readability.fleschRE).toBeGreaterThanOrEqual(30);
      expect(readability.fleschRE).toBeLessThanOrEqual(36);
      expect(readability.fkGrade).toBeGreaterThanOrEqual(21.3);
      expect(readability.fkGrade).toBeLessThanOrEqual(24.3);
      expect(readability.label).toBe('Difficult');
    });
  });

  describe('readabilityLabel boundaries', () => {
    it('maps Flesch scores to correct qualitative labels', () => {
      expect(readabilityLabel(95)).toBe('Very Easy');
      expect(readabilityLabel(85)).toBe('Easy');
      expect(readabilityLabel(75)).toBe('Fairly Easy');
      expect(readabilityLabel(65)).toBe('Standard');
      expect(readabilityLabel(55)).toBe('Fairly Difficult');
      expect(readabilityLabel(40)).toBe('Difficult');
      expect(readabilityLabel(20)).toBe('Very Difficult');
    });
  });

  describe('edge cases', () => {
    it('handles 0 words or 0 sentences gracefully', () => {
      expect(computeFleschRE(0, 0, 0)).toBe(0);
      expect(computeFkGrade(0, 0, 0)).toBe(0);
      expect(computeReadability({ words: 0, sentences: 0, syllables: 0 })).toEqual({
        fleschRE: 0,
        fkGrade: 0,
        label: 'Very Difficult',
      });
    });

    it('extractWords handles hyphenated contractions and empty input', () => {
      expect(extractWords("it's don't we'll")).toEqual(["it's", "don't", "we'll"]);
      expect(extractWords('')).toEqual([]);
      expect(extractWords(null)).toEqual([]);
    });
  });
});
