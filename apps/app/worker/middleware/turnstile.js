import { requireEnv } from '../lib/env.js';

export const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

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
    return c.json(
      {
        error: 'Turnstile verification failed',
        message: err.message,
      },
      403
    );
  }

  await next();
}
