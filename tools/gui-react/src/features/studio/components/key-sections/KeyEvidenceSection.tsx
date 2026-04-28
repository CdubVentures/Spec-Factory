import type { KeySectionBaseProps } from "./keySectionContracts.ts";
import { Section } from "../Section.tsx";
import { KeyEvidenceBody } from "./bodies/KeyEvidenceBody.tsx";
import { STUDIO_TIPS } from "../studioConstants.ts";

export interface KeyEvidenceSectionProps extends KeySectionBaseProps {}

export function KeyEvidenceSection(props: KeyEvidenceSectionProps) {
  return (
    <Section
      title="Evidence"
      persistKey={`studio:keyNavigator:section:evidence:${props.category}`}
      titleTooltip={STUDIO_TIPS.key_section_evidence}
      disabled={props.disabled}
    >
      <KeyEvidenceBody {...props} />
    </Section>
  );
}
