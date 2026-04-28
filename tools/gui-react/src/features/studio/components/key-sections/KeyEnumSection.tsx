import type { KeySectionBaseProps } from "./keySectionContracts.ts";
import type { EnumEntry } from "../../../../types/studio.ts";
import { Section } from "../Section.tsx";
import { KeyEnumBody } from "./bodies/KeyEnumBody.tsx";
import { STUDIO_TIPS } from "../studioConstants.ts";

export interface KeyEnumSectionProps extends KeySectionBaseProps {
  knownValues: Record<string, string[]>;
  enumLists: EnumEntry[];
}

export function KeyEnumSection(props: KeyEnumSectionProps) {
  return (
    <Section
      title="Enum Policy"
      persistKey={`studio:keyNavigator:section:enum:${props.category}`}
      titleTooltip={STUDIO_TIPS.key_section_enum}
      disabled={props.disabled}
    >
      <KeyEnumBody {...props} />
    </Section>
  );
}
