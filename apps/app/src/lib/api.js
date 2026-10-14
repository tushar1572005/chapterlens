/**
 * API client helper to request AI rewrites for difficult sentences.
 *
 * @param {{
 *   sentences: Array<{ id: string, text: string, context?: string }>,
 *   turnstileToken: string
 * }} payload
 * @returns {Promise<any>}
 */
export async function requestAiReview({ sentences, turnstileToken }) {
  const res = await fetch('/api/review', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'cf-turnstile-token': turnstileToken || '',
    },
    body: JSON.stringify({
      sentences,
      turnstileToken,
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 429 || data.limited) {
      return {
        limited: true,
        message:
          data.message ||
          'Daily review limit reached or service is busy. Please try again later.',
      };
    }
    throw new Error(data.message || data.error || `Review request failed (${res.status})`);
  }

  return data;
}
