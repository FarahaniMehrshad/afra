import type { EventKind } from '@/types/ir';
import type { UiFieldImpact } from '@/types/impact';
import type { Variant } from '@/types/journey';
import { ImpactFieldCard } from './ImpactFieldCard';

interface Props {
  impact: UiFieldImpact;
  kinds: EventKind[];
  onPathClick: (path: string, variant: Variant) => void;
}

export function ImpactColumn({
  impact,
  kinds,
  onPathClick,
}: Props) {
  return (
    <section
      style={{
        flex: 1,
        minWidth: 0,
        borderLeft: '1px solid rgba(148,180,255,0.10)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          flex: 'none',
          padding: '10px 12px',
          borderBottom: '1px solid rgba(148,180,255,0.10)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(14,20,34,0.32)',
        }}
      >
        <span
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 12,
            color: '#dce6f8',
            textTransform: 'uppercase',
          }}
        >
          {impact.label}
        </span>
        <span
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 11,
            color: '#7f94b1',
          }}
        >
          {impact.totals.fields} fields · {impact.totals.occurrences} events
        </span>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 10, display: 'grid', gap: 8 }}>
        {impact.entries.length === 0 ? (
          <div style={{ padding: 12, color: '#7f94b1', fontSize: 12 }}>
            No UI fields match the current filter.
          </div>
        ) : (
          impact.entries.map((entry) => (
            <ImpactFieldCard
              key={impact.variant + '\u0000' + entry.canonical}
              entry={entry}
              kinds={kinds}
              onPathClick={onPathClick}
            />
          ))
        )}
      </div>
    </section>
  );
}
