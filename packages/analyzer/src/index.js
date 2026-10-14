import { normalize } from './normalize.js';
import { segment, countParagraphs } from './segment.js';
import { countSyllables } from './syllables.js';
import { extractWords, computeReadability, computeFleschRE, computeFkGrade, readabilityLabel } from './metrics.js';
import { scoreSentence, rankSentences, computeSentenceScore } from './difficulty.js';
import {
  AnalysisResultSchema,
  SentenceResultSchema,
  SentenceScoreSchema,
  SentenceMetricsSchema,
  ReadabilityStatsSchema,
  AnalysisStatsSchema,
} from './schemas.js';

/**
 * Analyzes chapter or document text to calculate overall readability,
 * document statistics, and identifies the top 5 most difficult sentences.
 *
 * @param {string} text - Raw chapter text
 * @returns {import('zod').infer<typeof AnalysisResultSchema>}
 */
export function analyze(text) {
  const normalized = normalize(text);

  if (!normalized || normalized.trim().length === 0) {
    return {
      readability: { fleschRE: 0, fkGrade: 0, label: 'Very Difficult' },
      hardest: [],
      stats: { sentences: 0, words: 0, paragraphs: 0 },
    };
  }

  const { sentences, paragraphCount } = segment(normalized);

  if (sentences.length === 0) {
    return {
      readability: { fleschRE: 0, fkGrade: 0, label: 'Very Difficult' },
      hardest: [],
      stats: { sentences: 0, words: 0, paragraphs: paragraphCount },
    };
  }

  const allWords = extractWords(normalized);
  const totalWords = allWords.length;
  const totalSyllables = allWords.reduce((sum, w) => sum + countSyllables(w), 0);
  const totalSentences = sentences.length;

  const readability = computeReadability({
    words: totalWords,
    sentences: totalSentences,
    syllables: totalSyllables,
  });

  const { hardest } = rankSentences(sentences);

  const stats = {
    sentences: totalSentences,
    words: totalWords,
    paragraphs: paragraphCount,
  };

  return {
    readability,
    hardest,
    stats,
  };
}

export {
  scoreSentence,
  normalize,
  segment,
  countParagraphs,
  countSyllables,
  extractWords,
  computeReadability,
  computeFleschRE,
  computeFkGrade,
  readabilityLabel,
  computeSentenceScore,
  rankSentences,
  AnalysisResultSchema,
  SentenceResultSchema,
  SentenceScoreSchema,
  SentenceMetricsSchema,
  ReadabilityStatsSchema,
  AnalysisStatsSchema,
};
