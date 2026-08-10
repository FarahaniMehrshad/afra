import { COLORS, LLM_CATEGORY_UI } from '@/constants';
import { useAppStore } from '@/store/appStore';
import { useLlmStore, verdictKey } from '@/store/llmStore';
import { getBuild } from '@/hooks/useBuild';
import type { EventKind, HistoryEvent } from '@/types/ir';
import type { JourneyBundle, Variant } from '@/types/journey';
import type { LlmVerdict } from '@/types/llm';
import type { CanonEntry, SchemaSource } from '@/types/schema';

interface Props {
  entry: CanonEntry | null;
  canon: string | null;
}

const VARIANTS: Variant[] = ['wpf', 'exe'];

/**
 * Right rail — expands the selected YAML line back into the real wpf and exe
 * paths it was collapsed from, with the reason the LLM attributed each one to
 * a UI operation and the steps that actually changed it.
 */
export function MappingPanel({ entry, canon }: Props) {
  const bundle = useAppStore((s) => s.bundle);
  const hideNoise = useAppStore((s) => s.hideNoise);
  const verdicts = useLlmStore((s) => s.verdicts);

  if (!bundle) return null;

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
        }}
      >
        <div
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 10.5,
            letterSpacing: '0.12em',
            color: '#5f7292',
            marginBottom: 6,
          }}
        >
          SOURCE MAPPING
        </div>
        <div
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 11.5,
            color: '#b6c6e0',
            lineHeight: 1.6,
            wordBreak: 'break-all',
          }}
        >
          {formatCanon(canon)}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '12px 14px 30px' }}>
        {!entry ? (
          <div
            style={{
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: 11.5,
              color: '#5f7292',
              lineHeight: 1.7,
            }}
          >
            Click any line to see which wpf and exe fields it came from.
          </div>
        ) : (
          VARIANTS.map((variant) => {
            const sources = entry.sources.filter((s) => s.variant === variant);
            if (!sources.length) return null;
            return (
              <section key={variant} style={{ marginBottom: 14 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 7,
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'IBM Plex Mono, monospace',
                      fontSize: 10,
                      letterSpacing: '0.1em',
                      padding: '2px 8px',
                      borderRadius: 6,
                      background: 'rgba(79,141,253,0.16)',
                      color: '#9cc0ff',
                    }}
                  >
                    {variant}
                  </span>
                  <span
                    style={{
                      fontFamily: 'IBM Plex Mono, monospace',
                      fontSize: 10.5,
                      color: '#5f7292',
                    }}
                  >
                    {sources.length} path{sources.length === 1 ? '' : 's'}
                  </span>
                </div>

                {sources.map((s) => (
                  <SourceCard
                    key={s.path}
                    source={s}
                    bundle={bundle}
                    verdict={verdicts.get(verdictKey(variant, s.path))}
                    hideNoise={hideNoise}
                  />
                ))}
              </section>
            );
          })
        )}
      </div>
    </aside>
  );
}

interface SourceCardProps {
  source: SchemaSource;
  bundle: JourneyBundle;
  verdict: LlmVerdict | undefined;
  hideNoise: boolean;
}

function SourceCard({ source, bundle, verdict, hideNoise }: SourceCardProps) {
  const events = (getBuild(bundle, source.variant).hist.get(source.path) ?? []).filter(
    (e) => !(hideNoise && e.noise),
  );

  return (
    <div
      style={{
        marginBottom: 8,
        borderRadius: 12,
        border:
          '1px solid ' +
          (source.selected ? 'rgba(52,170,120,0.26)' : 'rgba(148,180,255,0.10)'),
        background: 'rgba(148,180,255,0.035)',
        padding: '9px 11px',
      }}
    >
      <div
        style={{
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: 11,
          color: '#cfdcf0',
          lineHeight: 1.5,
          wordBreak: 'break-all',
        }}
      >
        {source.path || '/'}
      </div>

      {source.value !== undefined && (
        <div
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 11,
            color: '#7ee0b0',
            marginTop: 4,
            wordBreak: 'break-all',
          }}
        >
          {JSON.stringify(source.value)}
        </div>
      )}

      {verdict && (
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 7,
            marginTop: 7,
            fontSize: 11.5,
            color: '#8ea3c2',
            lineHeight: 1.5,
          }}
        >
          <span
            style={{
              flex: 'none',
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: 9.5,
              padding: '1px 6px',
              borderRadius: 5,
              background: LLM_CATEGORY_UI[verdict.category].bg,
              color: LLM_CATEGORY_UI[verdict.category].color,
            }}
          >
            {LLM_CATEGORY_UI[verdict.category].short}
          </span>
          <span>{verdict.reason || LLM_CATEGORY_UI[verdict.category].blurb}</span>
        </div>
      )}

      {events.map((e, i) => (
        <StepCard key={i} event={e} bundle={bundle} />
      ))}
    </div>
  );
}

function StepCard({ event, bundle }: { event: HistoryEvent; bundle: JourneyBundle }) {
  const step = bundle.steps[event.i];
  const c = colorsFor(event.st);

  return (
    <div
      style={{
        marginTop: 7,
        borderRadius: 9,
        border: '1px solid ' + c.bd,
        background: c.bg,
        padding: '7px 9px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 10,
            color: '#6d7f9c',
          }}
        >
          step {String(step?.ordinal ?? event.i + 1).padStart(2, '0')}
        </span>
        <span
          className="afra-ellipsis"
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 11,
            color: '#cfdcf0',
          }}
        >
          {step?.label}
        </span>
        <span style={{ flex: 1 }} />
        <span
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 9.5,
            color: c.fg,
          }}
        >
          {event.st}
        </span>
      </div>

      {step?.operation && (
        <div style={{ fontSize: 11, color: '#7f92b0', lineHeight: 1.45, marginTop: 4 }}>
          {step.operation}
        </div>
      )}

      <div
        style={{
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: 10.5,
          lineHeight: 1.5,
          marginTop: 4,
          wordBreak: 'break-all',
        }}
      >
        <span style={{ color: '#f0a0aa' }}>{event.from ?? ''}</span>
        <span style={{ color: '#5f7292' }}>
          {event.from != null && event.to != null ? '  →  ' : ''}
        </span>
        <span style={{ color: '#7ee0b0' }}>{event.to ?? ''}</span>
      </div>
    </div>
  );
}

function formatCanon(c: string | null): string {
  if (c === null) return '—';
  if (c === '') return '/ (document root)';
  return c.replace(/^\//, '').split('/').join('  ›  ');
}

function colorsFor(k: EventKind) {
  if (k === 'add') return { bd: COLORS.addPanelBd, bg: COLORS.addPanelBg, fg: COLORS.add };
  if (k === 'remove')
    return { bd: COLORS.removePanelBd, bg: COLORS.removePanelBg, fg: COLORS.remove };
  return { bd: COLORS.modifyPanelBd, bg: COLORS.modifyPanelBg, fg: COLORS.modify };
}
