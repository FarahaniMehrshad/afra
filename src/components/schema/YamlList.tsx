import { ROW_HEIGHT } from '@/constants';
import type { Variant } from '@/types/journey';
import type { YamlLine } from '@/types/schema';

interface Props {
  lines: YamlLine[];
  selCanon: string | null;
  onSelect: (canon: string) => void;
}

/** The generated YAML, one clickable line per canonical path. */
export function YamlList({ lines, selCanon, onSelect }: Props) {
  return (
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        fontFamily: 'IBM Plex Mono, monospace',
        fontSize: 12,
        lineHeight: ROW_HEIGHT + 'px',
      }}
    >
      <div style={{ minWidth: '100%', width: 'max-content' }}>
        {lines.map((l, i) => {
          const sel = selCanon !== null && l.canon === selCanon;
          return (
            <div
              key={i}
              onClick={() => onSelect(l.canon)}
              className="afra-row-outline"
              style={{
                display: 'grid',
                gridTemplateColumns: '68px 52px 1fr',
                height: ROW_HEIGHT,
                cursor: 'pointer',
                background: sel ? 'rgba(79,141,253,0.20)' : 'transparent',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  paddingLeft: 10,
                  overflow: 'hidden',
                }}
              >
                {l.variants.map((v) => (
                  <VariantTag key={v} variant={v} />
                ))}
              </div>
              <div
                style={{
                  textAlign: 'right',
                  paddingRight: 9,
                  color: '#4c5c78',
                  userSelect: 'none',
                }}
              >
                {i + 1}
              </div>
              <div
                style={{
                  padding: '0 10px',
                  whiteSpace: 'pre',
                  color: sel ? '#eef3ff' : l.selected ? '#c8d6ec' : '#8496b3',
                }}
              >
                {l.text}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const TAG_COLORS: Record<Variant, { bg: string; fg: string }> = {
  wpf: { bg: 'rgba(79,141,253,0.18)', fg: '#9cc0ff' },
  exe: { bg: 'rgba(52,170,120,0.16)', fg: '#7ee0b0' },
};

function VariantTag({ variant }: { variant: Variant }) {
  const c = TAG_COLORS[variant];
  return (
    <span
      title={'present in the ' + variant + ' configuration'}
      style={{
        fontSize: 9.5,
        lineHeight: '14px',
        padding: '0 5px',
        borderRadius: 5,
        background: c.bg,
        color: c.fg,
        flex: 'none',
      }}
    >
      {variant}
    </span>
  );
}
