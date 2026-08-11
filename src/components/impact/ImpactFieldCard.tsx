import { useMemo, useState } from 'react';
import type { EventKind } from '@/types/ir';
import type { UiFieldEntry } from '@/types/impact';
import { StepOccurrenceRow } from './StepOccurrenceRow';

interface Props {
  entry: UiFieldEntry;
  kinds: EventKind[];
  onPathClick: (path: string) => void;
}

const ORDER: EventKind[] = ['add', 'modify', 'remove'];

export function ImpactFieldCard({ entry, kinds, onPathClick }: Props) {
  const [open, setOpen] = useState(false);
  const activeKinds = kinds.length ? kinds : ORDER;
  const visibleKinds = useMemo(
    () => activeKinds.filter((k) => entry.byKind[k].length > 0),
    [activeKinds, entry],
  );

  return (
    <section
      style={{
        border: '1px solid rgba(148,180,255,0.13)',
        borderRadius: 12,
        background: 'rgba(10,16,28,0.66)',
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="afra-btn"
        style={{
          width: '100%',
          textAlign: 'left',
          padding: '11px 12px',
          borderRadius: 12,
          background: 'transparent',
          border: 'none',
          color: '#d7e3f6',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: '#e4edff' }}>
            {open ? '▾' : '▸'} {entry.canonical}
          </span>
          <CountTag label="add" value={entry.totals.add} />
          <CountTag label="mod" value={entry.totals.modify} />
          <CountTag label="rem" value={entry.totals.remove} />
          <CountTag label="drv" value={entry.totals.derived} />
        </div>
      </button>

      {open && (
        <div style={{ borderTop: '1px solid rgba(148,180,255,0.10)', padding: 10, display: 'grid', gap: 10 }}>
          {visibleKinds.length === 0 && (
            <div style={{ fontSize: 12, color: '#7f94b1' }}>No events with current filter.</div>
          )}

          {visibleKinds.map((kind) => (
            <div key={kind} style={{ display: 'grid', gap: 8 }}>
              <div
                style={{
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontSize: 11.5,
                  color: '#9db3d0',
                  textTransform: 'uppercase',
                }}
              >
                {kind}
              </div>
              {entry.byKind[kind].map((row, idx) => (
                <StepOccurrenceRow key={kind + '-' + row.step + '-' + idx} kind={kind} row={row} onPathClick={onPathClick} />
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function CountTag({ label, value }: { label: string; value: number }) {
  return (
    <span
      style={{
        fontFamily: 'IBM Plex Mono, monospace',
        fontSize: 10,
        borderRadius: 6,
        padding: '2px 5px',
        background: 'rgba(148,180,255,0.10)',
        color: '#93a8c4',
      }}
    >
      {label}:{value}
    </span>
  );
}
