import { requireEnv } from '../lib/env.js';

export const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export const DUMMY_TURNSTILE_SECRET = '1x0000000000000000000000000000000AA';
export const MAX_REQUEST_BODY_BYTES = 64 * 1024; // 64 KB

/**
 * Cloudflare Turnstile token verification middleware.
 * Verifies turnstileToken against Cloudflare siteverify endpoint.
 * Returns 403 Forbidden on failure, never consuming downstream quota.
 */
export async function turnstileMiddleware(c, next) {
  // If GET or health check, skip
  if (c.req.method === 'GET' || c.req.path === '/api/health') {
    return next();
  }

  const secret = requireEnv(c.env, 'TURNSTILE_SECRET');

  // Enforce: Never use dummy keys in production
  if (c.env?.ENVIRONMENT === 'production' && secret === DUMMY_TURNSTILE_SECRET) {
    throw new Error('Production environment cannot use dummy Turnstile secret key');
  }

  // Enforce body size limit before reading body
  const contentLength = c.req.header('content-length');
  if (contentLength && parseInt(contentLength, 10) > MAX_REQUEST_BODY_BYTES) {
    return c.json({ error: 'Payload Too Large', message: 'Request body exceeds 64 KB limit' }, 413);
  }

  let token = c.req.header('cf-turnstile-token') || c.req.header('x-turnstile-token');

  // Also check request body if not in header
  if (!token && (c.req.method === 'POST' || c.req.method === 'PUT')) {
    try {
      // Clone request to avoid consuming body before route handlers
      const cloned = c.req.raw.clone();
      const body = await cloned.json();
      token = body?.turnstileToken;
    } catch {
      // Ignore JSON parse errors here, let body validation handle it
    }
  }

  if (!token || typeof token !== 'string' || !token.trim()) {
    return c.json(
      {
        error: 'Turnstile verification failed',
        message: 'Missing Turnstile challenge token',
      },
      403
    );
  }

  const clientIp = c.req.header('CF-Connecting-IP');

  try {
    const formData = new URLSearchParams();
    formData.append('secret', secret);
    formData.append('response', token.trim());
    if (clientIp) {
      formData.append('remoteip', clientIp);
    }

    const verifyResponse = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    if (!verifyResponse.ok) {
      return c.json(
        {
          error: 'Turnstile verification failed',
          message: 'Verification service error',
        },
        403
      );
    }

    const outcome = await verifyResponse.json();
    if (!outcome.success) {
      return c.json(
        {
          error: 'Turnstile verification failed',
          message: 'Invalid or expired CAPTCHA challenge',
          errorCodes: outcome['error-codes'],
        },
        403
      );
    }
  } catch (err) {
    console.error('Turnstile verification error:', err);
    return c.json(
      {
        error: 'Turnstile verification failed',
        message: 'Security challenge verification service unavailable',
      },
      403
    );
  }

  await next();
}
