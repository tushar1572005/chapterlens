import { describe, it, expect } from 'vitest';
import { scoreSentence } from '@chapterlens/analyzer';

describe('scoreSentence CPU benchmark for Cloudflare Worker', () => {
  const tenSentences = [
    'The ancient library smelled of aged parchment and cold stone dampness.',
    'Dr. Hawthorne paused near the towering cedar shelves, closely studying the illuminated manuscript.',
    'For centuries, scholars had debated whether the enigmatic marginalia contained genuine mathematical formulations.',
    'The apprentice carefully carried an armful of leather-bound folios across the flagstone floor.',
    'The young man hands were trembling slightly under the tremendous weight of the historical volumes.',
    'He adjusted his brass spectacles and traced his finger along a faded Latin inscription.',
    'The incomprehensible syntactic density of this paragraph presented an almost insurmountable challenge.',
    'Outside, the autumn wind whistled through the narrow battlements of the tower.',
    'It was getting dark rapidly, and the faint tallow candles cast flickering shadows against the ceiling.',
    'They knew that if the manuscript could not be deciphered before midnight, the secret archives would remain sealed.',
  ];

  it('runs scoreSentence for 10 sentences in under 5 ms total', () => {
    // Warm-up JIT
    for (let i = 0; i < 3; i++) {
      for (const s of tenSentences) {
        scoreSentence(s);
      }
    }

    const results = [];
    const start = performance.now();
    for (const s of tenSentences) {
      results.push(scoreSentence(s));
    }
    const duration = performance.now() - start;

    console.log(`[CPU Benchmark] scoreSentence() for 10 sentences took: ${duration.toFixed(3)} ms`);

    // Verify correctness outside the timed block
    for (const res of results) {
      expect(res.score).toBeGreaterThan(0);
      expect(res.fkGrade).toBeDefined();
    }

    // Target is < 5 ms total (Worker CPU limit is 10 ms total request)
    expect(duration).toBeLessThan(5);
  });
});
