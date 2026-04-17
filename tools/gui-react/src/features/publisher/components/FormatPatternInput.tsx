// WHY: owned by publisher because the backend publisher pipeline consumes
// this value at runtime:
//   - `src/features/publisher/validation/checks/checkFormat.js` applies it
//     as a custom regex during Step 6 (Format Check) of deterministic validation.
//   - `src/features/publisher/repair-adapter/promptBuilder.js` injects it into
//     P1/P2/P4 LLM repair prompts as formatGuidance when unknown enum values
//     need canonical normalization.
// Studio consumes this component via the publisher feature's public API so the
// runtime consumer and the config UI stay colocated and can't drift again.

import type { ReactNode } from 'react';
import { Tip } from '../../../shared/ui/feedback/Tip.tsx';

interface FormatPatternInputProps {
  value: string;
  onChange: (nextValue: string) => void;
  fieldKey?: string;
  disabled?: boolean;
  disabledReason?: string;
  renderLabelSuffix?: (fieldPath: string) => ReactNode;
}

function formatPatternPlaceholder(fieldKey?: string): string {
  const token = String(fieldKey || '').trim().toLowerCase();
  if (token.includes('lighting')) return 'XXXX zone (YYYY)';
  if (token.includes('feet') && token.includes('material')) return 'YYYY';
  return 'e.g. XXXX zone (YYYY)';
}

const LABEL_CLS = 'sf-text-caption font-medium mb-1 flex items-center';
const INPUT_CLS = 'sf-input w-full rounded border px-2 py-1.5 sf-text-label';
const HINT_CLS = 'text-[10px] sf-text-subtle mt-1';

const TIP_TEXT =
  'Regex or template injected into the publisher repair prompt as formatGuidance '
  + '(P1/P2/P4). Also applied as a custom regex during validation Step 6 (Format Check). '
  + 'Use XXXX for numeric tokens and YYYY for text tokens.';

export function FormatPatternInput({
  value,
  onChange,
  fieldKey,
  disabled = false,
  disabledReason,
  renderLabelSuffix,
}: FormatPatternInputProps) {
  const placeholder = disabled
    ? (disabledReason || 'N/A')
    : formatPatternPlaceholder(fieldKey);

  return (
    <div>
      <div className={LABEL_CLS}>
        <span>
          Format Pattern
          <Tip text={TIP_TEXT} />
        </span>
        {renderLabelSuffix?.('enum.match.format_hint')}
      </div>
      <input
        className={INPUT_CLS}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
      <div className={HINT_CLS}>
        Consumed by publisher repair prompts. Not used for parse-time input matching.
      </div>
    </div>
  );
}
