import type { CompactionReport, DuplicateGroup } from '@/types/schema';
import type { Variant } from '@/types/journey';

interface Props {
  reports: Record<Variant, CompactionReport>;
  onClose: () => void;
  onSelectCanon: (canon: string) => void;
}

const VARIANTS: Variant[] = ['wpf', 'exe'];

/**
 * Right-rail panel that surfaces the compaction pass's decisions for both
 * variants — one section per variant, since each pane is rendered from a
 * different raw JSON and thus has its own aliases and structural savings.
 */
export function CompactionPanel({ reports, onClose, onSelectCanon }: Props) {
  const totalSavings = VARIANTS.reduce((s, v) => s + savingsFor(reports[v]), 0);

  return (
    <aside
      style={{
        flex: 'none',
        width: 400,
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
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: 10.5,
              letterSpacing: '0.12em',
              color: '#5f7292',
              marginBottom: 4,
            }}
          >
            COMPACTION
          </div>
          <div
            style={{
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: 11.5,
              color: '#b6c6e0',
            }}
          >
            {totalSavings} lines saved · wpf + exe
          </div>
        </div>
        <button
          onClick={onClose}
          className="afra-btn"
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 11,
            padding: '4px 9px',
            borderRadius: 7,
            border: '1px solid rgba(148,180,255,0.14)',
            background: 'transparent',
            color: '#7f92b0',
          }}
        >
          close
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '12px 14px 30px' }}>
        {VARIANTS.map((v) => (
          <VariantBlock
            key={v}
            variant={v}
            report={reports[v]}
            onSelectCanon={onSelectCanon}
          />
        ))}
      </div>
    </aside>
  );
}

function VariantBlock({
  variant,
  report,
  onSelectCanon,
}: {
  variant: Variant;
  report: CompactionReport;
  onSelectCanon: (canon: string) => void;
}) {
  const c = VARIANT_TAG[variant];
  const savings = savingsFor(report);

  return (
    <div style={{ marginBottom: 22 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 10,
        }}
      >
        <span
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 10.5,
            letterSpacing: '0.1em',
            padding: '3px 9px',
            borderRadius: 6,
            background: c.bg,
            color: c.fg,
          }}
        >
          {variant}
        </span>
        <span
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 10.5,
            color: '#7f92b0',
          }}
        >
          {savings} line{savings === 1 ? '' : 's'} saved
        </span>
      </div>

      <Section title="STRUCTURAL COLLAPSE">
        <Stat
          label="$values wrappers unwrapped"
          n={report.collapsedValues}
          hint="{ $values: [...] } → [...]"
        />
        <Stat
          label="$type / $value pairs unwrapped"
          n={report.collapsedTypeWrappers}
          hint='{ $type: "…", $value: X } → X'
        />
        <Stat
          label="$type / $id / $ref leaves dropped"
          n={report.strippedMetaLeaves}
          hint="Framework metadata siblings"
        />
      </Section>

      <Section title={`DUPLICATE SUBTREES (${report.duplicates.length})`}>
        {report.duplicates.length === 0 ? (
          <div
            style={{
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: 11.5,
              color: '#5f7292',
              lineHeight: 1.6,
            }}
          >
            No repeated subtrees worth aliasing at the current thresholds.
          </div>
        ) : (
          report.duplicates.map((d) => (
            <DuplicateCard
              key={d.anchor}
              group={d}
              onSelectCanon={onSelectCanon}
            />
          ))
        )}
      </Section>
    </div>
  );
}

function DuplicateCard({
  group,
  onSelectCanon,
}: {
  group: DuplicateGroup;
  onSelectCanon: (canon: string) => void;
}) {
  return (
    <div
      style={{
        marginBottom: 10,
        borderRadius: 12,
        border: '1px solid rgba(120,165,255,0.20)',
        background: 'rgba(79,141,253,0.06)',
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
            fontSize: 11,
            padding: '2px 8px',
            borderRadius: 6,
            background: 'rgba(120,165,255,0.20)',
            color: '#cfe0ff',
          }}
        >
          &amp;{group.anchor}
        </span>
        <span
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 10.5,
            color: '#7f92b0',
          }}
        >
          ×{group.count} · {group.leafCount} leaves
        </span>
      </div>
      <div
        style={{
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: 11.5,
          color: '#cfdcf0',
          marginBottom: 6,
          wordBreak: 'break-word',
        }}
      >
        {group.preview}
      </div>
      <details style={{ marginTop: 4 }}>
        <summary
          style={{
            cursor: 'pointer',
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 10.5,
            color: '#7f92b0',
            userSelect: 'none',
          }}
        >
          occurrences
        </summary>
        <div
          style={{
            marginTop: 6,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          {group.keyPaths.map((p, i) => (
            <button
              key={i}
              onClick={() => onSelectCanon(group.canons[i])}
              className="afra-btn"
              title="Jump to this occurrence in the YAML pane"
              style={{
                textAlign: 'left',
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: 10.5,
                padding: '4px 8px',
                borderRadius: 6,
                border: '1px solid rgba(148,180,255,0.10)',
                background: 'transparent',
                color: i === 0 ? '#8fb3ee' : '#93a5c2',
                wordBreak: 'break-word',
              }}
            >
              {i === 0 ? '⚓ ' : '↳ '}
              {p || '/'}
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: 10.5,
          letterSpacing: '0.12em',
          color: '#5f7292',
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, n, hint }: { label: string; n: number; hint: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 10px',
        marginBottom: 4,
        borderRadius: 8,
        background: 'rgba(148,180,255,0.04)',
      }}
    >
      <span
        style={{
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: 12,
          minWidth: 36,
          color: n > 0 ? '#7ee0b0' : '#5f7292',
          fontWeight: 500,
        }}
      >
        {n}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: '#cfdcf0' }}>{label}</div>
        <div
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 10.5,
            color: '#7f92b0',
            marginTop: 1,
          }}
          title={hint}
        >
          {hint}
        </div>
      </div>
    </div>
  );
}

function savingsFor(r: CompactionReport): number {
  return (
    r.collapsedValues +
    r.collapsedTypeWrappers +
    r.strippedMetaLeaves +
    r.duplicates.reduce((s, d) => s + (d.count - 1), 0)
  );
}

const VARIANT_TAG: Record<Variant, { bg: string; fg: string }> = {
  wpf: { bg: 'rgba(79,141,253,0.18)', fg: '#9cc0ff' },
  exe: { bg: 'rgba(52,170,120,0.16)', fg: '#7ee0b0' },
};
