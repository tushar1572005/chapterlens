import { Hono } from 'hono';
import { scoreSentence } from '@chapterlens/analyzer';
import {
  ReviewRequestSchema,
  ReviewResponseSchema,
  MIN_GRADE_IMPROVEMENT,
} from '../lib/schemas.js';
import * as groqLib from '../lib/groq.js';
import { getReviewCache, setReviewCache } from '../lib/cache.js';
import { checkRateLimit, incrementRateLimit } from '../middleware/rateLimit.js';

export const reviewRoute = new Hono();

/**
 * Evaluates candidate rewrites against original sentence using Worker-side scoreSentence.
 * Picks the candidate with the lowest FK Grade.
 *
 * @param {string} originalText
 * @param {number} gradeBefore
 * @param {[string, string]} candidates
 * @returns {{ bestCandidate: string, bestGrade: number, isImproved: boolean }}
 */
function evaluateCandidates(originalText, gradeBefore, candidates) {
  let bestCandidate = candidates[0];
  let bestGrade = scoreSentence(candidates[0]).fkGrade;

  for (let i = 1; i < candidates.length; i++) {
    const grade = scoreSentence(candidates[i]).fkGrade;
    if (grade < bestGrade) {
      bestGrade = grade;
      bestCandidate = candidates[i];
    }
  }

  const isImproved = gradeBefore - bestGrade >= MIN_GRADE_IMPROVEMENT;
  return { bestCandidate, bestGrade, isImproved };
}

reviewRoute.post('/', async (c) => {
  // 1. Zod validate request body
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON request body' }, 400);
  }

  const parseResult = ReviewRequestSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json(
      {
        error: 'Validation failed',
        details: parseResult.error.flatten(),
      },
      400
    );
  }

  const { sentences } = parseResult.data;

  // 2. Cache lookup (hit = return without consuming rate limit or calling Groq)
  const cachedResult = await getReviewCache(c.env?.REVIEW_CACHE, sentences);
  if (cachedResult) {
    return c.json({ ...cachedResult, cached: true }, 200);
  }

  // 3. Rate limit check (per-IP and global daily cap)
  const rateLimitStatus = await checkRateLimit(c);
  if (!rateLimitStatus.ok) {
    return c.json(
      {
        limited: true,
        message: rateLimitStatus.message || 'Rate limit reached',
      },
      429
    );
  }

  // 4. Compute gradeBefore for each sentence independently on Worker
  const sentenceStates = new Map();
  for (const s of sentences) {
    const { fkGrade: gradeBefore } = scoreSentence(s.text);
    sentenceStates.set(s.id, {
      id: s.id,
      text: s.text,
      context: s.context,
      gradeBefore,
      whyHard: '',
      rewrite: s.text,
      gradeAfter: gradeBefore,
      improved: false,
    });
  }

  // 5. Initial Groq LLM call
  let firstReviews;
  try {
    firstReviews = await groqLib.requestLlmRewrites(sentences, c.env);
  } catch (err) {
    // Capacity / error fallback: return friendly capacity banner
    return c.json(
      {
        limited: true,
        message: 'AI review service is temporarily busy or unavailable. Please try again shortly.',
        details: err.message,
      },
      429
    );
  }

  const needsRetry = [];

  for (const review of firstReviews) {
    const state = sentenceStates.get(review.id);
    if (!state) continue;

    state.whyHard = review.whyHard;
    const { bestCandidate, bestGrade, isImproved } = evaluateCandidates(
      state.text,
      state.gradeBefore,
      review.candidates
    );

    if (isImproved) {
      state.rewrite = bestCandidate;
      state.gradeAfter = bestGrade;
      state.improved = true;
    } else {
      state.rewrite = bestCandidate;
      state.gradeAfter = bestGrade;
      needsRetry.push(sentences.find((s) => s.id === review.id));
    }
  }

  // 6. Exactly ONE batched retry for sentences not improved by >= 1.0 grade
  if (needsRetry.length > 0) {
    try {
      const retryReviews = await groqLib.requestLlmRewrites(needsRetry, c.env);

      for (const review of retryReviews) {
        const state = sentenceStates.get(review.id);
        if (!state) continue;

        const { bestCandidate, bestGrade, isImproved } = evaluateCandidates(
          state.text,
          state.gradeBefore,
          review.candidates
        );

        if (isImproved) {
          state.rewrite = bestCandidate;
          state.gradeAfter = bestGrade;
          state.improved = true;
          state.whyHard = review.whyHard || state.whyHard;
        } else {
          // Still unimproved: return original text with improved: false
          state.rewrite = state.text;
          state.gradeAfter = state.gradeBefore;
          state.improved = false;
        }
      }
    } catch {
      for (const retryItem of needsRetry) {
        const state = sentenceStates.get(retryItem.id);
        if (state && !state.improved) {
          state.rewrite = state.text;
          state.gradeAfter = state.gradeBefore;
        }
      }
    }
  }

  // 7. Assemble final response
  const results = sentences.map((s) => {
    const state = sentenceStates.get(s.id);
    return {
      id: state.id,
      original: state.text,
      whyHard: state.whyHard || 'Complex sentence structure and high syllable density.',
      rewrite: state.rewrite,
      gradeBefore: state.gradeBefore,
      gradeAfter: state.gradeAfter,
      improved: state.improved,
    };
  });

  const improvedCount = results.filter((r) => r.improved).length;
  const summary = `${improvedCount} of ${results.length} sentences improved by at least one grade level.`;

  const responsePayload = {
    summary,
    sentences: results,
  };

  const validatedResponse = ReviewResponseSchema.parse(responsePayload);

  // 8. Write to KV cache and increment rate limit counters ONLY after success
  await setReviewCache(c.env?.REVIEW_CACHE, sentences, validatedResponse);
  await incrementRateLimit(c);

  return c.json(validatedResponse, 200);
});
