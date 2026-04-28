import type { KeySectionBaseProps } from "./keySectionContracts.ts";
import { Section } from "../Section.tsx";
import { KeySearchHintsBody } from "./bodies/KeySearchHintsBody.tsx";
import { STUDIO_TIPS } from "../studioConstants.ts";

export interface KeySearchHintsSectionProps extends KeySectionBaseProps {}

export function KeySearchHintsSection(props: KeySearchHintsSectionProps) {
  return (
    <Section
      title="Search Hints & Aliases"
      persistKey={`studio:keyNavigator:section:searchHints:${props.category}`}
      titleTooltip={STUDIO_TIPS.key_section_search}
    >
      <KeySearchHintsBody {...props} />
    </Section>
  );
}
