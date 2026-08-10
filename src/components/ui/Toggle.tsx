import type { CSSProperties, PropsWithChildren } from 'react';

interface Props {
  active: boolean;
  onClick: () => void;
  title?: string;
  style?: CSSProperties;
}

/** A pill button that shows two states — used for wrap / noise / etc. */
export function Toggle({
  active,
  onClick,
  title,
  style,
  children,
}: PropsWithChildren<Props>) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="afra-btn"
      style={{
        fontFamily: 'IBM Plex Mono, monospace',
        fontSize: 11,
        padding: '6px 11px',
        borderRadius: 9,
        border:
          '1px solid ' +
          (active ? 'rgba(120,165,255,0.36)' : 'rgba(148,180,255,0.14)'),
        background: active ? 'rgba(79,141,253,0.16)' : 'rgba(148,180,255,0.05)',
        color: active ? '#cfe0ff' : '#8195b3',
        ...style,
      }}
    >
      {children}
    </button>
  );
}
