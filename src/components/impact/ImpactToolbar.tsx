import { useAppStore } from '@/store/appStore';
import { Segmented } from '@/components/ui/Segmented';
import { Toggle } from '@/components/ui/Toggle';
import type { EventKind } from '@/types/ir';
import type { ImpactMergeMode } from '@/types/impact';
import { COLORS } from '@/constants';

interface Props {
  summaryLabel: string;
}

const KIND_OPTIONS: {
  value: EventKind;
  label: string;
  color: string;
  title: string;
}[] = [
  { value: 'add', label: 'add', color: COLORS.add, title: 'show add events' },
  { value: 'modify', label: 'mod', color: COLORS.modify, title: 'show modify events' },
  { value: 'remove', label: 'rem', color: COLORS.remove, title: 'show remove events' },
];

const MERGE_OPTIONS: {
  value: ImpactMergeMode;
  label: string;
  title: string;
}[] = [
  { value: 'off', label: 'merge: off', title: 'No merge' },
  {
    value: 'within',
    label: 'merge: within',
    title: 'Merge same-value rows inside each variant',
  },
  {
    value: 'across',
    label: 'merge: across',
    title: 'Merge same-value rows across wpf and exe',
  },
];

export function ImpactToolbar({ summaryLabel }: Props) {
  const impactQuery = useAppStore((s) => s.impactQuery);
  const setImpactQuery = useAppStore((s) => s.setImpactQuery);
  const impactKinds = useAppStore((s) => s.impactKinds);
  const toggleImpactKind = useAppStore((s) => s.toggleImpactKind);
  const includeRandomId = useAppStore((s) => s.impactIncludeRandomId);
  const toggleIncludeRandomId = useAppStore((s) => s.toggleImpactIncludeRandomId);
  const includeUnclassified = useAppStore((s) => s.impactIncludeUnclassified);
  const toggleIncludeUnclassified = useAppStore((s) => s.toggleImpactIncludeUnclassified);
  const mergeMode = useAppStore((s) => s.impactMergeMode);
  const setMergeMode = useAppStore((s) => s.setImpactMergeMode);

  return (
    <div
      style={{
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '11px 16px',
        borderBottom: '1px solid rgba(148,180,255,0.08)',
        background: 'rgba(14,20,34,0.4)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        flexWrap: 'wrap',
      }}
    >
      <div>
        <div
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 13,
            color: '#e6eeff',
          }}
        >
          UI impact map
        </div>
        <div style={{ fontSize: 11.5, color: '#7f92b0', marginTop: 2 }}>
          UI fields and same-step derived changes
        </div>
      </div>
      <span style={{ flex: 1 }} />

      <Segmented<EventKind>
        options={KIND_OPTIONS}
        isActive={(v) => impactKinds.includes(v)}
        onSelect={toggleImpactKind}
        small
      />

      <Toggle active={includeRandomId} onClick={toggleIncludeRandomId} title="Include random-id">
        include random-id
      </Toggle>
      <Toggle
        active={includeUnclassified}
        onClick={toggleIncludeUnclassified}
        title="Include paths with no verdict"
      >
        include unclassified
      </Toggle>
      <Segmented<ImpactMergeMode>
        options={MERGE_OPTIONS}
        isActive={(v) => v === mergeMode}
        onSelect={setMergeMode}
        small
      />

      <input
        value={impactQuery}
        onChange={(e) => setImpactQuery(e.target.value)}
        placeholder="Search canonical or concrete paths…"
        className="afra-input"
        style={{
          width: 280,
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: 11.5,
          padding: '6px 10px',
          borderRadius: 9,
          border: '1px solid rgba(148,180,255,0.12)',
          background: 'rgba(148,180,255,0.05)',
          color: '#dbe4f2',
          outline: 'none',
        }}
      />

      <span
        style={{
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: 11,
          color: '#6d7f9c',
        }}
      >
        {summaryLabel}
      </span>
    </div>
  );
}
