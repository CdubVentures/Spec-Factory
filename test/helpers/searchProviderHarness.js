export function makeJsonResponse(payload, ok = true) {
  return {
    ok,
    async json() {
      return payload;
    }
  };
}

export function makeSearchConfig(overrides = {}) {
  return {
    searxngBaseUrl: 'http://127.0.0.1:8080',
    searxngMinQueryIntervalMs: 0,
    searchMaxRetries: 0,
    ...overrides,
  };
}
