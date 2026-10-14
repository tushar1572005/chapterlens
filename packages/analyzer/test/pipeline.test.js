import { describe, it, expect } from 'vitest';
import { analyze, scoreSentence } from '../src/index.js';
import { AnalysisResultSchema, SentenceScoreSchema } from '../src/schemas.js';

describe('full analyzer pipeline and schemas', () => {
  // ~300-word passage across multiple paragraphs
  const sampleChapter = `
The ancient library smelled of parchment and damp stone. Dr. Hawthorne paused near the towering cedar shelves, peering closely at the illuminated manuscript resting upon the podium. For centuries, scholars had debated whether the enigmatic marginalia contained genuine mathematical formulations or merely superstitious astrological commentary.

"Have you discovered the missing cipher yet?" asked his younger apprentice, who was carefully carrying an armful of leather-bound folios across the flagstone floor. The young man's hands were trembling slightly under the tremendous weight of the historical volumes.

Hawthorne did not answer immediately. He adjusted his brass spectacles and traced his finger along a faded Latin inscription that curved along the parchment border. Furthermore, the incomprehensible syntactic density of this particular paragraph, combined with its deliberate grammatical obfuscation, presented an almost insurmountable challenge even to seasoned paleographers.

Outside, the autumn wind whistled through the narrow battlements of the tower. It was getting dark rapidly, and the faint tallow candles cast flickering shadows against the vaulted ceiling. They knew that if the manuscript could not be deciphered before midnight, the secret entrance to the subterranean archives would remain sealed for another generation.
  `.trim();

  it('runs full pipeline test on a ~300-word passage and validates schema', () => {
    const result = analyze(sampleChapter);

    // Verify schema validation passes
    expect(() => AnalysisResultSchema.parse(result)).not.toThrow();

    // Word count should be around 200-300 words
    expect(result.stats.words).toBeGreaterThan(150);
    expect(result.stats.words).toBeLessThan(350);

    // Paragraph count should match the 4 distinct paragraphs
    expect(result.stats.paragraphs).toBe(4);

    // Sentences count should be 10+
    expect(result.stats.sentences).toBeGreaterThanOrEqual(8);

    // Readability scores
    expect(result.readability.fleschRE).toBeGreaterThan(0);
    expect(result.readability.fleschRE).toBeLessThan(100);
    expect(typeof result.readability.label).toBe('string');
    expect(result.readability.fkGrade).toBeGreaterThan(0);

    // Hardest sentences: top 5, ordered by score descending
    expect(result.hardest.length).toBeLessThanOrEqual(5);
    expect(result.hardest.length).toBeGreaterThan(0);

    for (let i = 0; i < result.hardest.length - 1; i++) {
      expect(result.hardest[i].score).toBeGreaterThanOrEqual(result.hardest[i + 1].score);
    }

    // Verify offsets: text.slice(start, end) matches sentence.text
    for (const h of result.hardest) {
      const slice = sampleChapter.slice(h.start, h.end);
      expect(slice).toBe(h.text);
      expect(h.metrics.words).toBeGreaterThanOrEqual(8);
      expect(h.id).toMatch(/^s\d+$/);
    }
  });

  it('validates single sentence scorer with SentenceScoreSchema', () => {
    const testSentence = 'The incomprehensible syntactic density of this text presented an insurmountable challenge.';
    const score = scoreSentence(testSentence);
    expect(() => SentenceScoreSchema.parse(score)).not.toThrow();
    expect(score.metrics.words).toBe(11);
  });

  it('handles empty text analysis cleanly', () => {
    const result = analyze('');
    expect(() => AnalysisResultSchema.parse(result)).not.toThrow();
    expect(result.stats.words).toBe(0);
    expect(result.stats.sentences).toBe(0);
    expect(result.stats.paragraphs).toBe(0);
    expect(result.hardest).toEqual([]);
  });

  it('exports from index.js resolve and function identically to individual modules', async () => {
    const barrel = await import('../src/index.js');
    expect(typeof barrel.analyze).toBe('function');
    expect(typeof barrel.scoreSentence).toBe('function');
    expect(typeof barrel.normalize).toBe('function');
    expect(typeof barrel.segment).toBe('function');
  });
});
