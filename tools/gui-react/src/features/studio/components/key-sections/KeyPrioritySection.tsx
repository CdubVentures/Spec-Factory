import type { KeySectionBaseProps } from "./keySectionContracts.ts";
import { Section } from "../Section.tsx";
import { KeyPriorityBody } from "./bodies/KeyPriorityBody.tsx";
import { STUDIO_TIPS } from "../studioConstants.ts";

export interface KeyPrioritySectionProps extends KeySectionBaseProps {}

export function KeyPrioritySection(props: KeyPrioritySectionProps) {
  return (
    <Section
      title="Priority"
      persistKey={`studio:keyNavigator:section:priority:${props.category}`}
      titleTooltip={STUDIO_TIPS.key_section_priority}
      disabled={props.disabled}
    >
      <KeyPriorityBody {...props} />
    </Section>
  );
}
