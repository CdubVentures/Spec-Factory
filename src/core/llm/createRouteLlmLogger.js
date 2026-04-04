/**
 * Lightweight logger for LLM calls made from route handlers.
 *
 * Same { info, warn, error } shape as EventLogger so callLlmWithRouting
 * works identically in pipeline and route contexts. Output goes to
 * server stdout (captured in .server-state/spec-factory-api.log).
 *
 * Usage:
 *   const logger = createRouteLlmLogger('color-edition-finder');
 *   // produces: [color-edition-finder] llm_route_selected { ... }
 */
export function createRouteLlmLogger(tag = 'llm') {
  return {
    info: (event, data = {}) => console.log(`[${tag}] ${event}`, JSON.stringify(data)),
    warn: (event, data = {}) => console.warn(`[${tag}] ${event}`, JSON.stringify(data)),
    error: (event, data = {}) => console.error(`[${tag}] ${event}`, JSON.stringify(data)),
  };
}
