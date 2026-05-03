import { useState } from 'react'
import type { PathList } from '../types'

function pathsToPolyline(paths: PathList, scale: number): string[] {
  return paths
    .filter(p => p.length >= 2)
    .map(p => p.map(pt => `${pt[0] * scale},${pt[1] * scale}`).join(' '))
}

interface Props {
  svgContent: string | null
  previewPaths: PathList | null
  mediaWidthMm: number
  mediaHeightMm: number
  xOffsetMm?: number
  yOffsetMm?: number
  onOffsetChange?: (x: number, y: number) => void
}

const MAT_COLOUR = '#1a1a2e'
const CUT_COLOUR = '#f87171'

export function Canvas({
  svgContent,
  previewPaths,
  mediaWidthMm,
  mediaHeightMm,
  xOffsetMm = 0,
  yOffsetMm = 0,
  onOffsetChange,
}: Props) {
  const scale = Math.min(800 / mediaWidthMm, 600 / mediaHeightMm)
  const canvasW = mediaWidthMm * scale
  const canvasH = mediaHeightMm * scale

  // Drag state: null when idle
  const [dragOrigin, setDragOrigin] = useState<{
    px: number; py: number; ox: number; oy: number
  } | null>(null)

  const hasContent = !!(svgContent || previewPaths)

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!hasContent || !onOffsetChange) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragOrigin({ px: e.clientX, py: e.clientY, ox: xOffsetMm, oy: yOffsetMm })
    e.preventDefault()
  }

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragOrigin || !onOffsetChange) return
    const dx = (e.clientX - dragOrigin.px) / scale
    const dy = (e.clientY - dragOrigin.py) / scale
    onOffsetChange(dragOrigin.ox + dx, dragOrigin.oy + dy)
  }

  const endDrag = () => setDragOrigin(null)

  const gridLinesX = Array.from({ length: Math.ceil(mediaWidthMm / 10) }, (_, i) => i)
  const gridLinesY = Array.from({ length: Math.ceil(mediaHeightMm / 10) }, (_, i) => i)

  const offsetXPx = xOffsetMm * scale
  const offsetYPx = yOffsetMm * scale

  const cursorStyle = dragOrigin
    ? 'grabbing'
    : hasContent && onOffsetChange
      ? 'grab'
      : 'default'

  return (
    <div className="flex-1 flex items-center justify-center bg-gray-950 overflow-auto p-4">
      <svg
        width={canvasW}
        height={canvasH}
        viewBox={`0 0 ${canvasW} ${canvasH}`}
        overflow="hidden"
        className="border border-gray-600 shadow-lg"
        style={{ background: MAT_COLOUR, cursor: cursorStyle }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* Grid — fixed to mat */}
        {gridLinesX.map(i => (
          <line
            key={`vg${i}`}
            x1={i * 10 * scale} y1={0}
            x2={i * 10 * scale} y2={canvasH}
            stroke="#ffffff10" strokeWidth={0.5}
          />
        ))}
        {gridLinesY.map(i => (
          <line
            key={`hg${i}`}
            x1={0} y1={i * 10 * scale}
            x2={canvasW} y2={i * 10 * scale}
            stroke="#ffffff10" strokeWidth={0.5}
          />
        ))}

        {/* Design — translated by current offset */}
        <g transform={`translate(${offsetXPx}, ${offsetYPx})`}>
          {svgContent && (
            <foreignObject width={canvasW} height={canvasH} style={{ opacity: 0.35 }}>
              <div
                // @ts-ignore — xmlns needed for foreignObject children
                xmlns="http://www.w3.org/1999/xhtml"
                style={{ width: '100%', height: '100%' }}
                dangerouslySetInnerHTML={{ __html: svgContent }}
              />
            </foreignObject>
          )}

          {previewPaths && pathsToPolyline(previewPaths, scale).map((pts, i) => (
            <polyline
              key={i}
              points={pts}
              fill="none"
              stroke={CUT_COLOUR}
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
          ))}
        </g>
      </svg>
    </div>
  )
}
