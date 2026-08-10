import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLlmStore } from '@/store/llmStore';
import { download } from '@/services/download.util';
import { promptBytes } from '@/services/llm.prompt';
import type { LlmChunkTrace } from '@/types/llm';

/**
 * Full-screen inspector for the LLM pass. It renders the batches straight out
 * of the store, so what you read here is byte-for-byte what the proxy receives
 * — the point being that you can audit a prompt before spending tokens on it,
 * and read the unparsed reply afterwards when a batch misbehaves.
 */

type Tab = 'system' | 'user' | 'response' | 'entries';

interface Props {
  onClose: () => void;
}

export function LlmDebugPanel({ onClose }: Props) {
  const traces = useLlmStore((s) => s.traces);
  const payload = useLlmStore((s) => s.payload);

  const [selId, setSelId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('user');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sel = traces.find((t) => t.chunk.id === selId) ?? traces[0] ?? null;

  const totals = useMemo(() => {
    const bytes = traces.reduce((n, t) => n + promptBytes(t), 0);
    const paths = traces.reduce((n, t) => n + t.chunk.entries.length, 0);
    return { bytes, paths };
  }, [traces]);

  const body = sel ? textFor(sel, tab) : '';

  // Portalled to the body: `<main>` establishes its own stacking context and
  // sits below the header, so an overlay rendered inside it would be clipped
  // under the app chrome.
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        padding: '5vh 4vw',
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
            gap: 12,
            padding: '13px 16px',
            borderBottom: '1px solid rgba(148,180,255,0.08)',
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
              llm payload inspector
            </div>
            <div style={{ fontSize: 11.5, color: '#7f92b0', marginTop: 2 }}>
              {traces.length
                ? traces.length +
                  ' batch' +
                  (traces.length === 1 ? '' : 'es') +
                  ' · ' +
                  totals.paths +
                  ' changed paths · ' +
                  formatBytes(totals.bytes) +
                  ' of prompt'
                : 'nothing to send — no changed paths under the current noise setting'}
            </div>
          </div>
          <span style={{ flex: 1 }} />
          <button
            onClick={() => payload && download('afra-llm-payload.json', JSON.stringify(payload, null, 2))}
            disabled={!payload}
            className="afra-btn afra-btn-ghost"
            style={ghost}
          >
            download payload.json
          </button>
          <button
            onClick={() => sel && void navigator.clipboard.writeText(body)}
            disabled={!sel || !body}
            className="afra-btn afra-btn-ghost"
            style={ghost}
          >
            copy this tab
          </button>
          <button onClick={onClose} className="afra-btn afra-btn-ghost" style={ghost}>
            close
          </button>
        </header>

        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          <nav
            style={{
              flex: 'none',
              width: 250,
              overflow: 'auto',
              borderRight: '1px solid rgba(148,180,255,0.08)',
              padding: '8px 0',
            }}
          >
            {traces.map((t) => {
              const active = sel?.chunk.id === t.chunk.id;
              return (
                <button
                  key={t.chunk.id}
                  onClick={() => setSelId(t.chunk.id)}
                  className="afra-btn"
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 14px',
                    border: 'none',
                    borderLeft:
                      '2px solid ' + (active ? 'rgba(120,165,255,0.8)' : 'transparent'),
                    background: active ? 'rgba(79,141,253,0.14)' : 'transparent',
                    color: active ? '#e6eeff' : '#8195b3',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                      fontFamily: 'IBM Plex Mono, monospace',
                      fontSize: 11.5,
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        flex: 'none',
                        background: statusColor(t.status),
                        animation:
                          t.status === 'running'
                            ? 'afraPulse 1.1s ease-in-out infinite'
                            : undefined,
                      }}
                    />
                    {t.chunk.variant} {t.chunk.index}/{t.chunk.ofVariant}
                  </div>
                  <div
                    style={{
                      fontFamily: 'IBM Plex Mono, monospace',
                      fontSize: 10.5,
                      color: '#5f7292',
                      marginTop: 3,
                    }}
                  >
                    {t.chunk.entries.length} paths · {formatBytes(promptBytes(t))}
                    {t.ms !== null ? ' · ' + t.ms + 'ms' : ''}
                  </div>
                </button>
              );
            })}
          </nav>

          <section style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                flex: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '9px 14px',
                borderBottom: '1px solid rgba(148,180,255,0.08)',
              }}
            >
              {(['user', 'system', 'entries', 'response'] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className="afra-btn"
                  style={{
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: 11,
                    padding: '5px 10px',
                    borderRadius: 8,
                    border: 'none',
                    background: tab === t ? 'rgba(79,141,253,0.22)' : 'transparent',
                    color: tab === t ? '#e9f0ff' : '#8195b3',
                  }}
                >
                  {t}
                </button>
              ))}
              <span style={{ flex: 1 }} />
              {sel?.error && (
                <span
                  className="afra-ellipsis"
                  title={sel.error}
                  style={{
                    maxWidth: 420,
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: 10.5,
                    color: '#f0a0aa',
                  }}
                >
                  {sel.error}
                </span>
              )}
            </div>

            <pre
              style={{
                flex: 1,
                margin: 0,
                overflow: 'auto',
                padding: '14px 16px 30px',
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: 11.5,
                lineHeight: 1.65,
                color: body ? '#c8d6ec' : '#5f7292',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {body || emptyNote(tab)}
            </pre>
          </section>
        </div>
      </div>
    </div>,
    document.body,
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

function textFor(t: LlmChunkTrace, tab: Tab): string {
  if (tab === 'system') return t.system;
  if (tab === 'user') return t.user;
  if (tab === 'entries') return JSON.stringify(t.chunk.entries, null, 2);
  return t.response ?? '';
}

function emptyNote(tab: Tab): string {
  return tab === 'response'
    ? 'No reply yet — run the analysis to see the raw model output for this batch.'
    : 'Nothing here.';
}

function statusColor(s: LlmChunkTrace['status']): string {
  if (s === 'ok') return '#7ee0b0';
  if (s === 'error') return '#f0a0aa';
  if (s === 'running') return '#e8c67d';
  return '#4c5c78';
}

function formatBytes(n: number): string {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(2) + ' MB';
}
