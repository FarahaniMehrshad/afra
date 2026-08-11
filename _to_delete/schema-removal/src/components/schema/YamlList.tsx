import { ROW_HEIGHT } from '@/constants';
import type { YamlLine } from '@/types/schema';

interface Props {
  lines: YamlLine[];
  selCanon: string | null;
  onSelect: (canon: string) => void;
  /** Line-number offset — used so wpf lines number 1..N and exe continues from there. */
  startNumber?: number;
}

/**
 * Renders one YAML pane. There's one instance per variant on the schema
 * page, so the variant is a property of the enclosing section header
 * rather than a per-line tag.
 */
export function YamlList({ lines, selCanon, onSelect, startNumber = 1 }: Props) {
  if (!lines.length) {
    return (
      <div
        style={{
          padding: '18px 24px',
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: 11.5,
          color: '#5f7292',
        }}
      >
        No document to render — this variant has no readable step.
      </div>
    );
  }

  return (
    <div
      style={{
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
                gridTemplateColumns: '52px 1fr',
                height: ROW_HEIGHT,
                cursor: 'pointer',
                background: sel ? 'rgba(79,141,253,0.20)' : 'transparent',
              }}
            >
              <div
                style={{
                  textAlign: 'right',
                  paddingRight: 9,
                  color: '#4c5c78',
                  userSelect: 'none',
                }}
              >
                {startNumber + i}
              </div>
              <div
                style={{
                  padding: '0 10px',
                  whiteSpace: 'pre',
                  color: sel
                    ? '#eef3ff'
                    : l.aliasOf
                      ? '#8fb3ee'
                      : l.selected
                        ? '#c8d6ec'
                        : '#8496b3',
                  // Aliased lines get a subtle background so operators can spot
                  // the "this is a reference, not the definition" cue quickly.
                  backgroundColor: l.aliasOf
                    ? 'rgba(79,141,253,0.06)'
                    : l.anchor
                      ? 'rgba(52,170,120,0.04)'
                      : undefined,
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
