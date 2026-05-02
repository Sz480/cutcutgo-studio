import { useState, useMemo, useEffect } from 'react'
import type { TraceParams, TraceResult } from '../types'

interface Props {
  file: File
  params: TraceParams
  onParamsChange: (p: TraceParams) => void
  result: TraceResult | null
  loading: boolean
  error: string | null
  onAccept: (enabledColors?: Set<string>) => void
  onCancel: () => void
}

export function ImportPanel({
  file, params, onParamsChange, result, loading, error, onAccept, onCancel,
}: Props) {
  const [imageUrl, setImageUrl] = useState('')
  useEffect(() => {
    const url = URL.createObjectURL(file)
    setImageUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const [enabledColors, setEnabledColors] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (result?.layers) {
      setEnabledColors(new Set(result.layers.map(l => l.color)))
    }
  }, [result?.layers])

  const toggleColor = (color: string) => {
    setEnabledColors(prev => {
      const next = new Set(prev)
      next.has(color) ? next.delete(color) : next.add(color)
      return next
    })
  }

  // result.paths is the flat union of all layer paths in both silhouette and color modes
  const bbox = useMemo(() => {
    if (!result || result.paths.length === 0) return { maxX: 1, maxY: 1 }
    let maxX = 0, maxY = 0
    for (const path of result.paths) {
      for (const [x, y] of path) {
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
    return { maxX, maxY }
  }, [result])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-[800px] max-h-[90vh] flex flex-col">

        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h2 className="text-white font-semibold">Bild importieren — {file.name}</h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="w-56 flex-shrink-0 flex flex-col gap-4 p-4 border-r border-gray-700 overflow-y-auto text-sm text-white">

            <div>
              <p className="text-gray-400 uppercase text-xs mb-2">Modus</p>
              {(['silhouette', 'color'] as const).map(m => (
                <label key={m} className="flex items-center gap-2 mb-1 cursor-pointer">
                  <input
                    type="radio"
                    name="mode"
                    checked={params.mode === m}
                    onChange={() => onParamsChange({ ...params, mode: m })}
                    className="accent-blue-500"
                  />
                  {m === 'silhouette' ? 'Silhouette' : 'Farbtrennung'}
                </label>
              ))}
            </div>

            {params.mode === 'silhouette' && (
              <label className="flex flex-col gap-1">
                <span>Schwellenwert: {params.threshold}</span>
                <input
                  type="range" min={0} max={255} step={1}
                  value={params.threshold}
                  onChange={e => onParamsChange({ ...params, threshold: Number(e.target.value) })}
                  className="accent-blue-500"
                />
              </label>
            )}

            {params.mode === 'color' && (
              <label className="flex flex-col gap-1">
                <span>Anzahl Farben: {params.num_colors}</span>
                <input
                  type="range" min={2} max={8} step={1}
                  value={params.num_colors}
                  onChange={e => onParamsChange({ ...params, num_colors: Number(e.target.value) })}
                  className="accent-blue-500"
                />
              </label>
            )}

            <label className="flex flex-col gap-1">
              <span>Glättung: {params.smoothness.toFixed(1)}</span>
              <input
                type="range" min={0} max={5} step={0.5}
                value={params.smoothness}
                onChange={e => onParamsChange({ ...params, smoothness: Number(e.target.value) })}
                className="accent-blue-500"
              />
            </label>

            {params.mode === 'color' && result && result.layers.length > 0 && (
              <div>
                <p className="text-gray-400 uppercase text-xs mb-2">Farblagen</p>
                {result.layers.map(layer => (
                  <label key={layer.color} className="flex items-center gap-2 mb-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enabledColors.has(layer.color)}
                      onChange={() => toggleColor(layer.color)}
                      className="accent-blue-500"
                    />
                    <span
                      className="w-4 h-4 rounded-sm border border-gray-600 flex-shrink-0"
                      style={{ backgroundColor: layer.color }}
                    />
                    <span className="text-xs text-gray-300 truncate">
                      {layer.color} ({layer.paths.length})
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1 flex items-center justify-center p-4 overflow-hidden bg-gray-950">
            <div className="relative max-w-full max-h-full" style={{ aspectRatio: `${bbox.maxX} / ${bbox.maxY}` }}>
              <img
                src={imageUrl}
                alt="Original"
                className="w-full h-full object-contain opacity-40"
              />
              {result && result.paths.length > 0 && (
                <svg
                  viewBox={`0 0 ${bbox.maxX} ${bbox.maxY}`}
                  className="absolute inset-0 w-full h-full"
                  style={{ pointerEvents: 'none' }}
                >
                  {params.mode === 'silhouette'
                    ? result.paths.map((path, i) => (
                        <polyline
                          key={i}
                          points={path.map(([x, y]) => `${x},${y}`).join(' ')}
                          fill="none"
                          stroke="#22d3ee"
                          strokeWidth={bbox.maxX * 0.003}
                        />
                      ))
                    : result.layers
                        .filter(l => enabledColors.has(l.color))
                        .map(layer =>
                          layer.paths.map((path, i) => (
                            <polyline
                              key={`${layer.color}-${i}`}
                              points={path.map(([x, y]) => `${x},${y}`).join(' ')}
                              fill="none"
                              stroke={layer.color}
                              strokeWidth={bbox.maxX * 0.003}
                            />
                          ))
                        )
                  }
                </svg>
              )}
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <span className="text-white text-sm">Tracen…</span>
                </div>
              )}
              {!loading && result && result.paths.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-yellow-400 text-sm">Keine Pfade gefunden — Schwellenwert anpassen</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-700">
          {error && <span className="text-red-400 text-xs">{error}</span>}
          {!error && <span />}
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-white text-sm"
            >
              Abbrechen
            </button>
            <button
              onClick={() => onAccept(params.mode === 'color' ? enabledColors : undefined)}
              disabled={!result || result.paths.length === 0 || loading}
              className="px-4 py-1.5 rounded bg-green-600 hover:bg-green-500 text-white text-sm disabled:opacity-40"
            >
              Übernehmen →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
