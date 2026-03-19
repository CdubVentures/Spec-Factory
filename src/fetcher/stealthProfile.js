/**
 * Stealth browser profile for Playwright headless fetching.
 * Provides realistic Chrome fingerprint to avoid anti-bot detection.
 */

export const STEALTH_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';

export const STEALTH_VIEWPORT = { width: 1920, height: 1080 };

export const STEALTH_INIT_SCRIPT = `
Object.defineProperty(navigator, 'webdriver', { get: () => false });
Object.defineProperty(navigator, 'plugins', {
  get: () => [1, 2, 3, 4, 5]
});
Object.defineProperty(navigator, 'languages', {
  get: () => ['en-US', 'en']
});
`;

export function buildStealthContextOptions(overrides = {}) {
  return {
    userAgent: overrides.userAgent || STEALTH_USER_AGENT,
    viewport: STEALTH_VIEWPORT,
    locale: 'en-US',
    timezoneId: 'America/New_York',
    ...overrides,
    // Ensure viewport is never overridden to a bad value
    ...(overrides.userAgent ? { userAgent: overrides.userAgent } : {}),
  };
}
