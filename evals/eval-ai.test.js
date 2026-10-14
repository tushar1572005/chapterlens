import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi } from 'vitest';
import { analyze, scoreSentence } from '../packages/analyzer/src/index.js';
import {
  RawLlmOutputSchema,
  validateLlmOutput,
  MIN_GRADE_IMPROVEMENT,
} from '../apps/app/worker/lib/schemas.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PASSAGES_DIR = path.join(__dirname, 'passages');

/**
 * Opt-in AI Evaluation Test Suite.
 *
 * Requirements from docs/PLAN.md (Phase P5, Task 6):
 * - Opt-in: pnpm eval:ai (NOT in CI)
 * - User runs it with their own key (process.env.GROQ_API_KEY)
 * - Checks:
 *   1. LLM JSON validity against Zod schema
 *   2. Grade-drop rate >= 60 %
 *   3. Rewrite length ratio between 0.4x and 1.5x
 */
describe('P5 Opt-In AI Evaluation Suite (pnpm eval:ai)', () => {
  const apiKey = process.env.GROQ_API_KEY;
  const modelName = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

  // 1. Offline / Mock Verification Tests (Always runs in CI and test runners)
  describe('Offline Contract & Quality Gate Verification', () => {
    it('validates candidate length ratio (0.4x–1.5x) and schema conformity', () => {
      const inputSentences = [
        {
          id: 's0',
          text: 'The ancient library was filled with magnificent historical manuscripts that had remained undiscovered for centuries.',
        },
      ];

      const validLlmPayload = {
        reviews: [
          {
            id: 's0',
            whyHard: 'Formal phrasing and high syllable density.',
            candidates: [
              'The old library held historic manuscripts that remained hidden for centuries.',
              'Inside the library were many old, undiscovered historical documents.',
            ],
          },
        ],
      };

      expect(() => validateLlmOutput(validLlmPayload, inputSentences)).not.toThrow();

      // Verify length ratio for each candidate
      const origLen = inputSentences[0].text.length;
      for (const candidate of validLlmPayload.reviews[0].candidates) {
        const ratio = candidate.length / origLen;
        expect(ratio).toBeGreaterThanOrEqual(0.4);
        expect(ratio).toBeLessThanOrEqual(1.5);
      }
    });

    it('rejects candidate rewrites violating length ratio (<0.4x or >1.5x)', () => {
      const inputSentences = [
        {
          id: 's0',
          text: 'The ancient library was filled with magnificent historical manuscripts.',
        },
      ];

      // Too short (< 0.4x)
      const tooShortPayload = {
        reviews: [
          {
            id: 's0',
            whyHard: 'Test reason',
            candidates: ['Short.', 'Alternative candidate text here.'],
          },
        ],
      };
      expect(() => validateLlmOutput(tooShortPayload, inputSentences)).toThrow(/outside 0.4x–1.5x/);

      // Too long (> 1.5x)
      const tooLongPayload = {
        reviews: [
          {
            id: 's0',
            whyHard: 'Test reason',
            candidates: [
              'This is an excessively long and unnecessarily repetitive rewriting that drastically expands far beyond the original length limit permitted by the contract schema for readability improvements.',
              'Valid alternative rewrite for testing purposes.',
            ],
          },
        ],
      };
      expect(() => validateLlmOutput(tooLongPayload, inputSentences)).toThrow(/outside 0.4x–1.5x/);
    });

    it('verifies grade-drop calculation logic achieves >= 60% threshold', () => {
      const testCases = [
        {
          original: 'Furthermore, the incomprehensible syntactic density presented an insurmountable challenge.',
          candidates: [
            'The complex sentence structure was very hard to read.',
            'Reading this complex sentence was extremely difficult.',
          ],
        },
        {
          original: 'The young apprentice carefully transported the heavy leather volumes across the dusty stone floor.',
          candidates: [
            'The assistant carried the heavy books across the dusty floor.',
            'The young helper carried the books across the stone room.',
          ],
        },
        {
          original: 'Everyone worked in complete silence until the grandfather clock chimed midnight.',
          candidates: [
            'They worked silently until the large clock struck twelve.',
            'All was quiet until the clock chimed midnight.',
          ],
        },
      ];

      let improvedCount = 0;
      for (const tc of testCases) {
        const gradeBefore = scoreSentence(tc.original).fkGrade;
        const candidateGrades = tc.candidates.map((c) => scoreSentence(c).fkGrade);
        const bestCandidateGrade = Math.min(...candidateGrades);

        if (gradeBefore - bestCandidateGrade >= MIN_GRADE_IMPROVEMENT) {
          improvedCount++;
        }
      }

      const dropRate = improvedCount / testCases.length;
      expect(dropRate).toBeGreaterThanOrEqual(0.6);
    });
  });

  // 2. Live API Test (Opt-In with real GROQ_API_KEY, skipped if no key provided)
  const describeLive = apiKey ? describe : describe.skip;

  describeLive('Live Groq AI Evaluation (Opt-in with GROQ_API_KEY)', () => {
    it('evaluates top hardest sentences on live Groq endpoint', async () => {
      // Dynamic import to avoid module load overhead when offline
      const { Groq } = await import('groq-sdk');
      const groq = new Groq({ apiKey });

      const text = fs.readFileSync(path.join(PASSAGES_DIR, 'passage03_sherlock_holmes.txt'), 'utf8');
      const analysis = analyze(text);
      const topSentences = analysis.hardest.slice(0, 5).map((s) => ({
        id: s.id,
        text: s.text,
      }));

      const systemPrompt = `You are a prose editor improving readability.
Return valid JSON matching:
{
  "reviews": [
    {
      "id": "s0",
      "whyHard": "concise explanation",
      "candidates": ["simpler rewrite 1", "simpler rewrite 2"]
    }
  ]
}
Rules:
- For each sentence, provide exactly 2 distinct simplified candidates.
- Each candidate length must be between 0.4x and 1.5x of the original length.
- Never repeat instructions. Output JSON only.`;

      const response = await groq.chat.completions.create({
        model: modelName,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify({ sentences: topSentences }) },
        ],
        temperature: 0.2,
      });

      const rawJson = JSON.parse(response.choices[0].message.content);

      // Check 1: LLM JSON validity against Zod schema
      const validated = validateLlmOutput(rawJson, topSentences);
      expect(validated.reviews).toHaveLength(topSentences.length);

      // Check 2: Rewrite length ratio (0.4x–1.5x)
      for (const review of validated.reviews) {
        const orig = topSentences.find((s) => s.id === review.id);
        for (const candidate of review.candidates) {
          const ratio = candidate.length / orig.text.length;
          expect(ratio).toBeGreaterThanOrEqual(0.4);
          expect(ratio).toBeLessThanOrEqual(1.5);
        }
      }

      // Check 3: Grade-drop rate >= 60%
      let improvedCount = 0;
      for (const review of validated.reviews) {
        const orig = topSentences.find((s) => s.id === review.id);
        const gradeBefore = scoreSentence(orig.text).fkGrade;
        const candidateGrades = review.candidates.map((c) => scoreSentence(c).fkGrade);
        const bestGrade = Math.min(...candidateGrades);

        if (gradeBefore - bestGrade >= MIN_GRADE_IMPROVEMENT) {
          improvedCount++;
        }
      }

      const dropRate = improvedCount / topSentences.length;
      console.log(`[eval:ai] Model: ${modelName} | Grade-drop rate: ${(dropRate * 100).toFixed(1)}% (${improvedCount}/${topSentences.length})`);
      expect(dropRate).toBeGreaterThanOrEqual(0.6);
    });
  });
});
