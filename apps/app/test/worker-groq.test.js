import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requestLlmRewrites, SYSTEM_PROMPT } from '../worker/lib/groq.js';

const mockCreate = vi.fn();

vi.mock('groq-sdk', () => {
  return {
    Groq: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    })),
  };
});

describe('groq.js LLM integration', () => {
  const env = {
    GROQ_API_KEY: 'test-groq-key',
    GROQ_MODEL: 'openai/gpt-oss-120b',
  };

  const sentences = [
    {
      id: 's0',
      text: 'Dr. Hawthorne paused near the towering cedar shelves in the library.',
      context: 'The ancient library was cold.',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls Groq with JSON mode, max_tokens, and correct model name', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              reviews: [
                {
                  id: 's0',
                  whyHard: 'Complex syntax',
                  candidates: [
                    'Dr. Hawthorne stopped near the tall cedar shelves in the library.',
                    'Hawthorne stood quietly near the towering cedar library shelves.',
                  ],
                },
              ],
            }),
          },
        },
      ],
    });

    const reviews = await requestLlmRewrites(sentences, env);
    expect(reviews).toHaveLength(1);
    expect(reviews[0].id).toBe('s0');
    expect(reviews[0].candidates).toHaveLength(2);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockCreate.mock.calls[0][0];

    expect(callArgs.model).toBe('openai/gpt-oss-120b');
    expect(callArgs.response_format).toEqual({ type: 'json_object' });
    expect(callArgs.max_tokens).toBe(1500);

    // Verify system prompt contains security and integrity instructions
    const systemMessage = callArgs.messages.find((m) => m.role === 'system');
    expect(systemMessage.content).toContain('SECURITY & INTEGRITY INSTRUCTIONS');
    expect(systemMessage.content).toContain('<sentence_to_review>');

    // Verify user prompt delimits sentence to review
    const userMessage = callArgs.messages.find((m) => m.role === 'user');
    expect(userMessage.content).toContain('<sentence_to_review>');
    expect(userMessage.content).toContain(sentences[0].text);
  });

  it('fails fast if GROQ_API_KEY or GROQ_MODEL is missing', async () => {
    await expect(requestLlmRewrites(sentences, {})).rejects.toThrow(
      /Missing required environment variable: GROQ_API_KEY/i
    );
    await expect(
      requestLlmRewrites(sentences, { GROQ_API_KEY: 'test-key' })
    ).rejects.toThrow(/Missing required environment variable: GROQ_MODEL/i);
  });

  it('throws an error if Groq returns invalid JSON', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: 'Not valid JSON content',
          },
        },
      ],
    });

    await expect(requestLlmRewrites(sentences, env)).rejects.toThrow(
      /Failed to parse Groq JSON response/i
    );
  });
});
