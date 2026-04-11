import { Chip } from '../feedback/Chip.tsx';
import type { RunDiscoveryLog } from './types.ts';

export function DiscoverySummaryBar({ log }: { readonly log: RunDiscoveryLog }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Chip label={`${log.confirmedCount} confirmed`} className="sf-chip-success" />
      <Chip label={`${log.addedNewCount} new`} className="sf-chip-info" />
      <Chip label={`${log.rejectedCount} rejected`} className="sf-chip-danger" />
      <Chip label={`${log.urlsCheckedCount} urls`} className="sf-chip-neutral" />
      <Chip label={`${log.queriesRunCount} queries`} className="sf-chip-neutral" />
    </div>
  );
}
