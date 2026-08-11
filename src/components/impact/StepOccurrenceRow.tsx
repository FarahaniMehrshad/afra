import { COLORS } from '@/constants';
import type { EventKind } from '@/types/ir';
import type { UiFieldStepOccurrence } from '@/types/impact';
import type { Variant } from '@/types/journey';
import { DerivedList } from './DerivedList';

interface Props {
  kind: EventKind;
  row: UiFieldStepOccurrence;
  onPathClick: (path: string, variant: Variant) => void;
}

export function StepOccurrenceRow({
  kind,
  row,
  onPathClick,
}: Props) {
  const accent = kind === 'add' ? COLORS.add : kind === 'remove' ? COLORS.remove : COLORS.modify;
  const variantsInRow = new Set(row.concretePaths.map((p) => p.variant));
  const showVariantPill = variantsInRow.size > 1;

  return (
    <div
      style={{
        border: '1px solid rgba(148,180,255,0.12)',
        borderRadius: 10,
        padding: 10,
        background: 'rgba(8,13,24,0.52)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 11,
            color: accent,
          }}
        >
          step {String(row.step).padStart(2, '0')}
        </span>
        <span style={{ fontSize: 12, color: '#d7e2f4' }}>{row.label}</span>
        {row.sharedWith > 0 && (
          <span
            style={{
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: 10,
              color: '#7f94b1',
            }}
          >
            shared with {row.sharedWith} other UI fields
          </span>
        )}
      </div>
      {row.operation && (
        <div style={{ marginTop: 4, fontSize: 11.5, color: '#8ea3c1' }}>{row.operation}</div>
      )}

      <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
        {row.concretePaths.map((item, idx) => (
          <button
            key={item.path + idx}
            onClick={() => onPathClick(item.path, item.variant)}
            className="afra-btn afra-row-outline"
            style={{
              textAlign: 'left',
              borderRadius: 8,
              border: '1px solid rgba(148,180,255,0.14)',
              background: 'rgba(148,180,255,0.05)',
              padding: '7px 9px',
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: 11,
              color: '#d2def2',
            }}
            title={item.path}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              {showVariantPill && <VariantPill variant={item.variant} />}
              <div style={{ color: '#8ea6c5' }}>{changeText(item.event)}</div>
            </div>
            <div style={{ wordBreak: 'break-all' }}>{item.path}</div>
          </button>
        ))}
      </div>

      {row.mergedInto === null && row.mergesFrom && row.mergesFrom.length > 0 && (
        <div
          style={{
            marginTop: 6,
            border: '1px solid rgba(148,180,255,0.12)',
            borderRadius: 8,
            padding: 8,
            background: 'rgba(148,180,255,0.04)',
          }}
        >
          <div
            style={{
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: 10.5,
              color: '#8ea3c1',
              marginBottom: 5,
            }}
          >
            also written to {row.mergesFrom.length} sibling field
            {row.mergesFrom.length > 1 ? 's' : ''}
          </div>
          <div style={{ display: 'grid', gap: 5 }}>
            {row.mergesFrom.map((s) => (
              <button
                key={s.canonical}
                className="afra-btn afra-row-outline"
                onClick={() => {
                  const path = s.concretePaths[0];
                  if (path) onPathClick(path, s.variant);
                }}
                style={{
                  textAlign: 'left',
                  borderRadius: 7,
                  border: '1px solid rgba(148,180,255,0.14)',
                  background: 'rgba(148,180,255,0.06)',
                  padding: '5px 7px',
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontSize: 10.5,
                  color: '#c6d5ec',
                }}
                title={s.concretePaths[0] ?? s.canonical}
              >
                <VariantPill variant={s.variant} />
                <span style={{ marginLeft: 6 }}>{s.canonical}</span>
                <span style={{ marginLeft: 6, color: '#7f94b1' }}>
                  ({s.concretePaths.length} path{s.concretePaths.length > 1 ? 's' : ''})
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <DerivedList rows={row.derived} onPathClick={onPathClick} />
    </div>
  );
}

function changeText(e: UiFieldStepOccurrence['concretePaths'][number]['event']): string {
  if (e.st === 'add') return '= ' + (e.to ?? 'null');
  if (e.st === 'remove') return '= ' + (e.from ?? 'null');
  return (e.from ?? 'null') + ' → ' + (e.to ?? 'null');
}

function VariantPill({ variant }: { variant: Variant }) {
  const bg = variant === 'wpf' ? 'rgba(79,141,253,0.20)' : 'rgba(160,118,240,0.20)';
  const fg = variant === 'wpf' ? '#cfe0ff' : '#dbc8ff';
  return (
    <span
      style={{
        fontFamily: 'IBM Plex Mono, monospace',
        fontSize: 9.5,
        lineHeight: '14px',
        padding: '0 5px',
        borderRadius: 5,
        background: bg,
        color: fg,
      }}
    >
      {variant}
    </span>
  );
}
