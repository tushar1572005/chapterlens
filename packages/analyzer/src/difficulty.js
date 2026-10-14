import { countSyllables } from './syllables.js';
import { extractWords, computeFkGrade } from './metrics.js';

/**
 * Computes composite difficulty score (0 - 100) based on sentence metrics.
 *
 * @param {{ words: number, avgSyllables: number, longWords: number, commas: number }} metrics
 * @returns {number} Score from 0 to 100, rounded to 1 decimal place
 */
export function computeSentenceScore(metrics) {
  const { words, avgSyllables, longWords, commas } = metrics;
  if (words === 0) {
    return 0;
  }

  // 1. Word count component (0 - 35 points): 40+ words reaches max
  const wordScore = Math.min(35, (words / 40) * 35);

  // 2. Average syllables component (0 - 30 points): 1.0 (simple) to 2.0+ (academic)
  const syllableFactor = Math.max(0, Math.min(1, (avgSyllables - 1.0) / 1.0));
  const syllableScore = syllableFactor * 30;

  // 3. Polysyllabic / long words (>= 3 syllables) component (0 - 20 points): 4+ reaches max
  const longWordScore = Math.min(20, (longWords / 4) * 20);

  // 4. Commas / clause density component (0 - 15 points): 3+ commas reaches max
  const commaScore = Math.min(15, (commas / 3) * 15);

  const rawScore = wordScore + syllableScore + longWordScore + commaScore;
  return Math.round(Math.min(100, Math.max(0, rawScore)) * 10) / 10;
}

/**
 * Lightweight single-sentence scorer without paragraph/document segmentation.
 * Used by the Cloudflare Worker to independently verify rewrite quality.
 *
 * @param {string} text - Single sentence text
 * @returns {{ metrics: { words: number, avgSyllables: number, longWords: number, commas: number }, score: number, fkGrade: number }}
 */
export function scoreSentence(text) {
  if (typeof text !== 'string') {
    return {
      metrics: { words: 0, avgSyllables: 0, longWords: 0, commas: 0 },
      score: 0,
      fkGrade: 0,
    };
  }

  const words = extractWords(text);
  const wordCount = words.length;

  let totalSyllables = 0;
  let longWords = 0;

  for (const w of words) {
    const s = countSyllables(w);
    totalSyllables += s;
    if (s >= 3) {
      longWords++;
    }
  }

  const avgSyllables =
    wordCount > 0 ? Math.round((totalSyllables / wordCount) * 100) / 100 : 0;
  const commas = (text.match(/,/g) || []).length;

  const metrics = {
    words: wordCount,
    avgSyllables,
    longWords,
    commas,
  };

  const score = computeSentenceScore(metrics);
  const fkGrade = computeFkGrade(wordCount, 1, totalSyllables);

  return {
    metrics,
    score,
    fkGrade,
  };
}

/**
 * Scores and ranks segmented sentences to find the hardest top 5.
 * Sentences with fewer than 8 words are ignored.
 * Flags tooLongForAi when sentence length exceeds 2000 chars.
 *
 * @param {Array<{ id: string, start: number, end: number, text: string }>} sentences
 * @returns {{ scored: Array<{ id: string, start: number, end: number, text: string, metrics: Object, score: number, fkGrade: number, tooLongForAi: boolean }>, hardest: Array<{ id: string, start: number, end: number, text: string, metrics: Object, score: number, tooLongForAi: boolean }> }}
 */
export function rankSentences(sentences) {
  if (!Array.isArray(sentences) || sentences.length === 0) {
    return { scored: [], hardest: [] };
  }

  const scored = sentences.map((s) => {
    const scoredSentence = scoreSentence(s.text);
    return {
      id: s.id,
      start: s.start,
      end: s.end,
      text: s.text,
      metrics: scoredSentence.metrics,
      score: scoredSentence.score,
      fkGrade: scoredSentence.fkGrade,
      tooLongForAi: s.text.length > 2000,
    };
  });

  // Filter out sentences with fewer than 8 words
  const eligible = scored.filter((s) => s.metrics.words >= 8);

  // Sort descending by difficulty score
  eligible.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    if (b.fkGrade !== a.fkGrade) {
      return b.fkGrade - a.fkGrade;
    }
    return b.metrics.words - a.metrics.words;
  });

  // Take top 5 and format to SentenceResult shape
  const hardest = eligible.slice(0, 5).map((s) => ({
    id: s.id,
    start: s.start,
    end: s.end,
    text: s.text,
    metrics: s.metrics,
    score: s.score,
    tooLongForAi: s.tooLongForAi,
  }));

  return {
    scored,
    hardest,
  };
}
