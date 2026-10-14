import { z } from 'zod';

/**
 * Zod schema for individual sentence metrics.
 */
export const SentenceMetricsSchema = z.object({
  words: z.number().int().nonnegative(),
  avgSyllables: z.number().nonnegative(),
  longWords: z.number().int().nonnegative(),
  commas: z.number().int().nonnegative(),
});

/**
 * Zod schema for SentenceResult (hardest sentences array).
 */
export const SentenceResultSchema = z.object({
  id: z.string().regex(/^s\d+$/),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  text: z.string(),
  metrics: SentenceMetricsSchema,
  score: z.number().min(0).max(100),
  tooLongForAi: z.boolean(),
});

/**
 * Zod schema for SentenceScore (returned by scoreSentence).
 */
export const SentenceScoreSchema = z.object({
  metrics: SentenceMetricsSchema,
  score: z.number().min(0).max(100),
  fkGrade: z.number(),
});

/**
 * Zod schema for overall readability scores.
 */
export const ReadabilityStatsSchema = z.object({
  fleschRE: z.number(),
  fkGrade: z.number(),
  label: z.string(),
});

/**
 * Zod schema for document statistics.
 */
export const AnalysisStatsSchema = z.object({
  sentences: z.number().int().nonnegative(),
  words: z.number().int().nonnegative(),
  paragraphs: z.number().int().nonnegative(),
});

/**
 * Zod schema for the full AnalysisResult.
 */
export const AnalysisResultSchema = z.object({
  readability: ReadabilityStatsSchema,
  hardest: z.array(SentenceResultSchema).max(5),
  stats: AnalysisStatsSchema,
});
