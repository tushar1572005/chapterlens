/**
 * Retrieves a required environment variable or secret from the Worker environment.
 * Fails fast with a descriptive error if missing or empty.
 *
 * @param {Record<string, unknown> | undefined} env - Worker environment bindings (c.env)
 * @param {string} name - Variable or secret name
 * @returns {string} The environment variable value
 * @throws {Error} If variable is missing or empty
 */
export function requireEnv(env, name) {
  const val = env ? env[name] : undefined;
  if (val === undefined || val === null || (typeof val === 'string' && val.trim() === '')) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return String(val);
}
