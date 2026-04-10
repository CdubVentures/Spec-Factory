// WHY: Read SSE response body incrementally, firing onDelta for each content/reasoning
// token as it arrives. Returns the full accumulated text for backward-compatible assembly.
// Handles partial SSE lines split across TCP chunk boundaries via a line buffer.
export async function readStreamingResponse(response, onDelta) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parts = [];
  let lineBuffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    parts.push(chunk);
    lineBuffer += chunk;

    const lines = lineBuffer.split('\n');
    // Last element is either empty (line ended with \n) or a partial line
    lineBuffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (!data || data === '[DONE]') continue;

      let evt;
      try { evt = JSON.parse(data); } catch { continue; }

      const delta = evt?.choices?.[0]?.delta;
      if (delta?.content || delta?.reasoning_content) {
        onDelta({
          content: delta.content || '',
          reasoning: delta.reasoning_content || '',
        });
      }
      // LLM Lab Responses API format
      if (evt?.type === 'response.output_text.delta' && evt?.delta) {
        onDelta({ content: evt.delta, reasoning: '' });
      }
    }
  }

  // Flush any remaining partial line (unlikely for well-formed SSE, but safe)
  if (lineBuffer) parts.push('');
  return parts.join('');
}

function normalizeBaseUrl(value) {
  // WHY: Registry base URLs may already include /v1 (e.g. "http://localhost:5001/v1").
  // Strip trailing /v1 so the endpoint doesn't become /v1/v1/chat/completions.
  return String(value || '').replace(/\/+$/, '').replace(/\/v1$/, '');
}

// WHY: Assemble SSE (Server-Sent Events) stream into the same chat completion
// shape that a non-streaming response returns. This keeps the connection alive
// during long-running calls (xhigh reasoning, web search) that would otherwise
// timeout with no bytes flowing. Works like the browser — data trickles in
// as the model thinks.
function assembleStreamedResponse(sseText) {
  const contentParts = [];
  const reasoningParts = [];
  const toolCalls = [];
  let responseModel = '';
  let responseId = '';
  let usage = null;

  for (const line of sseText.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    const data = line.slice(6).trim();
    if (!data || data === '[DONE]') continue;

    let evt;
    try { evt = JSON.parse(data); } catch { continue; }

    // Standard OpenAI streaming format (delta chunks)
    const delta = evt?.choices?.[0]?.delta;
    if (delta) {
      if (delta.content) contentParts.push(delta.content);
      if (delta.reasoning_content) reasoningParts.push(delta.reasoning_content);
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? toolCalls.length;
          if (!toolCalls[idx]) {
            toolCalls[idx] = {
              id: tc.id || '',
              type: 'function',
              function: { name: tc.function?.name || '', arguments: '' }
            };
          }
          if (tc.function?.arguments) {
            toolCalls[idx].function.arguments += tc.function.arguments;
          }
        }
      }
    }

    if (evt?.model) responseModel = evt.model;
    if (evt?.id) responseId = evt.id;
    if (evt?.usage) usage = evt.usage;

    // LLM Lab also emits Responses API format events — handle both
    const kind = evt?.type;
    if (kind === 'response.output_text.delta' && evt?.delta) {
      contentParts.push(evt.delta);
    }
  }

  const message = {
    role: 'assistant',
    content: contentParts.join('') || null,
  };
  if (toolCalls.length > 0) {
    message.tool_calls = toolCalls;
  }

  return {
    id: responseId || 'chatcmpl-stream',
    object: 'chat.completion',
    model: responseModel,
    choices: [{
      index: 0,
      message,
      finish_reason: 'stop',
    }],
    ...(usage ? { usage } : {}),
  };
}

export async function requestOpenAICompatibleChatCompletion({
  baseUrl,
  apiKey,
  body,
  signal,
  headers = {},
  onDelta,
}) {
  const endpoint = `${normalizeBaseUrl(baseUrl)}/v1/chat/completions`;

  // WHY: Always stream. Long-running calls (web search, xhigh reasoning) can
  // take 5-7 minutes. Without streaming, no bytes flow during that time and
  // the connection dies. Streaming keeps it alive — same as the browser.
  const streamBody = { ...body, stream: true };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...headers
    },
    body: JSON.stringify(streamBody),
    signal
  });

  const text = onDelta
    ? await readStreamingResponse(response, onDelta)
    : await response.text();

  if (!response.ok) {
    throw new Error(`OpenAI API error ${response.status}: ${text.slice(0, 1000)}`);
  }

  // Detect whether response is SSE stream or plain JSON
  // (some providers may ignore stream:true and return JSON directly)
  const trimmed = text.trimStart();
  if (trimmed.startsWith('{')) {
    // Plain JSON response — parse directly
    try {
      return JSON.parse(trimmed);
    } catch {
      throw new Error('OpenAI API returned non-JSON payload');
    }
  }

  // SSE stream — assemble into chat completion shape
  const assembled = assembleStreamedResponse(text);
  if (!assembled.choices[0]?.message?.content && !assembled.choices[0]?.message?.tool_calls) {
    throw new Error('OpenAI API streaming response produced no content');
  }

  return assembled;
}
