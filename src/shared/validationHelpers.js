/**
 * Separate known keys from unknown keys in a request body.
 *
 * @param {object|null|undefined} body - The request body to validate
 * @param {Set<string>|string[]} allowedKeys - Set or array of allowed key names
 * @returns {{ accepted: Record<string, unknown>, rejected: Record<string, string> }}
 */
export function rejectUnknownKeys(body, allowedKeys) {
  const accepted = {};
  const rejected = {};
  if (!body || typeof body !== 'object') return { accepted, rejected };
  const allowed = allowedKeys instanceof Set ? allowedKeys : new Set(allowedKeys);
  for (const [key, value] of Object.entries(body)) {
    if (allowed.has(key)) {
      accepted[key] = value;
    } else {
      rejected[key] = 'unknown_key';
    }
  }
  return { accepted, rejected };
}
