import type { KeySectionBaseProps } from "./keySectionContracts.ts";
import { Section } from "../Section.tsx";
import { KeyAiAssistBody } from "./bodies/KeyAiAssistBody.tsx";
import { STUDIO_TIPS } from "../studioConstants.ts";

export interface KeyAiAssistSectionProps extends KeySectionBaseProps {}

export function KeyAiAssistSection(props: KeyAiAssistSectionProps) {
  return (
    <Section
      title="Ai Assist"
      persistKey={`studio:keyNavigator:section:aiAssist:${props.category}`}
      titleTooltip={STUDIO_TIPS.key_section_ai_assist}
      defaultOpen
      disabled={props.disabled}
    >
      <KeyAiAssistBody {...props} />
    </Section>
  );
}
