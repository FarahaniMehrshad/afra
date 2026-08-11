import { useLlmStore } from '@/store/llmStore';
import { useLlmAnalysis } from '@/hooks/useLlmAnalysis';

/**
 * The "analyze patterns" control pair in the merged-view toolbar: run the LLM
 * pass, and inspect exactly what would be sent before running it.
 */
export function LlmControls() {
  const {
    healthChecked,
    configured,
    health,
    status,
    done,
    total,
    error,
    ready,
    run,
    cancel,
    openDebug,
    clear,
  } = useLlmAnalysis();
  const labelled = useLlmStore((s) => s.verdicts.size);

  const running = status === 'running';
  const disabled = !ready || (!running && (!healthChecked || !configured));

  const handleClear = () => {
    // A single confirm is cheap insurance — the DB delete is not undo-able.
    if (
      window.confirm(
        'Clear every LLM verdict for this journey?\n\n' +
          'This wipes the in-memory results and deletes the analysis rows saved ' +
          'in Postgres (both wpf and exe). The next run starts fresh.',
      )
    ) {
      clear();
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button
        onClick={running ? cancel : run}
        disabled={disabled}
        className="afra-btn"
        title={buttonTitle({ healthChecked, configured, running, health })}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: 11,
          padding: '6px 12px',
          borderRadius: 9,
          border: '1px solid ' + (running ? 'rgba(224,176,84,0.36)' : 'rgba(120,165,255,0.36)'),
          background: running
            ? 'rgba(224,176,84,0.14)'
            : 'linear-gradient(180deg, rgba(79,141,253,0.26), rgba(79,141,253,0.12))',
          color: running ? '#e8c67d' : '#dce8ff',
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            flex: 'none',
            background: running ? '#e8c67d' : configured ? '#7ee0b0' : '#5f7292',
            animation: running ? 'afraPulse 1.1s ease-in-out infinite' : undefined,
          }}
        />
        {running ? 'analyzing ' + done + '/' + total + ' — cancel' : 'analyze patterns'}
      </button>

      <button
        onClick={openDebug}
        disabled={!ready}
        className="afra-btn afra-btn-ghost"
        title="Inspect the exact batches and prompts that get sent to the model"
        style={{
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: 11,
          padding: '6px 10px',
          borderRadius: 9,
          border: '1px solid rgba(148,180,255,0.14)',
          background: 'rgba(148,180,255,0.05)',
          color: '#9db2d4',
        }}
      >
        payload
      </button>

      <button
        onClick={handleClear}
        disabled={!ready || running}
        className="afra-btn"
        title="Wipe every LLM verdict for this journey (in-memory and in Postgres) so the next run starts clean."
        style={{
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: 11,
          padding: '6px 10px',
          borderRadius: 9,
          border: '1px solid rgba(226,90,105,0.28)',
          background: 'rgba(226,90,105,0.08)',
          color: '#f0a0aa',
          opacity: !ready || running ? 0.45 : 1,
        }}
      >
        clear results
      </button>

      {!running && labelled > 0 && (
        <span
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 10.5,
            color: '#7ee0b0',
          }}
        >
          {labelled} labeled
        </span>
      )}

      {status === 'error' && error && (
        <span
          className="afra-ellipsis"
          title={error}
          style={{
            maxWidth: 220,
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 10.5,
            color: '#f0a0aa',
          }}
        >
          {error}
        </span>
      )}
    </div>
  );
}

function buttonTitle(s: {
  healthChecked: boolean;
  configured: boolean;
  running: boolean;
  health: { model: string; host: string } | null;
}): string {
  if (s.running) return 'Stop after the batches already in flight';
  if (!s.healthChecked) return 'Checking whether an LLM is configured…';
  if (!s.configured) {
    return 'Set LLM_BASE_URL and LLM_API_KEY in .env, then restart the server.';
  }
  return (
    'Classify every changed path in both wpf and exe using ' +
    s.health?.model +
    ' at ' +
    s.health?.host
  );
}
