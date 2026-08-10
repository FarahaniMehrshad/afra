import { useMemo } from 'react';
import { useAppStore } from '@/store/appStore';
import { useBuild } from '@/hooks/useBuild';
import { diffTexts } from '@/services/diff.service';

/** Left sidebar in the per-step view — filter and jump between steps. */
export function StepNav() {
  const bundle = useAppStore((s) => s.bundle);
  const stepIdx = useAppStore((s) => s.stepIdx);
  const setStepIdx = useAppStore((s) => s.setStepIdx);
  const hideNoise = useAppStore((s) => s.hideNoise);
  const stepQuery = useAppStore((s) => s.stepQuery);
  const setStepQuery = useAppStore((s) => s.setStepQuery);
  const build = useBuild();

  const rows = useMemo(() => {
    if (!bundle || !build) return [];
    const q = stepQuery.trim().toLowerCase();
    return bundle.steps
      .map((s, i) => ({ s, i }))
      .filter(
        ({ s, i }) =>
          i > 0 && (!q || (s.label + ' ' + s.operation).toLowerCase().includes(q)),
      )
      .map(({ s, i }) => {
        const cur = build.docs[i]?.text ?? '';
        const prev = i > 0 ? build.docs[i - 1]?.text ?? '' : '';
        const rr = diffTexts(prev, cur);
        const adds = rr.filter(
          (r) => (r.k === 'add' || r.k === 'mod') && !(hideNoise && r.noise),
        ).length;
        const dels = rr.filter(
          (r) => (r.k === 'del' || r.k === 'mod') && !(hideNoise && r.noise),
        ).length;
        return { s, i, adds, dels };
      });
  }, [bundle, build, stepQuery, hideNoise]);

  return (
    <div
      style={{
        flex: 'none',
        width: 290,
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid rgba(148,180,255,0.08)',
        background: 'rgba(11,17,29,0.45)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
      }}
    >
      <div style={{ padding: '12px 14px', flex: 'none' }}>
        <input
          value={stepQuery}
          onChange={(e) => setStepQuery(e.target.value)}
          placeholder="Filter steps…"
          className="afra-input"
          style={{
            width: '100%',
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 12,
            padding: '8px 11px',
            borderRadius: 10,
            border: '1px solid rgba(148,180,255,0.12)',
            background: 'rgba(148,180,255,0.05)',
            color: '#dbe4f2',
            outline: 'none',
          }}
        />
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '0 8px 14px' }}>
        {rows.map(({ s, i, adds, dels }) => {
          const active = i === stepIdx;
          return (
            <div
              key={i}
              onClick={() => setStepIdx(i)}
              className="afra-row-outline"
              style={{
                cursor: 'pointer',
                marginBottom: 4,
                padding: '10px 12px',
                borderRadius: 11,
                border:
                  '1px solid ' +
                  (active
                    ? 'rgba(120,165,255,0.38)'
                    : 'rgba(148,180,255,0.07)'),
                background: active ? 'rgba(79,141,253,0.16)' : 'transparent',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 4,
                }}
              >
                <span
                  style={{
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: 11,
                    color: active ? '#4f8dfd' : '#5f7292',
                  }}
                >
                  {String(s.ordinal).padStart(2, '0')}
                </span>
                <span
                  className="afra-ellipsis"
                  style={{
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: 12,
                    color: active ? '#e9f0ff' : '#b6c6e0',
                  }}
                >
                  {s.label}
                </span>
                <span style={{ flex: 1 }} />
                <span
                  style={{
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: 10,
                    color: '#7ee0b0',
                  }}
                >
                  +{adds}
                </span>
                <span
                  style={{
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: 10,
                    color: '#f0a0aa',
                  }}
                >
                  −{dels}
                </span>
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  lineHeight: 1.5,
                  color: '#71849f',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {s.operation}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
