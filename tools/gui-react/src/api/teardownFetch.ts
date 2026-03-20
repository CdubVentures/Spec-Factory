/**
 * Fire-and-forget HTTP request that survives page teardown.
 *
 * WHY: fetch({ keepalive }) survives beforeunload/pagehide. sendBeacon was
 * removed because it forces POST regardless of the method field.
 *
 * Contract:
 * - Serializes body via JSON.stringify
 * - Sets Content-Type: application/json
 * - Uses keepalive: true
 * - Never throws (silently catches all errors)
 * - Never awaits (void fetch)
 */

export interface TeardownFetchPayload {
  url: string;
  method: 'PUT' | 'POST';
  body: unknown;
}

export function teardownFetch(payload: TeardownFetchPayload): void {
  try {
    const jsonBody = JSON.stringify(payload.body);
    void fetch(payload.url, {
      method: payload.method,
      headers: { 'Content-Type': 'application/json' },
      body: jsonBody,
      keepalive: true,
    });
  } catch {
    // Best-effort — must never throw during page teardown.
  }
}
