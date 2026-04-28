// WHY: Re-export the shared body components used by the workbench drawer's
// 8-way dispatcher. Centralized so tests can stub a single module.
export { KeyContractBody } from '../components/key-sections/bodies/KeyContractBody.tsx';
export { KeyPriorityBody } from '../components/key-sections/bodies/KeyPriorityBody.tsx';
export { KeyAiAssistBody } from '../components/key-sections/bodies/KeyAiAssistBody.tsx';
export { KeyEnumBody } from '../components/key-sections/bodies/KeyEnumBody.tsx';
export { KeyConstraintsBody } from '../components/key-sections/bodies/KeyConstraintsBody.tsx';
export { KeyEvidenceBody } from '../components/key-sections/bodies/KeyEvidenceBody.tsx';
export { KeyTooltipBody } from '../components/key-sections/bodies/KeyTooltipBody.tsx';
export { KeySearchHintsBody } from '../components/key-sections/bodies/KeySearchHintsBody.tsx';
export type { BadgeSlot } from './workbenchTypes.ts';
