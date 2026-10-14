import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../worker/index.js';
import * as groqLib from '../worker/lib/groq.js';
import { ReviewResponseSchema } from '../worker/lib/schemas.js';

describe('Worker Routes (/api/*)', () => {
  const env = {
    GROQ_API_KEY: 'test-key',
    GROQ_MODEL: 'openai/gpt-oss-120b',
    TURNSTILE_SECRET: 'test-turnstile-secret',
    IP_HASH_SALT: 'test-hash-salt-0123456789abcdef',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      })
    );
  });

  describe('GET /api/health', () => {
    it('returns { ok: true, ts: ... }', async () => {
      const res = await app.request('/api/health');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(typeof data.ts).toBe('number');
    });
  });

  describe('Catch-all unknown API routes', () => {
    it('returns JSON 404 for unknown /api/* paths', async () => {
      const res = await app.request('/api/bogus');
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data).toEqual({ error: 'Not found' });
    });

    it('returns JSON 404 for deeply nested unknown /api/* paths', async () => {
      const res = await app.request('/api/v1/unknown/endpoint');
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data).toEqual({ error: 'Not found' });
    });
  });

  describe('POST /api/review end-to-end', () => {
    const validBody = {
      sentences: [
        {
          id: 's0',
          text: 'The ancient library was filled with magnificent historical manuscripts.',
          context: 'It had stood for five centuries.',
        },
      ],
    };

    it('returns 200 with full validated ReviewResponseSchema', async () => {
      vi.spyOn(groqLib, 'requestLlmRewrites').mockResolvedValueOnce([
        {
          id: 's0',
          whyHard: 'Formal vocabulary',
          candidates: [
            'The old library held many historic books and manuscripts.',
            'Inside the library were many old, historic manuscripts.',
          ],
        },
      ]);

      const res = await app.request(
        '/api/review',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'cf-turnstile-token': 'valid-test-token',
          },
          body: JSON.stringify(validBody),
        },
        env
      );

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(() => ReviewResponseSchema.parse(data)).not.toThrow();
      expect(data.sentences).toHaveLength(1);
      expect(data.sentences[0].id).toBe('s0');
      expect(data.sentences[0].original).toBe(validBody.sentences[0].text);
      expect(typeof data.sentences[0].gradeBefore).toBe('number');
      expect(typeof data.sentences[0].gradeAfter).toBe('number');
      expect(typeof data.sentences[0].improved).toBe('boolean');
    });

    it('returns 400 for invalid body payload', async () => {
      const res = await app.request(
        '/api/review',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'cf-turnstile-token': 'valid-test-token',
          },
          body: JSON.stringify({ sentences: [] }),
        },
        env
      );

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Validation failed');
    });

    it('returns 400 for malformed non-JSON payload', async () => {
      const res = await app.request(
        '/api/review',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'cf-turnstile-token': 'valid-test-token',
          },
          body: 'Not valid JSON',
        },
        env
      );

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Invalid JSON request body');
    });

    it('Task 9: ensures no middleware or route logs request bodies or chapter text', async () => {
      const logSpy = vi.spyOn(console, 'log');
      const infoSpy = vi.spyOn(console, 'info');

      vi.spyOn(groqLib, 'requestLlmRewrites').mockResolvedValueOnce([
        {
          id: 's0',
          whyHard: 'Test reason',
          candidates: ['Simpler sentence rewrite one.', 'Alternative simple sentence rewrite.'],
        },
      ]);

      await app.request(
        '/api/review',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'cf-turnstile-token': 'valid-test-token',
          },
          body: JSON.stringify(validBody),
        },
        env
      );

      // Verify neither console.log nor console.info logged chapter text
      const allLoggedText = [...logSpy.mock.calls, ...infoSpy.mock.calls]
        .map((args) => args.join(' '))
        .join(' ');

      expect(allLoggedText).not.toContain(validBody.sentences[0].text);
      expect(allLoggedText).not.toContain('The ancient library');
    });
  });
});
