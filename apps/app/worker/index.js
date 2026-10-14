import { Hono } from 'hono';
import { reviewRoute } from './routes/review.js';
import { turnstileMiddleware } from './middleware/turnstile.js';

const app = new Hono();

// Smoke test health check
app.get('/api/health', (c) => {
  return c.json({ ok: true, ts: Date.now() });
});

// Review endpoints guarded by Turnstile CAPTCHA middleware
app.use('/api/review', turnstileMiddleware);
app.route('/api/review', reviewRoute);

// Catch-all 404 for any unmatched /api/* requests
app.all('/api/*', (c) => {
  return c.json({ error: 'Not found' }, 404);
});

// Global error handler
app.onError((err, c) => {
  console.error('Unhandled API Error:', err);
  return c.json(
    {
      error: 'Internal Server Error',
      message: 'An unexpected error occurred. Please try again later.',
    },
    500
  );
});

export default app;
