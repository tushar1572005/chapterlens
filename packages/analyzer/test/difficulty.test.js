import { describe, it, expect } from 'vitest';
import { scoreSentence, rankSentences } from '../src/difficulty.js';
import { segmentSentences } from '../src/segment.js';
import { analyze } from '../src/index.js';
import { SentenceScoreSchema } from '../src/schemas.js';

describe('difficulty and scoreSentence', () => {
  it('computes metrics, score, and fkGrade for a single sentence', () => {
    const sentence =
      'The sophisticated pharmaceutical investigation revealed unexpected, multifaceted complications during the trial.';
    const result = scoreSentence(sentence);

    expect(result.metrics.words).toBe(11);
    expect(result.metrics.commas).toBe(1);
    expect(result.metrics.longWords).toBeGreaterThanOrEqual(4);
    expect(result.score).toBeGreaterThan(50);
    expect(result.fkGrade).toBeGreaterThan(10);
    expect(() => SentenceScoreSchema.parse(result)).not.toThrow();
  });

  it('matches per-sentence scores from full analyze()', () => {
    const passage =
      'Here is a simple introductory sentence. Furthermore, the incomprehensible and extraordinarily convoluted legislation confounded all contemporary legal analysts. The cat sat.';
    const fullAnalysis = analyze(passage);
    const hardest = fullAnalysis.hardest;

    expect(hardest.length).toBeGreaterThan(0);
    for (const h of hardest) {
      const independentScore = scoreSentence(h.text);
      expect(h.score).toBe(independentScore.score);
      expect(h.metrics).toEqual(independentScore.metrics);
    }
  });

  it('ignores sentences with fewer than 8 words when ranking hardest', () => {
    const text = 'Yes. No. Very short sentence. Exactly seven small words are here.';
    const sentences = segmentSentences(text);
    const { hardest } = rankSentences(sentences);
    expect(hardest).toHaveLength(0);
  });

  it('flags tooLongForAi for sentences over 2000 characters', () => {
    const longWordPart = 'extraordinarily complex and multifaceted narrative sentence with substantial vocabulary ';
    const longSentence = longWordPart.repeat(30) + '.';
    expect(longSentence.length).toBeGreaterThan(2000);

    const sentences = segmentSentences(longSentence);
    const { hardest } = rankSentences(sentences);

    expect(hardest).toHaveLength(1);
    expect(hardest[0].tooLongForAi).toBe(true);
  });

  it('does not flag tooLongForAi for normal length sentences', () => {
    const normalSentence =
      'This is a perfectly regular sentence of moderate length that easily fits within normal boundaries.';
    const sentences = segmentSentences(normalSentence);
    const { hardest } = rankSentences(sentences);

    expect(hardest).toHaveLength(1);
    expect(hardest[0].tooLongForAi).toBe(false);
  });

  it('caps hardest list at 5 items sorted by score descending', () => {
    const passage = `
      Sentence number one contains quite a few intricate and polysyllabic terms for testing.
      Sentence number two demonstrates another somewhat challenging syntactical structure for analysis.
      Sentence number three features further philosophical deliberations and complicated arguments.
      Sentence number four presents additional linguistic complexity and sophisticated phrasing.
      Sentence number five exhibits remarkably elevated syllable density and substantial clause construction.
      Sentence number six also includes enough vocabulary to meet the required eight word minimum.
      Sentence number seven concludes this deliberate compilation of difficult and demanding assertions.
    `;
    const sentences = segmentSentences(passage);
    const { hardest } = rankSentences(sentences);

    expect(hardest).toHaveLength(5);
    for (let i = 0; i < hardest.length - 1; i++) {
      expect(hardest[i].score).toBeGreaterThanOrEqual(hardest[i + 1].score);
    }
  });

  it('handles empty or non-string inputs safely', () => {
    const emptyResult = scoreSentence('');
    expect(emptyResult.score).toBe(0);
    expect(emptyResult.metrics.words).toBe(0);
    expect(scoreSentence(null).score).toBe(0);
  });
});
