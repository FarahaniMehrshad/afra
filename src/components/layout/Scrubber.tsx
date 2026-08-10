import { useAppStore } from '@/store/appStore';
import { useBuild } from '@/hooks/useBuild';

/**
 * Horizontal step scrubber under the header. Bar heights encode the
 * meaningful-change count each step introduced.
 */
export function Scrubber() {
  const bundle = useAppStore((s) => s.bundle);
  const page = useAppStore((s) => s.page);
  const stepIdx = useAppStore((s) => s.stepIdx);
  const setStepIdx = useAppStore((s) => s.setStepIdx);
  const setPage = useAppStore((s) => s.setPage);
  const build = useBuild();

  if (!bundle) return null;
  const max = Math.max(1, ...(build?.counts ?? [1]));

  return (
    <div
      style={{
        position: 'relative',
        zIndex: 2,
        flex: 'none',
        display: 'flex',
        alignItems: 'flex-end',
        gap: 3,
        height: 56,
        padding: '0 20px 9px',
        background: 'rgba(11,17,29,0.4)',
        borderBottom: '1px solid rgba(148,180,255,0.07)',
      }}
    >
      <span
        style={{
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: 10,
          color: '#5f7292',
          letterSpacing: '0.1em',
          paddingBottom: 3,
          marginRight: 8,
          flex: 'none',
        }}
      >
        TIMELINE
      </span>
      {bundle.steps.map((s, i) => {
        if (i === 0) return null;
        const c = build?.counts[i] ?? 0;
        const active = page === 'steps' && i === stepIdx;
        return (
          <div
            key={i}
            title={s.label + ' — ' + c + ' meaningful changes'}
            onClick={() => {
              setPage('steps');
              setStepIdx(i);
            }}
            style={{
              flex: 1,
              minWidth: 0,
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              gap: 4,
              height: 40,
              paddingBottom: 2,
              opacity: active ? 1 : 0.72,
              transition: 'opacity 0.15s ease',
            }}
          >
            <div
              style={{
                height: Math.max(3, Math.round(4 + (c / max) * 30)),
                borderRadius: '3px 3px 0 0',
                background: active
                  ? 'linear-gradient(180deg, #7fb0ff, #4f8dfd)'
                  : c
                    ? 'rgba(120,165,255,0.34)'
                    : 'rgba(148,180,255,0.14)',
                boxShadow: active ? '0 0 14px rgba(79,141,253,0.55)' : 'none',
              }}
            />
            <div
              className="afra-ellipsis"
              style={{
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: 9.5,
                color: active ? '#cfe0ff' : '#5f7292',
                textAlign: 'center',
              }}
            >
              {String(s.ordinal).padStart(2, '0')}
            </div>
          </div>
        );
      })}
    </div>
  );
}
