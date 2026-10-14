import { describe, it, expect } from 'vitest';
import { requireEnv } from '../worker/lib/env.js';

describe('requireEnv helper', () => {
  it('returns the variable value when present', () => {
    const env = { GROQ_MODEL: 'openai/gpt-oss-120b', NUMBER_VAR: 42 };
    expect(requireEnv(env, 'GROQ_MODEL')).toBe('openai/gpt-oss-120b');
    expect(requireEnv(env, 'NUMBER_VAR')).toBe('42');
  });

  it('throws descriptive error if environment object is missing or variable is undefined', () => {
    expect(() => requireEnv(undefined, 'GROQ_API_KEY')).toThrow(
      'Missing required environment variable: GROQ_API_KEY'
    );
    expect(() => requireEnv({}, 'GROQ_API_KEY')).toThrow(
      'Missing required environment variable: GROQ_API_KEY'
    );
  });

  it('throws descriptive error if variable is null or empty whitespace', () => {
    expect(() => requireEnv({ GROQ_API_KEY: null }, 'GROQ_API_KEY')).toThrow(
      'Missing required environment variable: GROQ_API_KEY'
    );
    expect(() => requireEnv({ GROQ_API_KEY: '' }, 'GROQ_API_KEY')).toThrow(
      'Missing required environment variable: GROQ_API_KEY'
    );
    expect(() => requireEnv({ GROQ_API_KEY: '   ' }, 'GROQ_API_KEY')).toThrow(
      'Missing required environment variable: GROQ_API_KEY'
    );
  });
});
