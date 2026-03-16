interface LlmConfigWarningBannerProps {
  llmProvider: string;
  llmBaseUrl: string;
  openaiApiKey: string;
  llmModelExtract: string;
}

function collectMissingFields(props: LlmConfigWarningBannerProps): string[] {
  const missing: string[] = [];
  if (!props.openaiApiKey) missing.push('API Key');
  if (!props.llmProvider) missing.push('LLM Provider');
  if (!props.llmBaseUrl) missing.push('LLM Base URL');
  if (!props.llmModelExtract) missing.push('LLM Model');
  return missing;
}

export function LlmConfigWarningBanner(props: LlmConfigWarningBannerProps) {
  const missing = collectMissingFields(props);
  if (missing.length === 0) return null;

  return (
    <div
      className="sf-callout sf-callout-warning"
      role="alert"
    >
      <strong>LLM configuration incomplete</strong>
      <span className="sf-text-label">
        {' \u2014 '}
        Missing: {missing.join(', ')}.
        {' '}LLM enrichment requires a valid provider, API key, base URL, and model.
      </span>
    </div>
  );
}
