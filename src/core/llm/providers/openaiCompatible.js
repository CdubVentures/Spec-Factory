function normalizeBaseUrl(value) {
  // WHY: Registry base URLs may already include /v1 (e.g. "http://localhost:5001/v1").
  // Strip trailing /v1 so the endpoint doesn't become /v1/v1/chat/completions.
  return String(value || '').replace(/\/+$/, '').replace(/\/v1$/, '');
}

export async function requestOpenAICompatibleChatCompletion({
  baseUrl,
  apiKey,
  body,
  signal,
  headers = {}
}) {
  const endpoint = `${normalizeBaseUrl(baseUrl)}/v1/chat/completions`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...headers
    },
    body: JSON.stringify(body),
    signal
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI API error ${response.status}: ${text.slice(0, 1000)}`);
  }

  let parsedBody;
  try {
    parsedBody = JSON.parse(text);
  } catch {
    throw new Error('OpenAI API returned non-JSON payload');
  }

  return parsedBody;
}
