import type { DeviceStatus as DS } from '../types'

interface Props {
  status: DS
  loading: boolean
  error: string | null
  onConnect: () => void
  onDisconnect: () => void
}

const STATUS_COLOUR: Record<string, string> = {
  ready: 'bg-green-500',
  moving: 'bg-yellow-400',
  unloaded: 'bg-orange-400',
  not_found: 'bg-gray-400',
  error: 'bg-red-500',
}

export function DeviceStatus({ status, loading, error, onConnect, onDisconnect }: Props) {
  const dot = STATUS_COLOUR[status.status] ?? 'bg-gray-400'

  return (
    <div className="flex items-center gap-2 p-2 rounded border border-gray-700 bg-gray-800 text-sm text-white select-none">
      <span className={`w-2.5 h-2.5 rounded-full ${dot}`} />
      <span className="flex-1">
        {status.connected
          ? `${status.status} · ${status.port ?? ''}`
          : 'No device'}
      </span>
      {error && <span className="text-red-400 text-xs">{error}</span>}
      {status.connected ? (
        <button
          onClick={onDisconnect}
          className="px-2 py-0.5 rounded text-xs bg-gray-600 hover:bg-gray-500"
        >
          Disconnect
        </button>
      ) : (
        <button
          onClick={onConnect}
          disabled={loading}
          className="px-2 py-0.5 rounded text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
        >
          {loading ? 'Connecting…' : 'Connect'}
        </button>
      )}
    </div>
  )
}
