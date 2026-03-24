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

export function makeSearchResult(overrides = {}) {
  return {
    url: 'https://example.com/result',
    title: 'Result',
    content: 'details',
    snippet: 'details',
    engine: 'bing',
    engines: ['bing'],
    provider: 'bing',
    ...overrides,
  };
}

export function makeSearchPayload(results = []) {
  return { results };
}

export function makeSearchResponse(results = [], ok = true) {
  return makeJsonResponse(makeSearchPayload(results), ok);
}
