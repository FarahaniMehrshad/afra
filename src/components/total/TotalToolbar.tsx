import { useAppStore } from '@/store/appStore';
import { Segmented } from '../ui/Segmented';
import { Toggle } from '../ui/Toggle';
import { IconButton } from '../ui/IconButton';
import type { EventKind } from '@/types/ir';
import type { Variant } from '@/types/journey';
import { COLORS } from '@/constants';

interface Props {
  changeLabel: string;
  countLabel: string;
  onJump: (dir: 1 | -1) => void;
}

const TYPE_OPTIONS: {
  value: EventKind;
  label: string;
  color: string;
  title: string;
}[] = [
  { value: 'add', label: 'add', color: COLORS.add, title: 'only lines added in some step' },
  {
    value: 'modify',
    label: 'mod',
    color: COLORS.modify,
    title: 'only lines modified in some step',
  },
  {
    value: 'remove',
    label: 'rem',
    color: COLORS.remove,
    title: 'only lines removed in some step',
  },
];

const COUNT_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'any' },
  { value: 1, label: '≥1' },
  { value: 2, label: '≥2' },
  { value: 3, label: '≥3' },
  { value: 5, label: '≥5' },
];

/** Toolbar for the merged / total view. */
export function TotalToolbar({ changeLabel, countLabel, onJump }: Props) {
  const variant = useAppStore((s) => s.variant);
  const setVariant = useAppStore((s) => s.setVariant);
  const onlyChanged = useAppStore((s) => s.onlyChanged);
  const toggleChanged = useAppStore((s) => s.toggleChanged);
  const typeFilters = useAppStore((s) => s.typeFilters);
  const toggleType = useAppStore((s) => s.toggleType);
  const minCount = useAppStore((s) => s.minCount);
  const setMinCount = useAppStore((s) => s.setMinCount);
  const totalQuery = useAppStore((s) => s.totalQuery);
  const setTotalQuery = useAppStore((s) => s.setTotalQuery);

  return (
    <div
      style={{
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
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
          merged configuration
        </div>
        <div style={{ fontSize: 11.5, color: '#7f92b0', marginTop: 2 }}>
          union of every step — nothing dropped once it appeared
        </div>
      </div>
      <span style={{ flex: 1 }} />

      <Segmented<Variant>
        options={[
          { value: 'wpf', label: 'wpf' },
          { value: 'exe', label: 'exe' },
        ]}
        isActive={(v) => v === variant}
        onSelect={setVariant}
      />

      <Toggle active={onlyChanged} onClick={toggleChanged}>
        changed only
      </Toggle>

      <Segmented<EventKind>
        options={TYPE_OPTIONS}
        // A type filter is *active* when it's included in the filter set.
        isActive={(v) => typeFilters.includes(v)}
        onSelect={toggleType}
        small
      />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          padding: '3px 3px 3px 9px',
          borderRadius: 10,
          background: 'rgba(148,180,255,0.05)',
          border: '1px solid rgba(148,180,255,0.09)',
        }}
      >
        <span
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 10.5,
            color: '#5f7292',
          }}
        >
          steps
        </span>
        {COUNT_OPTIONS.map((c) => {
          const active = minCount === c.value;
          return (
            <button
              key={c.value}
              onClick={() => setMinCount(c.value)}
              className="afra-btn"
              style={{
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: 11,
                padding: '5px 9px',
                borderRadius: 8,
                border: 'none',
                background: active ? 'rgba(79,141,253,0.24)' : 'transparent',
                color: active ? '#e9f0ff' : '#8195b3',
              }}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <IconButton onClick={() => onJump(-1)} title="previous changed line">
          ↑
        </IconButton>
        <IconButton onClick={() => onJump(1)} title="next changed line">
          ↓
        </IconButton>
        <span
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 10.5,
            color: '#5f7292',
          }}
        >
          {changeLabel}
        </span>
      </div>

      <input
        value={totalQuery}
        onChange={(e) => setTotalQuery(e.target.value)}
        placeholder="Search keys or values…"
        className="afra-input"
        style={{
          width: 210,
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
        {countLabel}
      </span>
    </div>
  );
}
