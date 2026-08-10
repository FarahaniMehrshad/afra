import type { PropsWithChildren } from 'react';

interface Props {
  title?: string;
  onClick: () => void;
}

/** Small square button used for the change-jump arrows. */
export function IconButton({ title, onClick, children }: PropsWithChildren<Props>) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="afra-btn"
      style={{
        fontFamily: 'IBM Plex Mono, monospace',
        fontSize: 12,
        width: 28,
        height: 28,
        borderRadius: 8,
        border: '1px solid rgba(148,180,255,0.14)',
        background: 'rgba(148,180,255,0.05)',
        color: '#9db2d4',
      }}
    >
      {children}
    </button>
  );
}
