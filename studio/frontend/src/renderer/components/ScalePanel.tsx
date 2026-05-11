import React from 'react'

interface Props {
  scale: number
  originalWidthMm: number
  originalHeightMm: number
  mediaWidthMm: number
  onChange: (scale: number) => void
}

export function ScalePanel({ scale, originalWidthMm, originalHeightMm, mediaWidthMm, onChange }: Props) {
  const scaledW = originalWidthMm * scale
  const scaledH = originalHeightMm * scale
  const hasDesign = originalWidthMm > 0 && originalHeightMm > 0
  const fitScale = originalWidthMm > 0 ? Math.round((mediaWidthMm * 0.9) / originalWidthMm * 100) / 100 : 1.0

  if (!hasDesign) {
    return (
      <aside className="w-full flex flex-col gap-3 text-sm text-white">
        <h2 className="font-semibold text-base">Skalierung</h2>
        <p className="text-gray-500 text-xs">Kein Design geladen.</p>
      </aside>
    )
  }

  return (
    <aside className="w-full flex flex-col gap-3 text-sm text-white">
      <h2 className="font-semibold text-base">Skalierung</h2>

      <label className="flex flex-col gap-1">
        <span>Skalierung: {Math.round(scale * 100)}%</span>
        <input
          type="range"
          min={10} max={500} step={5}
          value={Math.round(scale * 100)}
          onChange={e => onChange(Number(e.target.value) / 100)}
          className="accent-blue-500"
        />
      </label>

      <div className="flex gap-2">
        <label className="flex flex-col gap-1 flex-1">
          <span className="text-gray-400 text-xs">Breite (mm)</span>
          <input
            type="number"
            step={0.1}
            min={0.1}
            value={Math.round(scaledW * 10) / 10}
            onChange={e => {
              const v = Number(e.target.value)
              if (v > 0 && originalWidthMm > 0) onChange(v / originalWidthMm)
            }}
            className="bg-gray-700 rounded px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1 flex-1">
          <span className="text-gray-400 text-xs">Höhe (mm)</span>
          <input
            type="number"
            step={0.1}
            min={0.1}
            value={Math.round(scaledH * 10) / 10}
            onChange={e => {
              const v = Number(e.target.value)
              if (v > 0 && originalHeightMm > 0) onChange(v / originalHeightMm)
            }}
            className="bg-gray-700 rounded px-2 py-1"
          />
        </label>
      </div>

      <p className="text-gray-500 text-xs">
        Original: {originalWidthMm.toFixed(1)} × {originalHeightMm.toFixed(1)} mm
      </p>

      <div className="flex gap-2">
        {[0.5, 1.0, 2.0].map(pct => (
          <button
            key={pct}
            onClick={() => onChange(pct)}
            className={`flex-1 px-2 py-1 rounded text-xs border ${
              scale === pct
                ? 'bg-indigo-600 border-indigo-500 text-white'
                : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {Math.round(pct * 100)}%
          </button>
        ))}
        <button
          onClick={() => onChange(fitScale)}
          className={`flex-1 px-2 py-1 rounded text-xs border ${
            scale === fitScale
              ? 'bg-indigo-600 border-indigo-500 text-white'
              : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
          }`}
        >
          Fit
        </button>
      </div>

      <p className="text-gray-600 text-xs leading-relaxed">
        Ctrl+Scroll — Skaliert in 5%-Schritten<br />
        Ecke ziehen — Visuell skalieren
      </p>
    </aside>
  )
}
