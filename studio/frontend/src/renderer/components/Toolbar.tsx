interface Props {
  onOpenFile: () => void
  onPreview: () => void
  onSend: () => void
  onCancel: () => void
  jobState: 'idle' | 'previewing' | 'sending' | 'done' | 'error'
  hasDesign: boolean
  deviceConnected: boolean
}

export function Toolbar({
  onOpenFile, onPreview, onSend, onCancel,
  jobState, hasDesign, deviceConnected,
}: Props) {
  const busy = jobState === 'previewing' || jobState === 'sending'

  return (
    <header className="flex items-center gap-2 px-3 py-2 bg-gray-800 border-b border-gray-700">
      <span className="font-bold text-white mr-4 text-lg tracking-tight">
        ✂ CutCutGo Studio
      </span>

      <button
        onClick={onOpenFile}
        className="px-3 py-1 rounded bg-gray-600 hover:bg-gray-500 text-white text-sm"
      >
        Open SVG…
      </button>

      <button
        onClick={onPreview}
        disabled={!hasDesign || busy}
        className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-sm disabled:opacity-40"
      >
        {jobState === 'previewing' ? 'Previewing…' : 'Preview Cut'}
      </button>

      <button
        onClick={onSend}
        disabled={!hasDesign || !deviceConnected || busy}
        className="px-3 py-1 rounded bg-green-600 hover:bg-green-500 text-white text-sm disabled:opacity-40"
      >
        {jobState === 'sending' ? 'Cutting…' : 'Cut Now'}
      </button>

      {busy && (
        <button
          onClick={onCancel}
          className="px-3 py-1 rounded bg-red-700 hover:bg-red-600 text-white text-sm"
        >
          Cancel
        </button>
      )}

      {jobState === 'error' && (
        <span className="text-red-400 text-sm ml-2">Error — check console</span>
      )}
      {jobState === 'done' && (
        <span className="text-green-400 text-sm ml-2">Done ✓</span>
      )}
    </header>
  )
}
