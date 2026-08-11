import { forwardRef } from 'react';
import { COLORS, LLM_CATEGORY_UI, ROW_HEIGHT } from '@/constants';
import type { HistoryEvent, MergedLine } from '@/types/ir';
import type { JourneyStep, Variant } from '@/types/journey';
import type { LlmVerdict } from '@/types/llm';
import { verdictKey } from '@/store/llmStore';

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
  variant: Variant;
  hasStepFilter: boolean;
  verdicts: Map<string, LlmVerdict>;
  onSelect: (path: string) => void;
}

/** The LLM's verdict for one row, abbreviated to fit the gutter. */
function VerdictBadge({ verdict }: { verdict: LlmVerdict | undefined }) {
  if (!verdict) return <div />;
  const ui = LLM_CATEGORY_UI[verdict.category];
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span
        title={
          ui.label +
          ' · ' +
          Math.round(verdict.confidence * 100) +
          '% confident\n' +
          (verdict.reason || ui.blurb)
        }
        style={{
          fontSize: 9.5,
          lineHeight: '14px',
          padding: '0 5px',
          borderRadius: 5,
          background: ui.bg,
          color: ui.color,
          letterSpacing: '0.04em',
          opacity: verdict.confidence < 0.4 ? 0.55 : 1,
        }}
      >
        {ui.short}
      </span>
    </div>
  );
}

function kindColors(kinds: Set<HistoryEvent['st']>) {
  if (kinds.has('remove')) return { bg: 'rgba(226,90,105,0.07)', chip: 'rgba(226,90,105,0.18)', text: '#f0a0aa' };
  if (kinds.has('modify')) return { bg: 'rgba(224,176,84,0.07)', chip: 'rgba(224,176,84,0.18)', text: '#e8c67d' };
  return { bg: 'rgba(52,170,120,0.06)', chip: 'rgba(52,170,120,0.16)', text: '#7ee0b0' };
}

/** The scrolling merged-JSON list itself. */
export const MergedList = forwardRef<HTMLDivElement, Props>(function MergedList(
  { lines, selPath, wrap, steps, variant, hasStepFilter, verdicts, onSelect },
  ref,
) {
  const ws = wrap ? 'pre-wrap' : 'pre';
  // The verdict gutter only earns its width once a run has produced something.
  const gutter = verdicts.size > 0;

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
          const verdict =
            gutter && (!hasStepFilter || x.evs.length > 0)
              ? verdicts.get(verdictKey(variant, x.l.path))
              : undefined;
          return (
            <div
              key={ri}
              onClick={() => onSelect(x.l.path)}
              className="afra-row-outline"
              style={{
                display: 'grid',
                gridTemplateColumns: gutter ? '96px 42px 52px 1fr' : '96px 52px 1fr',
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
              {gutter && <VerdictBadge verdict={verdict} />}
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
