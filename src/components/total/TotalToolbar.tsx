import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { Segmented } from '../ui/Segmented';
import { Toggle } from '../ui/Toggle';
import { IconButton } from '../ui/IconButton';
import { LlmControls } from './LlmControls';
import type { EventKind } from '@/types/ir';
import type { Variant } from '@/types/journey';
import { COLORS } from '@/constants';

interface Props {
  changeLabel: string;
  countLabel: string;
  onJump: (dir: 1 | -1) => void;
}

const TYPE_OPTIONS: {
  value: EventKind;
  label: string;
  color: string;
  title: string;
}[] = [
  { value: 'add', label: 'add', color: COLORS.add, title: 'only lines added in some step' },
  {
    value: 'modify',
    label: 'mod',
    color: COLORS.modify,
    title: 'only lines modified in some step',
  },
  {
    value: 'remove',
    label: 'rem',
    color: COLORS.remove,
    title: 'only lines removed in some step',
  },
];

const COUNT_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'any' },
  { value: 1, label: '≥1' },
  { value: 2, label: '≥2' },
  { value: 3, label: '≥3' },
  { value: 5, label: '≥5' },
];

/** Toolbar for the merged / total view. */
export function TotalToolbar({ changeLabel, countLabel, onJump }: Props) {
  const [stepMenuOpen, setStepMenuOpen] = useState(false);
  const stepMenuRef = useRef<HTMLDivElement>(null);
  const bundle = useAppStore((s) => s.bundle);
  const variant = useAppStore((s) => s.variant);
  const setVariant = useAppStore((s) => s.setVariant);
  const onlyChanged = useAppStore((s) => s.onlyChanged);
  const toggleChanged = useAppStore((s) => s.toggleChanged);
  const typeFilters = useAppStore((s) => s.typeFilters);
  const toggleType = useAppStore((s) => s.toggleType);
  const minCount = useAppStore((s) => s.minCount);
  const setMinCount = useAppStore((s) => s.setMinCount);
  const totalStepFilters = useAppStore((s) => s.totalStepFilters);
  const toggleTotalStepFilter = useAppStore((s) => s.toggleTotalStepFilter);
  const clearTotalStepFilters = useAppStore((s) => s.clearTotalStepFilters);
  const totalQuery = useAppStore((s) => s.totalQuery);
  const setTotalQuery = useAppStore((s) => s.setTotalQuery);
  const stepOptions = useMemo(
    () => (bundle ? bundle.steps.map((step, i) => ({ step, i })).filter((x) => x.i > 0) : []),
    [bundle],
  );
  const stepLabel = useMemo(() => {
    if (!bundle || totalStepFilters.length === 0) return 'all steps';
    const labels = totalStepFilters
      .map((idx) => bundle.steps[idx])
      .filter(Boolean)
      .map((step) => String(step.ordinal).padStart(2, '0'));
    if (labels.length <= 2) return labels.join(', ');
    return labels.slice(0, 2).join(', ') + ' +' + (labels.length - 2);
  }, [bundle, totalStepFilters]);

  useEffect(() => {
    if (!stepMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!stepMenuRef.current?.contains(event.target as Node)) setStepMenuOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setStepMenuOpen(false);
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onEscape);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onEscape);
    };
  }, [stepMenuOpen]);

  return (
    <div
      style={{
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '11px 16px',
        borderBottom: '1px solid rgba(148,180,255,0.08)',
        background: 'rgba(14,20,34,0.4)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        flexWrap: 'wrap',
      }}
    >
      <div>
        <div
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 13,
            color: '#e6eeff',
          }}
        >
          merged configuration
        </div>
        <div style={{ fontSize: 11.5, color: '#7f92b0', marginTop: 2 }}>
          union of every step — nothing dropped once it appeared
        </div>
      </div>
      <span style={{ flex: 1 }} />

      <LlmControls />

      <Segmented<Variant>
        options={[
          { value: 'wpf', label: 'wpf' },
          { value: 'exe', label: 'exe' },
        ]}
        isActive={(v) => v === variant}
        onSelect={setVariant}
      />

      <Toggle active={onlyChanged} onClick={toggleChanged}>
        changed only
      </Toggle>

      <Segmented<EventKind>
        options={TYPE_OPTIONS}
        // A type filter is *active* when it's included in the filter set.
        isActive={(v) => typeFilters.includes(v)}
        onSelect={toggleType}
        small
      />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          padding: '3px 3px 3px 9px',
          borderRadius: 10,
          background: 'rgba(148,180,255,0.05)',
          border: '1px solid rgba(148,180,255,0.09)',
        }}
      >
        <span
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 10.5,
            color: '#5f7292',
          }}
        >
          steps
        </span>
        {COUNT_OPTIONS.map((c) => {
          const active = minCount === c.value;
          return (
            <button
              key={c.value}
              onClick={() => setMinCount(c.value)}
              className="afra-btn"
              style={{
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: 11,
                padding: '5px 9px',
                borderRadius: 8,
                border: 'none',
                background: active ? 'rgba(79,141,253,0.24)' : 'transparent',
                color: active ? '#e9f0ff' : '#8195b3',
              }}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '3px 3px 3px 9px',
          borderRadius: 10,
          background: 'rgba(148,180,255,0.05)',
          border: '1px solid rgba(148,180,255,0.09)',
          position: 'relative',
        }}
        ref={stepMenuRef}
      >
        <span
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 10.5,
            color: '#5f7292',
          }}
        >
          by step
        </span>
        <button
          onClick={() => setStepMenuOpen((v) => !v)}
          className="afra-btn"
          title="Select steps to include in Total diff"
          aria-haspopup="menu"
          aria-expanded={stepMenuOpen}
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 11,
            padding: '5px 10px',
            borderRadius: 8,
            border: 'none',
            background: stepMenuOpen ? 'rgba(79,141,253,0.24)' : 'transparent',
            color: stepMenuOpen ? '#e9f0ff' : '#9ab0ce',
            flex: 'none',
          }}
        >
          {stepLabel} ▾
        </button>
        {stepMenuOpen && (
          <div
            role="menu"
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              left: 0,
              zIndex: 30,
              width: 320,
              maxHeight: 280,
              overflow: 'auto',
              borderRadius: 12,
              border: '1px solid rgba(120,165,255,0.25)',
              background: 'rgba(10,16,28,0.96)',
              boxShadow: '0 14px 34px rgba(4,8,16,0.55)',
              padding: 8,
              display: 'flex',
              flexDirection: 'column',
              gap: 5,
            }}
          >
            <button
              onClick={clearTotalStepFilters}
              className="afra-btn afra-row-hover"
              style={{
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: 11,
                padding: '7px 9px',
                borderRadius: 8,
                border: 'none',
                textAlign: 'left',
                background:
                  totalStepFilters.length === 0 ? 'rgba(79,141,253,0.20)' : 'transparent',
                color: totalStepFilters.length === 0 ? '#dce9ff' : '#a4b8d5',
              }}
            >
              all steps
            </button>
            {stepOptions.map(({ step, i }) => {
              const active = totalStepFilters.includes(i);
              return (
                <label
                  key={i}
                  className="afra-row-hover"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '16px 28px 1fr',
                    alignItems: 'center',
                    gap: 8,
                    padding: '7px 9px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: active ? 'rgba(79,141,253,0.16)' : 'transparent',
                  }}
                  title={step.operation}
                >
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => toggleTotalStepFilter(i)}
                  />
                  <span
                    style={{
                      fontFamily: 'IBM Plex Mono, monospace',
                      fontSize: 10.5,
                      color: active ? '#dce9ff' : '#8fa5c5',
                    }}
                  >
                    {String(step.ordinal).padStart(2, '0')}
                  </span>
                  <span
                    className="afra-ellipsis"
                    style={{
                      fontSize: 11.5,
                      color: active ? '#dce9ff' : '#a4b8d5',
                    }}
                  >
                    {step.label}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <IconButton onClick={() => onJump(-1)} title="previous changed line">
          ↑
        </IconButton>
        <IconButton onClick={() => onJump(1)} title="next changed line">
          ↓
        </IconButton>
        <span
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 10.5,
            color: '#5f7292',
          }}
        >
          {changeLabel}
        </span>
      </div>

      <input
        value={totalQuery}
        onChange={(e) => setTotalQuery(e.target.value)}
        placeholder="Search keys or values…"
        className="afra-input"
        style={{
          width: 210,
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: 11.5,
          padding: '6px 10px',
          borderRadius: 9,
          border: '1px solid rgba(148,180,255,0.12)',
          background: 'rgba(148,180,255,0.05)',
          color: '#dbe4f2',
          outline: 'none',
        }}
      />
      <span
        style={{
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: 11,
          color: '#6d7f9c',
        }}
      >
        {countLabel}
      </span>
    </div>
  );
}
