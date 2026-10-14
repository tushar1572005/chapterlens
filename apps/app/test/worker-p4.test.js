import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../worker/index.js';
import * as groqLib from '../worker/lib/groq.js';
import { hashIp } from '../worker/middleware/rateLimit.js';
import { computeCacheKey } from '../worker/lib/cache.js';

/**
 * Creates an in-memory mock KVNamespace object.
 */
function createMockKV() {
  const store = new Map();
  return {
    async get(key, type = 'text') {
      const val = store.get(key);
      if (val === undefined) return null;
      if (type === 'json') return JSON.parse(val);
      return val;
    },
    async put(key, value) {
      store.set(key, typeof value === 'string' ? value : JSON.stringify(value));
    },
    async delete(key) {
      store.delete(key);
    },
    _store: store,
  };
}

describe('P4 Worker Middleware: Turnstile, Cache, and Rate Limits', () => {
  let mockKv;
  const env = {
    GROQ_API_KEY: 'test-key',
    GROQ_MODEL: 'openai/gpt-oss-120b',
    TURNSTILE_SECRET: 'test-turnstile-secret',
    IP_HASH_SALT: 'test-salt-secret-0123456789abcdef',
    PER_IP_DAILY_LIMIT: '3',
    GLOBAL_DAILY_CAP: '100',
    REVIEW_CACHE: null,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    mockKv = createMockKV();
    env.REVIEW_CACHE = mockKv;

    // Default global fetch mock for Turnstile siteverify (success)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      })
    );
  });

  describe('Task 3: Turnstile Middleware', () => {
    it('returns 403 if Turnstile token is missing', async () => {
      const res = await app.request(
        '/api/review',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sentences: [{ id: 's0', text: 'Sample difficult sentence here.' }],
          }),
        },
        env
      );

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain('Turnstile verification failed');
      expect(data.message).toContain('Missing Turnstile challenge token');
    });

    it('returns 403 if Cloudflare siteverify rejects the token', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ success: false, 'error-codes': ['invalid-input-response'] }),
        })
      );

      const res = await app.request(
        '/api/review',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'cf-turnstile-token': 'invalid-token',
          },
          body: JSON.stringify({
            sentences: [{ id: 's0', text: 'Sample difficult sentence here.' }],
          }),
        },
        env
      );

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain('Turnstile verification failed');
    });
  });

  describe('Task 4: HMAC IP Hashing & Rate Limits', () => {
    it('hashes IP addresses using HMAC-SHA-256 with IP_HASH_SALT', async () => {
      const ip = '198.51.100.42';
      const salt = 'my-secret-salt-key';
      const hash1 = await hashIp(ip, salt);
      const hash2 = await hashIp(ip, salt);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[0-9a-f]{64}$/);
      expect(hash1).not.toBe(ip);
      // Different salt gives different hash
      const hashDiffSalt = await hashIp(ip, 'another-salt');
      expect(hashDiffSalt).not.toBe(hash1);
    });

    it('returns 429 when per-IP daily limit is exceeded', async () => {
      vi.spyOn(groqLib, 'requestLlmRewrites').mockResolvedValue([
        {
          id: 's0',
          whyHard: 'Reason',
          candidates: ['Simpler sentence rewrite one.', 'Simpler sentence rewrite two.'],
        },
      ]);

      const clientHeaders = {
        'Content-Type': 'application/json',
        'cf-turnstile-token': 'valid-token',
        'CF-Connecting-IP': '203.0.113.195',
      };

      // 3 allowed requests with different sentences to avoid cache hit
      for (let i = 0; i < 3; i++) {
        const res = await app.request(
          '/api/review',
          {
            method: 'POST',
            headers: clientHeaders,
            body: JSON.stringify({
              sentences: [{ id: 's0', text: `Different complex sentence number ${i}.` }],
            }),
          },
          env
        );
        expect(res.status).toBe(200);
      }

      // 4th request from same IP should be blocked with 429
      const blockedRes = await app.request(
        '/api/review',
        {
          method: 'POST',
          headers: clientHeaders,
          body: JSON.stringify({
            sentences: [{ id: 's0', text: 'Fourth complex sentence attempt.' }],
          }),
        },
        env
      );

      expect(blockedRes.status).toBe(429);
      const data = await blockedRes.json();
      expect(data.limited).toBe(true);
      expect(data.message).toContain('Daily AI review limit of 3 requests reached for your IP');
    });

    it('returns 429 when global daily cap is reached', async () => {
      // Simulate global cap reached in KV
      const now = new Date();
      const month = String(now.getUTCMonth() + 1).padStart(2, '0');
      const day = String(now.getUTCDate()).padStart(2, '0');
      const dateStr = `${now.getUTCFullYear()}-${month}-${day}`;
      await mockKv.put(`limit:global:${dateStr}`, '100');

      const res = await app.request(
        '/api/review',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'cf-turnstile-token': 'valid-token',
            'CF-Connecting-IP': '192.0.2.1',
          },
          body: JSON.stringify({
            sentences: [{ id: 's0', text: 'Some difficult chapter text.' }],
          }),
        },
        env
      );

      expect(res.status).toBe(429);
      const data = await res.json();
      expect(data.limited).toBe(true);
      expect(data.message).toContain('Global daily AI review capacity reached');
    });

    it('does not increment rate limit counters on blocked or failed requests', async () => {
      // Missing turnstile token -> 403
      await app.request(
        '/api/review',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sentences: [{ id: 's0', text: 'Some text.' }],
          }),
        },
        env
      );

      // KV store should remain empty (0 keys)
      expect(mockKv._store.size).toBe(0);
    });
  });

  describe('Task 5: KV Cache with context hashing', () => {
    it('hashes sentences AND their context together', async () => {
      const sentencesA = [{ id: 's0', text: 'Sentence text.', context: 'Context A' }];
      const sentencesB = [{ id: 's0', text: 'Sentence text.', context: 'Context B' }];

      const keyA = await computeCacheKey(sentencesA);
      const keyB = await computeCacheKey(sentencesB);

      expect(keyA).not.toBe(keyB);
      expect(keyA).toMatch(/^review:[0-9a-f]{64}$/);
    });

    it('serves second identical request from cache without calling Groq and without consuming quota', async () => {
      const groqSpy = vi.spyOn(groqLib, 'requestLlmRewrites').mockResolvedValue([
        {
          id: 's0',
          whyHard: 'Reason',
          candidates: ['Simpler sentence rewrite one.', 'Simpler sentence rewrite two.'],
        },
      ]);

      const reqPayload = {
        sentences: [{ id: 's0', text: 'A sophisticated and difficult sentence for testing.', context: 'Intro.' }],
      };

      const reqInit = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'cf-turnstile-token': 'valid-token',
          'CF-Connecting-IP': '203.0.113.88',
        },
        body: JSON.stringify(reqPayload),
      };

      // 1st request: cache miss, calls Groq
      const res1 = await app.request('/api/review', reqInit, env);
      expect(res1.status).toBe(200);
      expect(groqSpy).toHaveBeenCalledTimes(1);

      // 2nd identical request: served from cache
      const res2 = await app.request('/api/review', reqInit, env);
      expect(res2.status).toBe(200);
      const data2 = await res2.json();
      expect(data2.cached).toBe(true);
      expect(groqSpy).toHaveBeenCalledTimes(1); // Groq was NOT called again

      // Verify counter was incremented only once
      const now = new Date();
      const month = String(now.getUTCMonth() + 1).padStart(2, '0');
      const day = String(now.getUTCDate()).padStart(2, '0');
      const dateStr = `${now.getUTCFullYear()}-${month}-${day}`;
      const globalCount = await mockKv.get(`limit:global:${dateStr}`);
      expect(globalCount).toBe('1');
    });
  });
});
