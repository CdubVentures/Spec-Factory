import type { KeySectionBaseProps } from "./keySectionContracts.ts";
import { Section } from "../Section.tsx";
import { KeyContractBody } from "./bodies/KeyContractBody.tsx";
import { STUDIO_TIPS } from "../studioConstants.ts";

export interface KeyContractSectionProps extends KeySectionBaseProps {}

export function KeyContractSection(props: KeyContractSectionProps) {
  return (
    <Section
      title="Contract"
      persistKey={`studio:keyNavigator:section:contract:${props.category}`}
      titleTooltip={STUDIO_TIPS.key_section_contract}
      disabled={props.disabled}
    >
      <KeyContractBody {...props} />
    </Section>
  );
}
