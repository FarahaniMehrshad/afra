import { COLORS } from '@/constants';
import { useAppStore } from '@/store/appStore';
import { useBuild } from '@/hooks/useBuild';
import type { EventKind } from '@/types/ir';

/** Right rail — history of the currently selected path. */
export function HistoryPanel() {
  const bundle = useAppStore((s) => s.bundle);
  const selPath = useAppStore((s) => s.selPath);
  const hideNoise = useAppStore((s) => s.hideNoise);
  const build = useBuild();

  if (!bundle || !build) return null;

  const evs = selPath !== null
    ? (build.hist.get(selPath) ?? []).filter((e) => !(hideNoise && e.noise))
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
