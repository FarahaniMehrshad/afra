import { useAppStore } from '@/store/appStore';
import { useIngest } from '@/hooks/useIngest';

export function DropZone() {
  const dragOver = useAppStore((s) => s.dragOver);
  const {
    fileInputRef,
    pickFolder,
    pickUpload,
    onFolderInput,
    onDragOver,
    onDragLeave,
    onDrop,
  } = useIngest();

  const hasPicker = typeof (window as Window & { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        borderRadius: 18,
        border:
          '1px dashed ' +
          (dragOver ? 'rgba(120,165,255,0.65)' : 'rgba(148,180,255,0.18)'),
        background: dragOver
          ? 'rgba(79,141,253,0.10)'
          : 'rgba(148,180,255,0.05)',
        backdropFilter: 'blur(18px) saturate(140%)',
        WebkitBackdropFilter: 'blur(18px) saturate(140%)',
        padding: '44px 34px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
        transition: 'all 0.18s ease',
      }}
    >
      <div
        style={{
          width: 46,
          height: 46,
          borderRadius: 13,
          border: '1px solid rgba(148,180,255,0.18)',
          background: 'rgba(148,180,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: 16,
            height: 12,
            border: '1.5px solid #4f8dfd',
            borderRadius: '2px 3px 3px 3px',
            borderTopWidth: 4,
          }}
        />
      </div>

      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 15, color: '#dbe4f2', marginBottom: 4 }}>
          Drop the folder here
        </div>
        <div
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 11.5,
            color: '#6d7f9c',
          }}
        >
          or choose it from disk
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          onClick={pickFolder}
          className="afra-btn"
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
          Choose folder…
        </button>
        <button
          onClick={pickUpload}
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
          Upload folder contents
        </button>
      </div>

      <input
        type="file"
        // These non-standard attributes let Chromium/WebKit open the whole
        // folder. TypeScript doesn't know about them so we cast.
        {...({ webkitdirectory: '', directory: '' } as unknown as Record<string, string>)}
        multiple
        ref={fileInputRef}
        onChange={onFolderInput}
        style={{ display: 'none' }}
      />

      <div
        style={{
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: 10.5,
          color: '#5b6d8a',
          textAlign: 'center',
        }}
      >
        {hasPicker
          ? 'Folder picker available — recents will be remembered'
          : 'Folder picker unavailable in this browser; upload still works'}
      </div>
    </div>
  );
}
