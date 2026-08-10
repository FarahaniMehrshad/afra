import { CSSProperties } from 'react';

interface SegmentOption<T extends string> {
  value: T;
  label: string;
  color?: string;
  title?: string;
}

interface Props<T extends string> {
  options: SegmentOption<T>[];
  isActive: (v: T) => boolean;
  onSelect: (v: T) => void;
  small?: boolean;
}

const wrap: CSSProperties = {
  display: 'flex',
  gap: 3,
  padding: 3,
  borderRadius: 10,
  background: 'rgba(148,180,255,0.05)',
  border: '1px solid rgba(148,180,255,0.09)',
};

/**
 * Radio-style pill group. Individual segments can be styled independently
 * (used by the merged-view type chips which use their own accent per kind).
 */
export function Segmented<T extends string>({
  options,
  isActive,
  onSelect,
  small,
}: Props<T>) {
  return (
    <div style={wrap} role="tablist">
      {options.map((opt) => {
        const active = isActive(opt.value);
        return (
          <button
            key={opt.value}
            title={opt.title}
            onClick={() => onSelect(opt.value)}
            className="afra-btn"
            style={{
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: small ? 11 : 11.5,
              padding: '5px ' + (small ? 10 : 11) + 'px',
              borderRadius: 8,
              border: 'none',
              background: active ? 'rgba(79,141,253,0.24)' : 'transparent',
              color: active ? opt.color ?? '#e9f0ff' : '#8195b3',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
