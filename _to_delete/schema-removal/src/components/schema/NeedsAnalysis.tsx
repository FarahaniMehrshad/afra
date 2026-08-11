import { useAppStore } from '@/store/appStore';
import { useLlmAnalysis } from '@/hooks/useLlmAnalysis';

/**
 * Shown when the LLM has not classified anything yet. This page is derived
 * entirely from the `step-operation` verdicts, so an empty document here would
 * be misleading — say why, and offer the run from where the user already is.
 */
export function NeedsAnalysis() {
  const setPage = useAppStore((s) => s.setPage);
  const { status, done, total, error, healthChecked, configured, run } =
    useLlmAnalysis();

  const running = status === 'running';
  const ranAndFoundNothing = status === 'done' || status === 'error';

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
      }}
    >
      <div
        style={{
          maxWidth: 520,
          textAlign: 'center',
          animation: 'afraFade 0.2s ease',
        }}
      >
        <div style={{ fontSize: 16, color: '#dbe4f2', marginBottom: 8 }}>
          {ranAndFoundNothing
            ? 'No fields were attributed to a UI operation'
            : 'This page needs the pattern analysis first'}
        </div>
        <div style={{ fontSize: 13, color: '#7f92b0', lineHeight: 1.65, marginBottom: 20 }}>
          {ranAndFoundNothing
            ? 'The run finished but every changed path was classified as an id, a timestamp, a derived value or environment churn. Nothing is left to put in the YAML.'
            : 'The YAML is distilled from the paths the model labels as caused by a step\u2019s UI operation, so the classification has to run before there is anything to generate.'}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button
            onClick={run}
            disabled={running || !healthChecked || !configured}
            className="afra-btn"
            title={
              configured
                ? 'Classify every changed path in both wpf and exe'
                : 'Set LLM_BASE_URL and LLM_API_KEY in .env, then restart the server.'
            }
            style={{
              fontSize: 13,
              fontWeight: 500,
              padding: '10px 20px',
              borderRadius: 11,
              border: '1px solid rgba(120,165,255,0.4)',
              background:
                'linear-gradient(180deg, rgba(79,141,253,0.28), rgba(79,141,253,0.14))',
              color: '#e9f0ff',
              boxShadow: '0 6px 20px rgba(40,90,200,0.18)',
            }}
          >
            {running ? 'analyzing ' + done + '/' + total + '…' : 'analyze patterns'}
          </button>
          <button
            onClick={() => setPage('total')}
            className="afra-btn afra-btn-ghost"
            style={{
              fontSize: 13,
              padding: '10px 18px',
              borderRadius: 11,
              border: '1px solid rgba(148,180,255,0.16)',
              background: 'rgba(148,180,255,0.05)',
              color: '#aebfda',
            }}
          >
            Open Total diff
          </button>
        </div>

        {!configured && healthChecked && (
          <div
            style={{
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: 11,
              color: '#e8c67d',
              marginTop: 16,
            }}
          >
            No LLM configured — set LLM_BASE_URL and LLM_API_KEY in .env
          </div>
        )}

        {error && (
          <div
            style={{
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: 11,
              color: '#f0a0aa',
              marginTop: 16,
              lineHeight: 1.6,
            }}
          >
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
