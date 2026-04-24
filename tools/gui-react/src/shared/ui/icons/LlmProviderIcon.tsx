// WHY: Registry-driven LLM provider icons.
// Adding a new provider = add one icon function + one map entry here. No switch statements.
// Follows SearchProviderIcon.tsx pattern (map lookup + null fallback).

interface IconProps {
  size?: number;
  className?: string;
}

function GeminiIcon({ size = 14, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 2C12.5 7 17 11.5 22 12C17 12.5 12.5 17 12 22C11.5 17 7 12.5 2 12C7 11.5 11.5 7 12 2Z" fill="#4285F4" />
    </svg>
  );
}

function DeepSeekIcon({ size = 14, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="#0066FF" />
      <path d="M7 13C9 9 15 9 17 13" stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none" />
      <circle cx="9" cy="10" r="1.5" fill="#fff" />
      <circle cx="15" cy="10" r="1.5" fill="#fff" />
    </svg>
  );
}

function AnthropicIcon({ size = 14, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#D4A27F" />
      <path d="M12 6L17 18H14.5L12 12.5L9.5 18H7L12 6Z" fill="#fff" />
    </svg>
  );
}

function OpenAIIcon({ size = 14, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="#10A37F" />
      <path d="M12 6V12L16 14M12 12L8 14M12 12V18" stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function XaiIcon({ size = 14, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="2" width="20" height="20" rx="5" fill="#111827" />
      <path d="M7 7L17 17M17 7L7 17" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" />
    </svg>
  );
}

function GenericProviderIcon({ size = 14, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="5" fill="currentColor" opacity="0.18" />
      <path d="M8 12H16M12 8V16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function OllamaIcon({ size = 14, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="#1A1A1A" />
      <ellipse cx="12" cy="13" rx="5" ry="4" fill="#fff" />
      <circle cx="10" cy="12" r="1" fill="#1A1A1A" />
      <circle cx="14" cy="12" r="1" fill="#1A1A1A" />
      <ellipse cx="12" cy="8" rx="3" ry="2" fill="#fff" />
    </svg>
  );
}

const LLM_PROVIDER_ICON_MAP: Record<string, (props: IconProps) => JSX.Element> = {
  gemini: GeminiIcon,
  google: GeminiIcon,
  deepseek: DeepSeekIcon,
  anthropic: AnthropicIcon,
  openai: OpenAIIcon,
  xai: XaiIcon,
  ollama: OllamaIcon,
  generic: GenericProviderIcon,
};

interface LlmProviderIconProps {
  provider: string;
  size?: number;
  className?: string;
}

export function LlmProviderIcon({ provider, size = 14, className }: LlmProviderIconProps): JSX.Element | null {
  const token = String(provider || '').trim().toLowerCase();
  const Icon = LLM_PROVIDER_ICON_MAP[token];
  return Icon ? <Icon size={size} className={className} /> : null;
}
