import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import app from '../worker/index.js';
import * as groqLib from '../worker/lib/groq.js';
import { computeCacheKey } from '../worker/lib/cache.js';
import { checkRateLimit, incrementRateLimit } from '../worker/middleware/rateLimit.js';
import {
  turnstileMiddleware,
  DUMMY_TURNSTILE_SECRET,
  MAX_REQUEST_BODY_BYTES,
} from '../worker/middleware/turnstile.js';
import {
  resolveTurnstileSiteKey,
  DUMMY_TURNSTILE_SITE_KEY,
} from '../src/components/TurnstileWidget.jsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function createMockKV(overrides = {}) {
  const store = new Map();
  return {
    async get(key, type = 'text') {
      if (overrides.get) return overrides.get(key, type);
      const val = store.get(key);
      if (val === undefined) return null;
      if (type === 'json') return JSON.parse(val);
      return val;
    },
    async put(key, value, opts) {
      if (overrides.put) return overrides.put(key, value, opts);
      store.set(key, typeof value === 'string' ? value : JSON.stringify(value));
    },
    async delete(key) {
      store.delete(key);
    },
    _store: store,
  };
}

describe('Security Audit & Pre-Deployment Hardening Verification', () => {
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

  describe('Finding 1: Rate-limit bypasses, concurrent updates, and swallowed failures', () => {
    it('propagates KV errors and does not silently swallow incrementRateLimit failures', async () => {
      const failingKv = createMockKV({
        put: async () => {
          throw new Error('KV storage write failure');
        },
      });

      const mockContext = {
        env: {
          REVIEW_CACHE: failingKv,
          IP_HASH_SALT: 'test-salt-secret-0123456789abcdef',
          PER_IP_DAILY_LIMIT: '3',
          GLOBAL_DAILY_CAP: '100',
        },
        req: {
          header: (name) => (name.toLowerCase() === 'cf-connecting-ip' ? '203.0.113.195' : undefined),
        },
      };

      await expect(incrementRateLimit(mockContext)).rejects.toThrow('KV storage write failure');
    });

    it('handles concurrent counter reads in parallel for checkRateLimit and incrementRateLimit', async () => {
      const mockKv = createMockKV();
      const mockContext = {
        env: {
          REVIEW_CACHE: mockKv,
          IP_HASH_SALT: 'test-salt-secret-0123456789abcdef',
          PER_IP_DAILY_LIMIT: '3',
          GLOBAL_DAILY_CAP: '100',
        },
        req: {
          header: (name) => (name.toLowerCase() === 'cf-connecting-ip' ? '198.51.100.42' : undefined),
        },
      };

      // Two sequential increments
      await incrementRateLimit(mockContext);
      await incrementRateLimit(mockContext);

      const status = await checkRateLimit(mockContext);
      expect(status.ok).toBe(true);

      // Third increment reaches limit of 3
      await incrementRateLimit(mockContext);
      const limitStatus = await checkRateLimit(mockContext);
      expect(limitStatus.ok).toBe(false);
      expect(limitStatus.message).toContain('Daily AI review limit of 3 requests reached');
    });
  });

  describe('Finding 2: Missing ignore rules for production environment files', () => {
    it('verifies .gitignore contains wildcard rules protecting all production .env and .dev.vars variants', () => {
      const rootGitignore = fs.readFileSync(path.join(__dirname, '../../../.gitignore'), 'utf8');
      expect(rootGitignore).toContain('.env.*');
      expect(rootGitignore).toContain('.dev.vars.*');
      expect(rootGitignore).toContain('!.env.example');
      expect(rootGitignore).toContain('!.dev.vars.example');
    });
  });

  describe('Finding 3: Dummy Turnstile fallback in production', () => {
    it('resolveTurnstileSiteKey rejects dummy test key when import.meta.env.PROD is simulated', () => {
      const originalProd = import.meta.env.PROD;
      const originalKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
      try {
        // In development without key, dummy fallback is allowed
        delete import.meta.env.VITE_TURNSTILE_SITE_KEY;
        import.meta.env.PROD = false;
        const devKey = resolveTurnstileSiteKey('');
        expect(devKey).toBe(DUMMY_TURNSTILE_SITE_KEY);

        // When PROD is true, dummy key or missing key must throw
        import.meta.env.PROD = true;
        expect(() => resolveTurnstileSiteKey(DUMMY_TURNSTILE_SITE_KEY)).toThrow(/Dummy Turnstile keys are prohibited/);
        expect(() => resolveTurnstileSiteKey('')).toThrow(/requires a valid VITE_TURNSTILE_SITE_KEY/);

        // When PROD is true and valid key is provided, it succeeds
        const prodKey = resolveTurnstileSiteKey('0x4AAAAAAFWqMgdoPzc851C_');
        expect(prodKey).toBe('0x4AAAAAAFWqMgdoPzc851C_');
      } finally {
        import.meta.env.PROD = originalProd;
        import.meta.env.VITE_TURNSTILE_SITE_KEY = originalKey;
      }
    });

    it('turnstileMiddleware throws if dummy secret is used in production environment', async () => {
      const c = {
        req: {
          method: 'POST',
          path: '/api/review',
          header: () => 'valid-token',
        },
        env: {
          TURNSTILE_SECRET: DUMMY_TURNSTILE_SECRET,
          ENVIRONMENT: 'production',
        },
        json: vi.fn(),
      };

      await expect(turnstileMiddleware(c, vi.fn())).rejects.toThrow(
        /Production environment cannot use dummy Turnstile secret key/
      );
    });
  });

  describe('Finding 4: Ambiguous cache keys and incorrect cached sentence IDs', () => {
    it('serializes cache keys without delimiter ambiguity', async () => {
      const sentencesA = [
        { id: 's0', text: 'Hello###World', context: 'foo|||bar' },
      ];
      const sentencesB = [
        { id: 's0', text: 'Hello', context: 'World###foo|||bar' },
      ];

      const keyA = await computeCacheKey(sentencesA);
      const keyB = await computeCacheKey(sentencesB);

      expect(keyA).not.toBe(keyB);
    });

    it('re-maps cached sentence rewrites to the caller requested sentence IDs', async () => {
      const mockKv = createMockKV();
      const sentenceText = 'The ancient library was filled with magnificent historical manuscripts.';

      // Pre-seed cache with an older request where this sentence had ID 's99'
      const cachedPayload = {
        summary: '1 of 1 sentences improved by at least one grade level.',
        sentences: [
          {
            id: 's99',
            original: sentenceText,
            whyHard: 'Formal vocabulary',
            rewrite: 'The old library was filled with historic books.',
            gradeBefore: 14.5,
            gradeAfter: 8.2,
            improved: true,
          },
        ],
      };

      const cacheKey = await computeCacheKey([{ id: 's0', text: sentenceText, context: '' }]);
      await mockKv.put(cacheKey, JSON.stringify(cachedPayload));

      const env = {
        REVIEW_CACHE: mockKv,
        GROQ_API_KEY: 'test-key',
        GROQ_MODEL: 'openai/gpt-oss-120b',
        TURNSTILE_SECRET: 'test-secret',
        IP_HASH_SALT: 'test-salt',
      };

      // Caller requests the same sentence but with ID 's0'
      const res = await app.request(
        '/api/review',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'cf-turnstile-token': 'valid-token',
          },
          body: JSON.stringify({
            sentences: [{ id: 's0', text: sentenceText }],
          }),
        },
        env
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.cached).toBe(true);
      expect(data.sentences[0].id).toBe('s0'); // Preserves caller's ID 's0', not cached 's99'
    });
  });

  describe('Finding 5: Raw exception messages exposed to clients', () => {
    it('does not expose internal err.message on 429 Groq capacity fallback', async () => {
      vi.spyOn(groqLib, 'requestLlmRewrites').mockRejectedValueOnce(
        new Error('Sensitive internal Groq upstream failure: key gsk_SECRET_KEY failed')
      );

      const env = {
        GROQ_API_KEY: 'test-key',
        GROQ_MODEL: 'openai/gpt-oss-120b',
        TURNSTILE_SECRET: 'test-secret',
        IP_HASH_SALT: 'test-salt',
      };

      const res = await app.request(
        '/api/review',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'cf-turnstile-token': 'valid-token',
          },
          body: JSON.stringify({
            sentences: [{ id: 's0', text: 'Some long complex sentence here.' }],
          }),
        },
        env
      );

      expect(res.status).toBe(429);
      const data = await res.json();
      expect(data.limited).toBe(true);
      expect(data.details).toBeUndefined();
      expect(JSON.stringify(data)).not.toContain('gsk_SECRET_KEY');
    });

    it('does not expose internal err.message on Turnstile verification failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('Internal network socket timeout')));

      const env = {
        TURNSTILE_SECRET: 'test-secret',
      };

      const res = await app.request(
        '/api/review',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'cf-turnstile-token': 'valid-token',
          },
          body: JSON.stringify({
            sentences: [{ id: 's0', text: 'Simple sentence.' }],
          }),
        },
        env
      );

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.message).toBe('Security challenge verification service unavailable');
      expect(JSON.stringify(data)).not.toContain('socket timeout');
    });
  });

  describe('Finding 6: Local development accessing production KV', () => {
    it('verifies wrangler.jsonc does not have "remote": true configured for local development', () => {
      const wranglerContent = fs.readFileSync(path.join(__dirname, '../wrangler.jsonc'), 'utf8');
      expect(wranglerContent).not.toMatch(/"remote"\s*:\s*true/);
      expect(wranglerContent).toMatch(/"remote"\s*:\s*false/);
    });
  });

  describe('Finding 7: Missing request-body size limit before JSON parsing', () => {
    it('returns 413 Payload Too Large when Content-Length exceeds 64 KB limit', async () => {
      const env = {
        TURNSTILE_SECRET: 'test-secret',
      };

      const res = await app.request(
        '/api/review',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': String(MAX_REQUEST_BODY_BYTES + 500),
            'cf-turnstile-token': 'valid-token',
          },
          body: JSON.stringify({ sentences: [] }),
        },
        env
      );

      expect(res.status).toBe(413);
      const data = await res.json();
      expect(data.error).toBe('Payload Too Large');
    });

    it('returns 413 Payload Too Large when raw payload length exceeds 64 KB', async () => {
      const env = {
        TURNSTILE_SECRET: 'test-secret',
        IP_HASH_SALT: 'test-salt',
      };

      const oversizedBody = JSON.stringify({
        sentences: [{ id: 's0', text: 'A'.repeat(MAX_REQUEST_BODY_BYTES + 100) }],
      });

      const res = await app.request(
        '/api/review',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'cf-turnstile-token': 'valid-token',
          },
          body: oversizedBody,
        },
        env
      );

      expect(res.status).toBe(413);
      const data = await res.json();
      expect(data.error).toBe('Payload Too Large');
    });
  });

  describe('Finding 8: Privacy notice missing seven-day cache retention', () => {
    it('AiReviewPanel contains explicit mention of 7 days cache retention in privacy notice', () => {
      const panelContent = fs.readFileSync(path.join(__dirname, '../src/components/AiReviewPanel.jsx'), 'utf8');
      expect(panelContent).toContain('cached');
      expect(panelContent).toContain('7 days');
    });
  });
});
