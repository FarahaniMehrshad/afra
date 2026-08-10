import { forwardRef } from 'react';
import { COLORS, ROW_HEIGHT } from '@/constants';
import type { HistoryEvent, MergedLine } from '@/types/ir';
import type { JourneyStep } from '@/types/journey';

export interface ShownLine {
  l: MergedLine;
  i: number;
  evs: HistoryEvent[];
}

interface Props {
  lines: ShownLine[];
  selPath: string | null;
  wrap: boolean;
  steps: JourneyStep[];
  onSelect: (path: string) => void;
}

function kindColors(kinds: Set<HistoryEvent['st']>) {
  if (kinds.has('remove')) return { bg: 'rgba(226,90,105,0.07)', chip: 'rgba(226,90,105,0.18)', text: '#f0a0aa' };
  if (kinds.has('modify')) return { bg: 'rgba(224,176,84,0.07)', chip: 'rgba(224,176,84,0.18)', text: '#e8c67d' };
  return { bg: 'rgba(52,170,120,0.06)', chip: 'rgba(52,170,120,0.16)', text: '#7ee0b0' };
}

/** The scrolling merged-JSON list itself. */
export const MergedList = forwardRef<HTMLDivElement, Props>(function MergedList(
  { lines, selPath, wrap, steps, onSelect },
  ref,
) {
  const ws = wrap ? 'pre-wrap' : 'pre';

  return (
    <div
      ref={ref}
      style={{
        flex: 1,
        overflow: 'auto',
        fontFamily: 'IBM Plex Mono, monospace',
        fontSize: 12,
        lineHeight: ROW_HEIGHT + 'px',
      }}
    >
      <div style={{ minWidth: '100%', width: 'max-content' }}>
        {lines.map((x, ri) => {
          const sel = selPath !== null && x.l.path === selPath;
          const kinds = new Set(x.evs.map((e) => e.st));
          const colors = kindColors(kinds);
          return (
            <div
              key={ri}
              onClick={() => onSelect(x.l.path)}
              className="afra-row-outline"
              style={{
                display: 'grid',
                gridTemplateColumns: '96px 52px 1fr',
                height: ROW_HEIGHT,
                cursor: 'pointer',
                background: sel
                  ? 'rgba(79,141,253,0.20)'
                  : x.evs.length
                    ? colors.bg
                    : 'transparent',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  paddingLeft: 10,
                  overflow: 'hidden',
                }}
              >
                <span
                  title={
                    x.evs.length
                      ? 'changed in ' +
                        x.evs.length +
                        ' step(s): ' +
                        x.evs.map((e) => steps[e.i].label + ' · ' + e.st).join(', ')
                      : ''
                  }
                  style={{
                    flex: 'none',
                    minWidth: 26,
                    marginRight: 4,
                    textAlign: 'center',
                    fontSize: 10,
                    lineHeight: '14px',
                    borderRadius: 5,
                    background: x.evs.length ? colors.chip : 'transparent',
                    color: x.evs.length ? colors.text : 'transparent',
                  }}
                >
                  {x.evs.length ? x.evs.length + '×' : ''}
                </span>
                {x.evs.slice(0, 10).map((e, ei) => (
                  <span
                    key={ei}
                    title={
                      'step ' +
                      (steps[e.i]?.ordinal ?? e.i + 1) +
                      ' · ' +
                      steps[e.i]?.label +
                      ' · ' +
                      e.st
                    }
                    style={{
                      width: 5,
                      height: 11,
                      borderRadius: 2,
                      background:
                        e.st === 'add'
                          ? COLORS.addChip
                          : e.st === 'remove'
                            ? COLORS.removeChip
                            : COLORS.modifyChip,
                      flex: 'none',
                    }}
                  />
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
                {x.i + 1}
              </div>
              <div
                style={{
                  padding: '0 10px',
                  color: sel ? '#eef3ff' : x.evs.length ? '#c8d6ec' : '#8496b3',
                  whiteSpace: ws,
                  wordBreak: 'break-all',
                  overflow: 'hidden',
                }}
              >
                {x.l.text + x.l.tail}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
