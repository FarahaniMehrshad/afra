import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '@/store/appStore';
import { getBuild } from '@/hooks/useBuild';
import { download } from '@/services/download.util';
import { runConverter } from '@/services/converter.runtime';
import { Segmented } from '../ui/Segmented';
import type { Variant } from '@/types/journey';

interface Props {
  /** The freshly generated source, used until the user edits it. */
  generated: string;
  onClose: () => void;
}

/**
 * The converter, as editable code, running against a real configuration.
 *
 * The output pane is the code's actual return value, so an edit is visible
 * immediately — which makes the field list at the top of the source something
 * you can experiment with rather than just read.
 */
export function ConverterPanel({ generated, onClose }: Props) {
  const bundle = useAppStore((s) => s.bundle);
  const edited = useAppStore((s) => s.converterCode);
  const setCode = useAppStore((s) => s.setConverterCode);
  const yamlMode = useAppStore((s) => s.yamlMode);

  const [variant, setVariant] = useState<Variant>('wpf');
  const [stepIdx, setStepIdx] = useState<number>(-1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const code = edited ?? generated;

  const docs = useMemo(
    () => (bundle ? getBuild(bundle, variant).docs : []),
    [bundle, variant],
  );

  // Default to the last step that actually parsed — the fullest configuration.
  const lastGood = docs.reduce((best, d, i) => (d.obj ? i : best), -1);
  const activeIdx = stepIdx >= 0 && docs[stepIdx]?.obj ? stepIdx : lastGood;
  const input = activeIdx >= 0 ? docs[activeIdx].obj : null;

  const result = useMemo(
    () => runConverter(code, input, { emptyArrays: yamlMode === 'empty' }),
    [code, input, yamlMode],
  );

  const inputJson = input ? JSON.stringify(input, null, 2) : '';

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        padding: '4vh 3vw',
        background: 'rgba(5,8,14,0.72)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        animation: 'afraFade 0.16s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 16,
          border: '1px solid rgba(148,180,255,0.14)',
          background: '#0b1120',
          boxShadow: '0 24px 80px rgba(0,0,0,0.55)',
          overflow: 'hidden',
        }}
      >
        <header
          style={{
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '13px 16px',
            borderBottom: '1px solid rgba(148,180,255,0.08)',
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
              converter.js
              {edited !== null && (
                <span style={{ color: '#e8c67d', marginLeft: 8, fontSize: 11 }}>
                  edited
                </span>
              )}
            </div>
            <div style={{ fontSize: 11.5, color: '#7f92b0', marginTop: 2 }}>
              runs as you type · keeps every array element, unlike the collapsed
              document on the page
            </div>
          </div>
          <span style={{ flex: 1 }} />

          <button
            onClick={() => setCode(null)}
            disabled={edited === null}
            className="afra-btn afra-btn-ghost"
            title="Throw away your edits and go back to the generated code"
            style={ghost}
          >
            reset
          </button>
          <button
            onClick={() => void navigator.clipboard.writeText(code)}
            className="afra-btn afra-btn-ghost"
            style={ghost}
          >
            copy
          </button>
          <button
            onClick={() => download('afra-converter.js', code, 'text/javascript')}
            className="afra-btn afra-btn-ghost"
            style={ghost}
          >
            download .js
          </button>
          <button onClick={onClose} className="afra-btn afra-btn-ghost" style={ghost}>
            close
          </button>
        </header>

        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          <section
            style={{
              flex: 1.35,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              borderRight: '1px solid rgba(148,180,255,0.08)',
            }}
          >
            <PaneLabel>source</PaneLabel>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              spellCheck={false}
              wrap="off"
              style={{
                flex: 1,
                minHeight: 0,
                resize: 'none',
                border: 'none',
                outline: 'none',
                padding: '12px 16px 24px',
                background: 'transparent',
                color: '#c8d6ec',
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: 11.5,
                lineHeight: 1.65,
                tabSize: 2,
              }}
            />
          </section>

          <section style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                flex: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '8px 14px',
                borderBottom: '1px solid rgba(148,180,255,0.08)',
                flexWrap: 'wrap',
              }}
            >
              <span
                style={{
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontSize: 10.5,
                  letterSpacing: '0.1em',
                  color: '#5f7292',
                }}
              >
                INPUT
              </span>
              <Segmented<Variant>
                options={[
                  { value: 'wpf', label: 'wpf' },
                  { value: 'exe', label: 'exe' },
                ]}
                isActive={(v) => v === variant}
                onSelect={setVariant}
                small
              />
              <select
                value={activeIdx}
                onChange={(e) => setStepIdx(Number(e.target.value))}
                style={{
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontSize: 11,
                  padding: '5px 8px',
                  borderRadius: 8,
                  border: '1px solid rgba(148,180,255,0.14)',
                  background: 'rgba(148,180,255,0.05)',
                  color: '#a9bcd8',
                }}
              >
                {docs.map((d, i) =>
                  d.obj ? (
                    <option key={i} value={i} style={{ background: '#0b1120' }}>
                      {d.file ?? 'step ' + (i + 1)}
                    </option>
                  ) : null,
                )}
              </select>
              <span
                style={{
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontSize: 10.5,
                  color: '#5f7292',
                }}
              >
                {formatBytes(inputJson.length)} of JSON
              </span>
            </div>

            <PaneLabel>output</PaneLabel>
            <pre
              style={{
                flex: 1,
                margin: 0,
                overflow: 'auto',
                padding: '12px 16px 24px',
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: 11.5,
                lineHeight: 1.65,
                color: result.error ? '#f0a0aa' : '#c8d6ec',
                whiteSpace: 'pre',
              }}
            >
              {result.error ?? (result.yaml || 'convert() returned an empty document.')}
            </pre>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function PaneLabel({ children }: { children: string }) {
  return (
    <div
      style={{
        flex: 'none',
        padding: '7px 16px',
        borderBottom: '1px solid rgba(148,180,255,0.06)',
        fontFamily: 'IBM Plex Mono, monospace',
        fontSize: 10.5,
        letterSpacing: '0.1em',
        color: '#5f7292',
      }}
    >
      {children.toUpperCase()}
    </div>
  );
}

const ghost = {
  fontFamily: 'IBM Plex Mono, monospace',
  fontSize: 11,
  padding: '6px 11px',
  borderRadius: 9,
  border: '1px solid rgba(148,180,255,0.14)',
  background: 'rgba(148,180,255,0.05)',
  color: '#a9bcd8',
} as const;

function formatBytes(n: number): string {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(2) + ' MB';
}
