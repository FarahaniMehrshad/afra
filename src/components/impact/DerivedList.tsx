import { useMemo, useState } from 'react';
import { COLORS, LLM_CATEGORY_UI } from '@/constants';
import type { DerivedChange } from '@/types/impact';
import type { Variant } from '@/types/journey';

const COLLAPSE_AT = 20;

interface Props {
  rows: DerivedChange[];
  onPathClick: (path: string, variant: Variant) => void;
}

export function DerivedList({ rows, onPathClick }: Props) {
  const byVariant = useMemo(() => {
    const map = new Map<Variant, DerivedChange[]>();
    for (const row of rows) {
      const list = map.get(row.variant);
      if (list) list.push(row);
      else map.set(row.variant, [row]);
    }
    return map;
  }, [rows]);
  const variants = useMemo(() => Array.from(byVariant.keys()), [byVariant]);

  if (!rows.length) {
    return (
      <span
        style={{
          fontSize: 11,
          color: '#5f7292',
          fontFamily: 'IBM Plex Mono, monospace',
        }}
      >
        derived at this step (0)
      </span>
    );
  }

  if (variants.length <= 1) {
    const variant = variants[0] ?? 'wpf';
    return (
      <VariantDerivedList
        variant={variant}
        title={null}
        rows={rows}
        onPathClick={onPathClick}
      />
    );
  }

  return (
    <div style={{ marginTop: 6, display: 'grid', gap: 8 }}>
      {variants
        .sort((a, b) => rankVariant(a) - rankVariant(b))
        .map((variant) => (
          <VariantDerivedList
            key={variant}
            variant={variant}
            title={variant + ' derived (' + (byVariant.get(variant)?.length ?? 0) + ')'}
            rows={byVariant.get(variant) ?? []}
            onPathClick={onPathClick}
          />
        ))}
    </div>
  );
}

function VariantDerivedList({
  variant,
  title,
  rows,
  onPathClick,
}: {
  variant: Variant;
  title: string | null;
  rows: DerivedChange[];
  onPathClick: (path: string, variant: Variant) => void;
}) {
  const [open, setOpen] = useState(rows.length < COLLAPSE_AT);
  const shown = useMemo(() => (open ? rows : []), [open, rows]);

  return (
    <div>
      <button
        className="afra-btn"
        onClick={() => setOpen((v) => !v)}
        style={{
          fontSize: 11,
          fontFamily: 'IBM Plex Mono, monospace',
          padding: '4px 8px',
          borderRadius: 7,
          border: '1px solid rgba(148,180,255,0.16)',
          background: 'rgba(148,180,255,0.08)',
          color: '#b7c8e4',
        }}
      >
        {title ? title + ' · ' : ''}
        {open ? 'hide' : '+' + rows.length}
      </button>

      {shown.length > 0 && (
        <div
          style={{
            marginTop: 6,
            display: 'grid',
            gap: 5,
          }}
        >
          {shown.map((row, idx) => (
            <DerivedRow
              key={row.path + idx}
              row={row}
              variant={variant}
              onPathClick={onPathClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DerivedRow({
  row,
  variant,
  onPathClick,
}: {
  row: DerivedChange;
  variant: Variant;
  onPathClick: (path: string, variant: Variant) => void;
}) {
  const kind = row.event.st;
  const col = kind === 'add' ? COLORS.add : kind === 'remove' ? COLORS.remove : COLORS.modify;
  const catUi = row.category === 'unclassified' ? null : LLM_CATEGORY_UI[row.category];
  return (
    <button
      className="afra-btn afra-row-outline"
      onClick={() => onPathClick(row.path, variant)}
      style={{
        textAlign: 'left',
        fontFamily: 'IBM Plex Mono, monospace',
        fontSize: 11,
        padding: '6px 8px',
        borderRadius: 8,
        border: '1px solid rgba(148,180,255,0.12)',
        background: 'rgba(148,180,255,0.04)',
        color: '#b9c9e3',
      }}
      title={row.path}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            fontSize: 10,
            lineHeight: '14px',
            padding: '0 5px',
            borderRadius: 5,
            background:
              kind === 'add'
                ? COLORS.addBg
                : kind === 'remove'
                  ? COLORS.removeBg
                  : COLORS.modifyBg,
            color: col,
          }}
        >
          {kind}
        </span>
        <span
          style={{
            fontSize: 10,
            lineHeight: '14px',
            padding: '0 5px',
            borderRadius: 5,
            background: catUi?.bg ?? 'rgba(148,180,255,0.10)',
            color: catUi?.color ?? '#8da2bf',
          }}
        >
          {catUi?.short ?? 'NA'}
        </span>
        <span style={{ color: '#89a0bf' }}>{changeText(row.event)}</span>
      </div>
      <div style={{ marginTop: 4, color: '#d1ddf2', wordBreak: 'break-all' }}>{row.path}</div>
    </button>
  );
}

function changeText(e: DerivedChange['event']): string {
  if (e.st === 'add') return '= ' + (e.to ?? 'null');
  if (e.st === 'remove') return '= ' + (e.from ?? 'null');
  return (e.from ?? 'null') + ' → ' + (e.to ?? 'null');
}

function rankVariant(v: Variant): number {
  return v === 'wpf' ? 0 : 1;
}
