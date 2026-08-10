import type { DiffRow } from '@/types/diff';
import { COLORS, ROW_HEIGHT } from '@/constants';

interface InlineRow {
  k: 'add' | 'del' | '=' | 'fold';
  a?: string | null;
  an?: number | null;
  bn?: number | null;
  segs: { t: string; bg: string }[];
  noise?: boolean;
  text?: string;
}

interface Props {
  rows: DiffRow[];
  hideNoise: boolean;
  wrap: boolean;
}

/** Flatten split rows into an "add-below-del" listing. */
export function toInline(rows: DiffRow[]): InlineRow[] {
  const out: InlineRow[] = [];
  for (const r of rows) {
    if (r.k === 'fold') {
      out.push({ k: 'fold', segs: [], text: '⋯ ' + r.count + ' unchanged lines' });
      continue;
    }
    if (r.k === '=') {
      out.push({
        k: '=',
        a: r.a,
        an: r.an,
        bn: r.bn,
        segs: [{ t: r.a ?? '', bg: 'transparent' }],
      });
      continue;
    }
    if (r.a != null) {
      out.push({
        k: 'del',
        an: r.an,
        segs: r.lsegs ?? [{ t: r.a, bg: 'transparent' }],
        noise: r.noise,
      });
    }
    if (r.b != null) {
      out.push({
        k: 'add',
        bn: r.bn,
        segs: r.rsegs ?? [{ t: r.b, bg: 'transparent' }],
        noise: r.noise,
      });
    }
  }
  return out;
}

function bg(k: InlineRow['k'], noise: boolean, hideNoise: boolean) {
  if (k === 'fold') return 'rgba(148,180,255,0.035)';
  if (hideNoise && noise) return 'rgba(148,180,255,0.04)';
  if (k === 'add') return COLORS.addBg;
  if (k === 'del') return COLORS.removeBg;
  return 'transparent';
}

function fg(k: InlineRow['k'], noise: boolean, hideNoise: boolean) {
  if (k === 'fold') return '#5f7292';
  if (hideNoise && noise) return '#6f809c';
  if (k === 'add') return '#a8dfc4';
  if (k === 'del') return '#e5b3ba';
  return '#93a5c2';
}

export function InlineDiff({ rows, hideNoise, wrap }: Props) {
  const inline = toInline(rows);
  const ws = wrap ? 'pre-wrap' : 'pre';

  return (
    <div style={{ width: '100%' }}>
      {inline.map((r, i) => {
        const sign = r.k === 'add' ? '+ ' : r.k === 'del' ? '− ' : '  ';
        const signColor =
          r.k === 'add' ? '#7ee0b0' : r.k === 'del' ? '#f0a0aa' : 'transparent';
        return (
          <div
            key={i}
            className="afra-row-outline"
            style={{
              display: 'grid',
              gridTemplateColumns: '52px 52px minmax(0,1fr)',
              minHeight: ROW_HEIGHT,
              background: bg(r.k, r.noise ?? false, hideNoise),
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
              {r.an ?? ''}
            </div>
            <div
              style={{
                textAlign: 'right',
                paddingRight: 9,
                color: '#4c5c78',
                userSelect: 'none',
              }}
            >
              {r.bn ?? ''}
            </div>
            <div
              style={{
                padding: '0 10px',
                color: fg(r.k, r.noise ?? false, hideNoise),
                whiteSpace: ws,
                wordBreak: 'break-all',
                overflow: 'hidden',
              }}
            >
              <span style={{ color: signColor }}>{sign}</span>
              {r.segs.map((s, j) => (
                <span key={j} style={{ background: s.bg, borderRadius: 2 }}>
                  {s.t}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
