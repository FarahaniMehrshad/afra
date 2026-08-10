import type { DiffRow } from '@/types/diff';
import { COLORS, ROW_HEIGHT } from '@/constants';

interface Props {
  rows: DiffRow[];
  hideNoise: boolean;
  wrap: boolean;
  prevFileLabel: string;
  curFileLabel: string;
}

const muted = (r: DiffRow, hideNoise: boolean) => hideNoise && r.noise;

function bgFor(kind: DiffRow['k'], row: DiffRow, hideNoise: boolean): string {
  if (kind === 'fold') return 'rgba(148,180,255,0.035)';
  if (muted(row, hideNoise)) return 'rgba(148,180,255,0.04)';
  if (kind === 'add') return COLORS.addBg;
  if (kind === 'del') return COLORS.removeBg;
  if (kind === 'mod') return COLORS.modifyBg;
  return 'transparent';
}

/** Side-by-side JSON diff viewer. */
export function SplitDiff({ rows, hideNoise, wrap, prevFileLabel, curFileLabel }: Props) {
  const ws = wrap ? 'pre-wrap' : 'pre';

  return (
    <div style={{ width: '100%' }}>
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 2,
          display: 'grid',
          gridTemplateColumns: '52px minmax(0,1fr) 52px minmax(0,1fr)',
          background: 'rgba(11,17,29,0.92)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          borderBottom: '1px solid rgba(148,180,255,0.1)',
        }}
      >
        <div />
        <div
          style={{
            padding: '6px 10px',
            fontSize: 10.5,
            color: '#6d7f9c',
            letterSpacing: '0.06em',
            whiteSpace: 'nowrap',
          }}
        >
          {prevFileLabel}
        </div>
        <div style={{ borderLeft: '1px solid rgba(148,180,255,0.07)' }} />
        <div
          style={{
            padding: '6px 10px',
            fontSize: 10.5,
            color: '#8fb3ee',
            letterSpacing: '0.06em',
            whiteSpace: 'nowrap',
          }}
        >
          {curFileLabel}
        </div>
      </div>

      {rows.map((r, i) => {
        const lk = r.k === 'add' ? '=' : r.k === 'mod' ? 'del' : r.k;
        const rk = r.k === 'del' ? '=' : r.k === 'mod' ? 'add' : r.k;
        return (
          <div
            key={i}
            className="afra-row-outline"
            style={{
              display: 'grid',
              gridTemplateColumns: '52px minmax(0,1fr) 52px minmax(0,1fr)',
              minHeight: ROW_HEIGHT,
            }}
          >
            <div
              style={{
                textAlign: 'right',
                paddingRight: 9,
                color: '#4c5c78',
                background: r.k === '=' ? 'transparent' : bgFor(lk, r, hideNoise),
                userSelect: 'none',
              }}
            >
              {r.an ?? ''}
            </div>
            <div
              style={{
                padding: '0 10px',
                background:
                  r.a === null || r.a === undefined
                    ? 'rgba(148,180,255,0.02)'
                    : bgFor(r.k === 'add' ? '=' : r.k === 'mod' ? 'del' : r.k, r, hideNoise),
                color: muted(r, hideNoise)
                  ? '#6f809c'
                  : r.k === '='
                    ? '#93a5c2'
                    : '#e5b3ba',
                whiteSpace: ws,
                wordBreak: 'break-all',
                overflow: 'hidden',
              }}
            >
              {(r.lsegs ?? (r.a != null ? [{ t: r.a, bg: 'transparent' }] : [])).map(
                (s, j) => (
                  <span key={j} style={{ background: s.bg, borderRadius: 2 }}>
                    {s.t}
                  </span>
                ),
              )}
            </div>
            <div
              style={{
                textAlign: 'right',
                paddingRight: 9,
                color: '#4c5c78',
                background: r.k === '=' ? 'transparent' : bgFor(rk, r, hideNoise),
                userSelect: 'none',
                borderLeft: '1px solid rgba(148,180,255,0.07)',
              }}
            >
              {r.bn ?? ''}
            </div>
            <div
              style={{
                padding: '0 10px',
                background:
                  r.b === null || r.b === undefined
                    ? 'rgba(148,180,255,0.02)'
                    : bgFor(r.k === 'del' ? '=' : r.k === 'mod' ? 'add' : r.k, r, hideNoise),
                color: muted(r, hideNoise)
                  ? '#6f809c'
                  : r.k === '='
                    ? '#93a5c2'
                    : '#a8dfc4',
                whiteSpace: ws,
                wordBreak: 'break-all',
                overflow: 'hidden',
              }}
            >
              {(r.rsegs ?? (r.b != null ? [{ t: r.b, bg: 'transparent' }] : [])).map(
                (s, j) => (
                  <span key={j} style={{ background: s.bg, borderRadius: 2 }}>
                    {s.t}
                  </span>
                ),
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
