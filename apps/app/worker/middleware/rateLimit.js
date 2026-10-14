import { requireEnv } from '../lib/env.js';

/**
 * Computes an HMAC-SHA-256 hash of an IP address using secret IP_HASH_SALT.
 * Raw IP addresses and plain reversible SHA-256 hashes are NEVER stored.
 *
 * @param {string} ip
 * @param {string} salt
 * @returns {Promise<string>} Hex-encoded HMAC-SHA-256
 */
export async function hashIp(ip, salt) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(salt),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(ip));
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Returns current UTC date string YYYY-MM-DD for daily rate limit buckets.
 */
export function getDailyDateString() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Checks current KV counters for IP limit and global cap without incrementing.
 *
 * @param {Context} c - Hono context
 * @returns {Promise<{ ok: boolean, message?: string }>}
 */
export async function checkRateLimit(c) {
  const kv = c.env.REVIEW_CACHE;
  if (!kv) return { ok: true };

  const ipLimitStr = requireEnv(c.env, 'PER_IP_DAILY_LIMIT');
  const globalCapStr = requireEnv(c.env, 'GLOBAL_DAILY_CAP');
  const salt = requireEnv(c.env, 'IP_HASH_SALT');

  const ipLimit = parseInt(ipLimitStr, 10);
  const globalCap = parseInt(globalCapStr, 10);

  const dateStr = getDailyDateString();
  const globalKey = `limit:global:${dateStr}`;

  // 1. Check global cap
  const currentGlobal = parseInt((await kv.get(globalKey)) || '0', 10);
  if (currentGlobal >= globalCap) {
    return {
      ok: false,
      message: 'Global daily AI review capacity reached. Please try again tomorrow.',
    };
  }

  // 2. Check per-IP limit
  const clientIp = c.req.header('CF-Connecting-IP') || '127.0.0.1';
  const hashedIp = await hashIp(clientIp, salt);
  const ipKey = `limit:ip:${dateStr}:${hashedIp}`;

  const currentIpCount = parseInt((await kv.get(ipKey)) || '0', 10);
  if (currentIpCount >= ipLimit) {
    return {
      ok: false,
      message: `Daily AI review limit of ${ipLimit} requests reached for your IP. Please try again tomorrow.`,
    };
  }

  return { ok: true };
}

/**
 * Increments rate limit counters in KV with a 24h expiration TTL.
 * MUST only be called after a successful, uncached AI review.
 *
 * @param {Context} c
 */
export async function incrementRateLimit(c) {
  const kv = c.env.REVIEW_CACHE;
  if (!kv) return;

  try {
    const salt = requireEnv(c.env, 'IP_HASH_SALT');
    const dateStr = getDailyDateString();
    const globalKey = `limit:global:${dateStr}`;

    const clientIp = c.req.header('CF-Connecting-IP') || '127.0.0.1';
    const hashedIp = await hashIp(clientIp, salt);
    const ipKey = `limit:ip:${dateStr}:${hashedIp}`;

    const TTL_24H = 86400;

    // Read and increment global
    const currentGlobal = parseInt((await kv.get(globalKey)) || '0', 10);
    await kv.put(globalKey, String(currentGlobal + 1), { expirationTtl: TTL_24H });

    // Read and increment IP
    const currentIp = parseInt((await kv.get(ipKey)) || '0', 10);
    await kv.put(ipKey, String(currentIp + 1), { expirationTtl: TTL_24H });
  } catch (err) {
    console.warn('Failed to increment rate limit counters:', err);
  }
}
