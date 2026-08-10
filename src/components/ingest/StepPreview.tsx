import { useAppStore } from '@/store/appStore';

/** Two-pane preview that appears after a folder is loaded. */
export function StepPreview() {
  const bundle = useAppStore((s) => s.bundle);
  const setPage = useAppStore((s) => s.setPage);
  const setStepIdx = useAppStore((s) => s.setStepIdx);
  if (!bundle) return null;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1.35fr 1fr',
        gap: 18,
        alignItems: 'start',
      }}
    >
      <div style={panel}>
        <div style={panelHeader}>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#dbe4f2' }}>
            Steps detected
          </span>
          <span
            style={{
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: 11,
              color: '#6d7f9c',
            }}
          >
            .wpf.json / .exe.json per step
          </span>
        </div>
        <div style={{ maxHeight: 460, overflow: 'auto' }}>
          {bundle.steps.map((s, i) => (
            <div
              key={i}
              onClick={() => {
                setPage('steps');
                setStepIdx(Math.max(1, i));
              }}
              className="afra-row-hover"
              style={{
                cursor: 'pointer',
                display: 'flex',
                gap: 12,
                padding: '11px 16px',
                borderBottom: '1px solid rgba(148,180,255,0.05)',
              }}
            >
              <span
                style={{
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontSize: 11.5,
                  color: '#4f8dfd',
                  flex: 'none',
                  width: 24,
                  textAlign: 'right',
                }}
              >
                {String(s.ordinal).padStart(2, '0')}
              </span>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: 12.5,
                    color: '#dbe4f2',
                    marginBottom: 3,
                  }}
                >
                  {i === 0 ? s.label + '  (baseline)' : s.label}
                </div>
                <div
                  style={{ fontSize: 12, color: '#7f92b0', lineHeight: 1.5 }}
                >
                  {s.operation}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={panel}>
        <div style={{ ...panelHeader, fontSize: 13, fontWeight: 500 }}>
          journey.md
        </div>
        <pre
          style={{
            margin: 0,
            padding: '14px 16px',
            maxHeight: 460,
            overflow: 'auto',
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 11.5,
            lineHeight: 1.7,
            color: '#8fa2c0',
            whiteSpace: 'pre-wrap',
          }}
        >
          {bundle.journeyMd}
        </pre>
      </div>
    </div>
  );
}

const panel: React.CSSProperties = {
  borderRadius: 16,
  border: '1px solid rgba(148,180,255,0.11)',
  background: 'rgba(148,180,255,0.045)',
  backdropFilter: 'blur(18px) saturate(140%)',
  WebkitBackdropFilter: 'blur(18px) saturate(140%)',
  overflow: 'hidden',
  color: '#dbe4f2',
};

const panelHeader: React.CSSProperties = {
  padding: '13px 16px',
  borderBottom: '1px solid rgba(148,180,255,0.08)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  color: '#dbe4f2',
};
