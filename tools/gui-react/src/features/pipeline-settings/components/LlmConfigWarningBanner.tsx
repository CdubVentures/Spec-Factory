interface LlmConfigWarningBannerProps {
  llmProvider: string;
  llmBaseUrl: string;
  openaiApiKey: string;
  llmModelPlan: string;
  llmProviderRegistryJson?: string;
}

// WHY: Registry is now the SSOT for provider/apiKey/baseUrl via the LLM panel.
// If any enabled registry provider has an API key, the legacy flat keys are not required.
function hasRegistryProvider(registryJson: string | undefined): boolean {
  if (!registryJson) return false;
  try {
    const entries: unknown[] = JSON.parse(registryJson);
    if (!Array.isArray(entries)) return false;
    return entries.some(
      (e: unknown) =>
        typeof e === 'object' &&
        e !== null &&
        (e as Record<string, unknown>).enabled === true &&
        typeof (e as Record<string, unknown>).apiKey === 'string' &&
        ((e as Record<string, unknown>).apiKey as string).trim().length > 0,
    );
  } catch {
    return false;
  }
}

function collectMissingFields(props: LlmConfigWarningBannerProps): string[] {
  const registryConfigured = hasRegistryProvider(props.llmProviderRegistryJson);
  const missing: string[] = [];
  if (!props.openaiApiKey && !registryConfigured) missing.push('API Key');
  if (!props.llmProvider && !registryConfigured) missing.push('LLM Provider');
  if (!props.llmBaseUrl && !registryConfigured) missing.push('LLM Base URL');
  if (!props.llmModelPlan) missing.push('LLM Model');
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
