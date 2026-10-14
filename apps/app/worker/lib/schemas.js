import { z } from 'zod';

export const MAX_SENTENCES = 5;
export const MAX_SENTENCE_LENGTH = 2000;
export const MIN_GRADE_IMPROVEMENT = 1.0;

/**
 * Zod schema for individual input sentences in POST /api/review.
 */
export const ReviewSentenceItemSchema = z.object({
  id: z.string().regex(/^s\d+$/, 'ID must be positional (e.g. s0, s1)'),
  text: z
    .string()
    .min(1, 'Sentence text cannot be empty')
    .max(MAX_SENTENCE_LENGTH, `Sentence text cannot exceed ${MAX_SENTENCE_LENGTH} characters`),
  context: z
    .string()
    .max(MAX_SENTENCE_LENGTH * 3, 'Context too long')
    .optional()
    .default(''),
});

/**
 * Zod schema for POST /api/review request body.
 */
export const ReviewRequestSchema = z.object({
  sentences: z
    .array(ReviewSentenceItemSchema)
    .min(1, 'Must provide at least 1 sentence')
    .max(MAX_SENTENCES, `Cannot review more than ${MAX_SENTENCES} sentences at once`),
  turnstileToken: z.string().optional().default(''),
});

/**
 * Raw candidate schema from LLM JSON output.
 */
export const LlmSentenceReviewSchema = z.object({
  id: z.string(),
  whyHard: z.string().min(1, 'whyHard description required'),
  candidates: z
    .array(z.string().min(1, 'Candidate rewrite cannot be empty'))
    .length(2, 'Must provide exactly 2 candidates per sentence'),
});

export const RawLlmOutputSchema = z.object({
  reviews: z.array(LlmSentenceReviewSchema),
});

/**
 * Validates and hardens LLM response against original input sentences.
 * Enforces:
 * - Returned IDs are a subset of input IDs
 * - Exactly 2 candidates per sentence
 * - No empty rewrites
 * - No rewrites identical to original
 * - Rewrite length ratio between 0.4x and 1.5x of original
 *
 * @param {unknown} data - Raw parsed JSON from LLM
 * @param {Array<{ id: string, text: string }>} inputSentences - The sentences sent to the LLM
 * @returns {z.infer<typeof RawLlmOutputSchema>}
 */
export function validateLlmOutput(data, inputSentences) {
  const parsed = RawLlmOutputSchema.parse(data);
  const inputMap = new Map(inputSentences.map((s) => [s.id, s.text.trim()]));
  const seenIds = new Set();

  for (const review of parsed.reviews) {
    if (!inputMap.has(review.id)) {
      throw new Error(`LLM returned unknown sentence ID: "${review.id}"`);
    }
    if (seenIds.has(review.id)) {
      throw new Error(`LLM returned duplicate sentence ID: "${review.id}"`);
    }
    seenIds.add(review.id);

    const originalText = inputMap.get(review.id);
    const origLen = originalText.length;
    const minLen = Math.floor(origLen * 0.4);
    const maxLen = Math.ceil(origLen * 1.5);

    for (const [idx, candidate] of review.candidates.entries()) {
      const trimmed = candidate.trim();
      if (!trimmed) {
        throw new Error(`Candidate ${idx + 1} for ${review.id} is empty`);
      }
      if (trimmed.toLowerCase() === originalText.toLowerCase()) {
        throw new Error(`Candidate ${idx + 1} for ${review.id} is identical to the original sentence`);
      }
      if (trimmed.length < minLen || trimmed.length > maxLen) {
        throw new Error(
          `Candidate ${idx + 1} length (${trimmed.length}) outside 0.4x–1.5x range of original (${origLen} chars)`
        );
      }
    }
  }

  return parsed;
}

/**
 * Zod schema for individual sentence in API response.
 */
export const ReviewResponseSentenceSchema = z.object({
  id: z.string(),
  original: z.string(),
  whyHard: z.string(),
  rewrite: z.string(),
  gradeBefore: z.number(),
  gradeAfter: z.number(),
  improved: z.boolean(),
});

/**
 * Zod schema for full API response shape.
 */
export const ReviewResponseSchema = z.object({
  summary: z.string(),
  sentences: z.array(ReviewResponseSentenceSchema),
});
