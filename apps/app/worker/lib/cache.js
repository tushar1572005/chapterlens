/**
 * Generates an async SHA-256 hash of sorted input sentences AND their context strings.
 *
 * @param {Array<{ id: string, text: string, context?: string }>} sentences
 * @returns {Promise<string>} Hex-encoded SHA-256 cache key
 */
export async function computeCacheKey(sentences) {
  const sorted = [...sentences].sort((a, b) => a.text.localeCompare(b.text));
  // Unambiguous serialization preventing delimiter injection/collisions
  const serialized = JSON.stringify(sorted.map((s) => [s.text, s.context || '']));

  const encoder = new TextEncoder();
  const data = encoder.encode(serialized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  return `review:${hashHex}`;
}

/**
 * Checks KV review cache for previously generated rewrites.
 *
 * @param {KVNamespace | undefined} kv
 * @param {Array<{ id: string, text: string, context?: string }>} sentences
 * @returns {Promise<any | null>}
 */
export async function getReviewCache(kv, sentences) {
  if (!kv) return null;
  const key = await computeCacheKey(sentences);
  try {
    return await kv.get(key, 'json');
  } catch (err) {
    console.warn('KV cache get warning:', err);
    return null;
  }
}

/**
 * Writes review result into KV cache with a 7-day expiration TTL.
 *
 * @param {KVNamespace | undefined} kv
 * @param {Array<{ id: string, text: string, context?: string }>} sentences
 * @param {any} result
 * @param {number} ttlSeconds - Default 7 days (604800s)
 */
export async function setReviewCache(kv, sentences, result, ttlSeconds = 7 * 86400) {
  if (!kv) return;
  const key = await computeCacheKey(sentences);
  try {
    await kv.put(key, JSON.stringify(result), { expirationTtl: ttlSeconds });
  } catch (err) {
    console.warn('KV cache put warning:', err);
  }
}
