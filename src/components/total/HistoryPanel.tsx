import { COLORS, LLM_CATEGORY_UI } from '@/constants';
import { useAppStore } from '@/store/appStore';
import { useLlmStore, verdictKey } from '@/store/llmStore';
import { useBuild } from '@/hooks/useBuild';
import type { EventKind } from '@/types/ir';
import type { LlmVerdict } from '@/types/llm';

/** Right rail — history of the currently selected path. */
export function HistoryPanel() {
  const bundle = useAppStore((s) => s.bundle);
  const selPath = useAppStore((s) => s.selPath);
  const hideNoise = useAppStore((s) => s.hideNoise);
  const totalStepFilters = useAppStore((s) => s.totalStepFilters);
  const variant = useAppStore((s) => s.variant);
  const build = useBuild();
  const verdict = useLlmStore((s) =>
    selPath === null ? undefined : s.verdicts.get(verdictKey(variant, selPath)),
  );

  if (!bundle || !build) return null;

  const hasStepFilter = totalStepFilters.length > 0;
  const evs = selPath !== null
    ? (build.hist.get(selPath) ?? []).filter(
        (e) => !(hideNoise && e.noise) && (!hasStepFilter || totalStepFilters.includes(e.i)),
      )
    : [];

  return (
    <aside
      style={{
        flex: 'none',
        width: 370,
        display: 'flex',
        flexDirection: 'column',
        borderLeft: '1px solid rgba(148,180,255,0.09)',
        background: 'rgba(11,17,29,0.5)',
        backdropFilter: 'blur(20px) saturate(140%)',
        WebkitBackdropFilter: 'blur(20px) saturate(140%)',
      }}
    >
      <div
        style={{
          padding: '13px 16px',
          borderBottom: '1px solid rgba(148,180,255,0.08)',
          flex: 'none',
        }}
      >
        <div
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 10.5,
            letterSpacing: '0.12em',
            color: '#5f7292',
            marginBottom: 6,
          }}
        >
          LINE HISTORY
        </div>
        <div
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 11.5,
            color: '#b6c6e0',
            lineHeight: 1.6,
            wordBreak: 'break-all',
          }}
        >
          {formatPath(selPath)}
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 14px 30px' }}>
        {verdict && (!hasStepFilter || evs.length > 0) && <VerdictCard verdict={verdict} />}
        {selPath === null || evs.length === 0 ? (
          <div
            style={{
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: 11.5,
              color: '#5f7292',
              lineHeight: 1.7,
            }}
          >
            {selPath === null
              ? 'Click any line to see how it moved through the steps.'
              : hasStepFilter
                ? 'This line has no changes in the selected step filter.'
                : 'This line never changed across the run' +
                  (hideNoise ? ' (or every change on it was ID/UID noise).' : '.')}
          </div>
        ) : (
          evs.map((e, i) => {
            const s = bundle.steps[e.i];
            const c = colorsFor(e.st);
            return (
              <div
                key={i}
                style={{
                  marginBottom: 8,
                  borderRadius: 12,
                  border: '1px solid ' + c.bd,
                  background: c.bg,
                  padding: '10px 12px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 6,
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'IBM Plex Mono, monospace',
                      fontSize: 10.5,
                      color: '#6d7f9c',
                    }}
                  >
                    step {String(s.ordinal).padStart(2, '0')}
                  </span>
                  <span
                    className="afra-ellipsis"
                    style={{
                      fontFamily: 'IBM Plex Mono, monospace',
                      fontSize: 11.5,
                      color: '#cfdcf0',
                    }}
                  >
                    {s.label}
                  </span>
                  <span style={{ flex: 1 }} />
                  <span
                    style={{
                      fontFamily: 'IBM Plex Mono, monospace',
                      fontSize: 10,
                      letterSpacing: '0.06em',
                      padding: '2px 7px',
                      borderRadius: 6,
                      background: c.bg,
                      color: c.fg,
                    }}
                  >
                    {e.st}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: '#7f92b0',
                    lineHeight: 1.5,
                    marginBottom: 6,
                  }}
                >
                  {s.operation}
                </div>
                <div
                  style={{
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: 11,
                    lineHeight: 1.6,
                    wordBreak: 'break-all',
                  }}
                >
                  <span style={{ color: '#f0a0aa' }}>{e.from ?? ''}</span>
                  <span style={{ color: '#5f7292' }}>
                    {e.from != null && e.to != null ? '  →  ' : ''}
                  </span>
                  <span style={{ color: '#7ee0b0' }}>{e.to ?? ''}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

/** What the model made of this path, above the raw event list. */
function VerdictCard({ verdict }: { verdict: LlmVerdict }) {
  const ui = LLM_CATEGORY_UI[verdict.category];
  const pct = Math.round(verdict.confidence * 100);

  return (
    <div
      style={{
        marginBottom: 12,
        borderRadius: 12,
        border: '1px solid ' + ui.bg,
        background: 'rgba(148,180,255,0.04)',
        padding: '10px 12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
        <span
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 10,
            letterSpacing: '0.06em',
            padding: '2px 7px',
            borderRadius: 6,
            background: ui.bg,
            color: ui.color,
          }}
        >
          {ui.label}
        </span>
        <span style={{ flex: 1 }} />
        <span
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 10,
            color: '#6d7f9c',
          }}
        >
          {pct}%
        </span>
      </div>

      <div
        style={{
          height: 3,
          borderRadius: 2,
          background: 'rgba(148,180,255,0.10)',
          marginBottom: 8,
          overflow: 'hidden',
        }}
      >
        <div style={{ width: pct + '%', height: '100%', background: ui.color }} />
      </div>

      <div style={{ fontSize: 11.5, color: '#b6c6e0', lineHeight: 1.55 }}>
        {verdict.reason || ui.blurb}
      </div>
    </div>
  );
}

function formatPath(p: string | null): string {
  if (p === null) return '—';
  if (p === '') return '/ (document root)';
  return p.replace(/^\//, '').split('/').join('  ›  ');
}

function colorsFor(k: EventKind) {
  if (k === 'add') return { bd: COLORS.addPanelBd, bg: COLORS.addPanelBg, fg: COLORS.add };
  if (k === 'remove')
    return { bd: COLORS.removePanelBd, bg: COLORS.removePanelBg, fg: COLORS.remove };
  return { bd: COLORS.modifyPanelBd, bg: COLORS.modifyPanelBg, fg: COLORS.modify };
}
