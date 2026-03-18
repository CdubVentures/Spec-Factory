function normalizeWhitespace(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripHtml(html) {
  return normalizeWhitespace(
    String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  );
}

function fieldToPattern(field) {
  const token = String(field || '').trim().toLowerCase().replace(/_/g, ' ');
  return token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractFieldValueFromText(text, field) {
  const pattern = fieldToPattern(field);
  if (!pattern) {
    return '';
  }
  const regex = new RegExp(`${pattern}\\s*[:\\-]?\\s*([^.;|\\n]{1,80})`, 'i');
  const match = text.match(regex);
  if (!match?.[1]) {
    return '';
  }
  return normalizeWhitespace(match[1]);
}

function parseAssistantJsonContent(response = {}) {
  const content = String(response?.choices?.[0]?.message?.content || '').trim();
  if (!content) {
    return null;
  }
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export class AggressiveDomExtractor {
  constructor({
    config = {}
  } = {}) {
    this.modelFast = String(config.llmModelPlan || 'gpt-5-low');
    this.modelDeep = String(config.llmModelReasoning || 'gpt-5-high');
  }

  async extractFromDom(rawHtml, targetFields = [], identity = {}, sourceMetadata = {}, opts = {}) {
    const fields = Array.isArray(targetFields) ? targetFields : [];
    const text = stripHtml(rawHtml);
    const fieldCandidates = [];
    for (const field of fields) {
      const value = extractFieldValueFromText(text, field);
      if (!value) {
        continue;
      }
      fieldCandidates.push({
        field,
        value,
        method: 'aggressive_dom',
        confidence: 0.62,
        evidenceRefs: [],
        source_id: String(sourceMetadata?.source_id || sourceMetadata?.host || 'dom'),
        quote: value
      });
    }

    const forceDeep = Boolean(opts.forceDeep);
    const selectedModel = forceDeep ? this.modelDeep : this.modelFast;
    const sidecar = null;

    return {
      model: selectedModel,
      force_deep: forceDeep,
      fieldCandidates,
      sidecar
    };
  }
}
