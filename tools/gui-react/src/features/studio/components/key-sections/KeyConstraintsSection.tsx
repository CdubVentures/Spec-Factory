import type { KeySectionBaseProps } from "./keySectionContracts.ts";
import { Section } from "../Section.tsx";
import { KeyConstraintsBody } from "./bodies/KeyConstraintsBody.tsx";
import { STUDIO_TIPS } from "../studioConstants.ts";

export interface KeyConstraintsSectionProps extends KeySectionBaseProps {
  fieldOrder: string[];
  editedRules: Record<string, Record<string, unknown>>;
}

export function KeyConstraintsSection(props: KeyConstraintsSectionProps) {
  return (
    <Section
      title={
        <span className="flex items-center gap-1">
          Cross-Field Constraints
          {props.BadgeRenderer ? <props.BadgeRenderer p="constraints" /> : null}
        </span>
      }
      persistKey={`studio:keyNavigator:section:constraints:${props.category}`}
      titleTooltip={STUDIO_TIPS.key_section_constraints}
      disabled={props.disabled}
    >
      <KeyConstraintsBody {...props} />
    </Section>
  );
}
