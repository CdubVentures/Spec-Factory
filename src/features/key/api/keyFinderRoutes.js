/**
 * Key Finder — route registrar (Phase 2 stub).
 *
 * Matches the finder-route dispatcher contract: `registerX(ctx)` returns a
 * handler `(parts, params, method, req, res)` that returns `false` when the
 * URL is not its prefix (so other route handlers get a turn) and responds
 * 501 otherwise. Real handlers land in Phase 3 via createFinderRouteHandler.
 */

export function registerKeyFinderRoutes(ctx) {
  const { jsonRes } = ctx;
  return async function handleKeyFinderRoutes(parts, _params, _method, _req, res) {
    if (parts[0] !== 'key-finder') return false;
    jsonRes(res, 501, {
      error: 'not_implemented',
      message: 'Key Finder routes ship in Phase 3. Phase 2 is config plumbing only.',
    });
  };
}
