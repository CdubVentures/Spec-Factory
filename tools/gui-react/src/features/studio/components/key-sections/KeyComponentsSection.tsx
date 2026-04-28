import type { KeySectionBaseProps } from "./keySectionContracts.ts";
import type { ComponentSource } from "../../../../types/studio.ts";
import { Section } from "../Section.tsx";
import { KeyComponentsBody } from "./bodies/KeyComponentsBody.tsx";
import { STUDIO_TIPS } from "../studioConstants.ts";

export interface KeyComponentsSectionProps extends KeySectionBaseProps {
  componentSources: ComponentSource[];
  knownValues: Record<string, string[]>;
  editedRules: Record<string, Record<string, unknown>>;
}

export function KeyComponentsSection(props: KeyComponentsSectionProps) {
  return (
    <Section
      title="Components"
      persistKey={`studio:keyNavigator:section:components:${props.category}`}
      titleTooltip={STUDIO_TIPS.key_section_components}
      disabled={props.disabled}
    >
      <KeyComponentsBody {...props} />
    </Section>
  );
}
