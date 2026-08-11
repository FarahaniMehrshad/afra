import { COLORS } from '@/constants';
import type { EventKind } from '@/types/ir';
import type { UiFieldStepOccurrence } from '@/types/impact';
import { DerivedList } from './DerivedList';

interface Props {
  kind: EventKind;
  row: UiFieldStepOccurrence;
  onPathClick: (path: string) => void;
}

export function StepOccurrenceRow({ kind, row, onPathClick }: Props) {
  const accent = kind === 'add' ? COLORS.add : kind === 'remove' ? COLORS.remove : COLORS.modify;

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
            onClick={() => onPathClick(item.path)}
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
            <div style={{ color: '#8ea6c5', marginBottom: 3 }}>{changeText(item.event)}</div>
            <div style={{ wordBreak: 'break-all' }}>{item.path}</div>
          </button>
        ))}
      </div>

      <DerivedList rows={row.derived} onPathClick={onPathClick} />
    </div>
  );
}

function changeText(e: UiFieldStepOccurrence['concretePaths'][number]['event']): string {
  if (e.st === 'add') return '= ' + (e.to ?? 'null');
  if (e.st === 'remove') return '= ' + (e.from ?? 'null');
  return (e.from ?? 'null') + ' → ' + (e.to ?? 'null');
}
