import type { KeySectionBaseProps } from "./keySectionContracts.ts";
import { Section } from "../Section.tsx";
import { KeyTooltipBody } from "./bodies/KeyTooltipBody.tsx";
import { STUDIO_TIPS } from "../studioConstants.ts";

export interface KeyTooltipSectionProps extends KeySectionBaseProps {}

export function KeyTooltipSection(props: KeyTooltipSectionProps) {
  return (
    <Section
      title="Tooltip / Guidance"
      persistKey={`studio:keyNavigator:section:tooltip:${props.category}`}
      titleTooltip={STUDIO_TIPS.key_section_ui}
    >
      <KeyTooltipBody {...props} />
    </Section>
  );
}
