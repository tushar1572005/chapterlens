import { describe, it, expect } from 'vitest';
import {
  ReviewRequestSchema,
  ReviewResponseSchema,
  validateLlmOutput,
} from '../worker/lib/schemas.js';

describe('Worker schemas and LLM output hardening', () => {
  describe('ReviewRequestSchema', () => {
    it('validates a valid request payload', () => {
      const valid = {
        sentences: [
          { id: 's0', text: 'This is a sample sentence.', context: 'Previous sentence.' },
          { id: 's1', text: 'This is another sentence.' },
        ],
        turnstileToken: 'test-token',
      };
      expect(() => ReviewRequestSchema.parse(valid)).not.toThrow();
    });

    it('rejects more than 5 sentences', () => {
      const invalid = {
        sentences: Array.from({ length: 6 }, (_, i) => ({
          id: `s${i}`,
          text: `Sentence number ${i}.`,
        })),
      };
      expect(() => ReviewRequestSchema.parse(invalid)).toThrow(
        /Cannot review more than 5 sentences/i
      );
    });

    it('rejects empty sentences list', () => {
      expect(() => ReviewRequestSchema.parse({ sentences: [] })).toThrow(
        /Must provide at least 1 sentence/i
      );
    });

    it('rejects non-positional sentence IDs', () => {
      const invalid = {
        sentences: [{ id: 'custom-sentence-id', text: 'Some text.' }],
      };
      expect(() => ReviewRequestSchema.parse(invalid)).toThrow(/ID must be positional/i);
    });

    it('rejects sentences exceeding 2000 characters', () => {
      const invalid = {
        sentences: [{ id: 's0', text: 'a'.repeat(2001) }],
      };
      expect(() => ReviewRequestSchema.parse(invalid)).toThrow(/cannot exceed 2000 characters/i);
    });
  });

  describe('validateLlmOutput hardening', () => {
    const inputSentences = [
      { id: 's0', text: 'The ancient library smelled of parchment and damp stone.' },
      { id: 's1', text: 'Dr. Hawthorne paused near the towering cedar shelves.' },
    ];

    it('accepts compliant LLM output with exactly 2 candidates', () => {
      const llmOutput = {
        reviews: [
          {
            id: 's0',
            whyHard: 'Aged descriptive tone',
            candidates: [
              'The old library smelled of paper and wet stone.',
              'Inside the ancient library was the scent of stone and parchment.',
            ],
          },
          {
            id: 's1',
            whyHard: 'Formal phrasing',
            candidates: [
              'Dr. Hawthorne stopped near the tall cedar shelves.',
              'Hawthorne paused by the towering wooden shelves.',
            ],
          },
        ],
      };
      expect(() => validateLlmOutput(llmOutput, inputSentences)).not.toThrow();
    });

    it('rejects unknown IDs not present in input sentences', () => {
      const llmOutput = {
        reviews: [
          {
            id: 's999',
            whyHard: 'Reason',
            candidates: ['Candidate one here.', 'Candidate two here.'],
          },
        ],
      };
      expect(() => validateLlmOutput(llmOutput, inputSentences)).toThrow(
        /LLM returned unknown sentence ID: "s999"/i
      );
    });

    it('rejects duplicate sentence IDs in output', () => {
      const llmOutput = {
        reviews: [
          {
            id: 's0',
            whyHard: 'Reason 1',
            candidates: [
              'The ancient library smelled of paper and wet stone.',
              'Inside the ancient library was the scent of stone and parchment.',
            ],
          },
          {
            id: 's0',
            whyHard: 'Reason 2',
            candidates: [
              'The ancient library smelled of paper and wet stone.',
              'Inside the ancient library was the scent of stone and parchment.',
            ],
          },
        ],
      };
      expect(() => validateLlmOutput(llmOutput, inputSentences)).toThrow(
        /LLM returned duplicate sentence ID: "s0"/i
      );
    });

    it('rejects empty candidate rewrites', () => {
      const llmOutput = {
        reviews: [
          {
            id: 's0',
            whyHard: 'Reason',
            candidates: [
              'The ancient library smelled of paper and wet stone.',
              '   ',
            ],
          },
        ],
      };
      expect(() => validateLlmOutput(llmOutput, inputSentences)).toThrow(
        /Candidate 2 for s0 is empty/i
      );
    });

    it('rejects candidate identical to the original sentence', () => {
      const llmOutput = {
        reviews: [
          {
            id: 's0',
            whyHard: 'Reason',
            candidates: [
              'The ancient library smelled of parchment and damp stone.',
              'A different rewrite here.',
            ],
          },
        ],
      };
      expect(() => validateLlmOutput(llmOutput, inputSentences)).toThrow(
        /identical to the original sentence/i
      );
    });

    it('rejects candidate length outside 0.4x–1.5x of original length', () => {
      const llmOutputTooShort = {
        reviews: [
          {
            id: 's0',
            whyHard: 'Reason',
            candidates: ['Too brief.', 'A reasonable candidate rewrite here.'],
          },
        ],
      };
      expect(() => validateLlmOutput(llmOutputTooShort, inputSentences)).toThrow(
        /outside 0.4x–1.5x range/i
      );

      const llmOutputTooLong = {
        reviews: [
          {
            id: 's0',
            whyHard: 'Reason',
            candidates: [
              'A reasonable candidate rewrite.',
              'This sentence is excessively long and verbose and expands far beyond the original bounds of the text to an absurd extent.'.repeat(
                2
              ),
            ],
          },
        ],
      };
      expect(() => validateLlmOutput(llmOutputTooLong, inputSentences)).toThrow(
        /outside 0.4x–1.5x range/i
      );
    });
  });

  describe('ReviewResponseSchema', () => {
    it('validates a response with improved: boolean flag', () => {
      const response = {
        summary: '1 of 1 sentences improved by at least one grade level.',
        sentences: [
          {
            id: 's0',
            original: 'Original text here.',
            whyHard: 'High clause density.',
            rewrite: 'Simpler rewrite here.',
            gradeBefore: 12.5,
            gradeAfter: 8.4,
            improved: true,
          },
        ],
      };
      expect(() => ReviewResponseSchema.parse(response)).not.toThrow();
    });
  });
});
