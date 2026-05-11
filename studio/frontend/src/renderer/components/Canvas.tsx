import { useState } from 'react'
import type { PathList } from '../types'

const PX_PER_MM = 96 / 25.4  // ≈ 3.7795

function pathsToPolyline(paths: PathList, mmToPx: number, userS: number): string[] {
  return paths
    .filter(p => p.length >= 2)
    .map(p => p.map(pt => `${pt[0] * mmToPx * userS},${pt[1] * mmToPx * userS}`).join(' '))
}

function computeBbox(paths: PathList): { x: number; y: number; w: number; h: number } | null {
  if (!paths || paths.length === 0) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const path of paths) {
    for (const [x, y] of path) {
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

interface Props {
  svgContent: string | null
  previewPaths: PathList | null
  parsedPaths: PathList | null
  scale: number
  onScaleChange?: (scale: number) => void
  mediaWidthMm: number
  mediaHeightMm: number
  xOffsetMm?: number
  yOffsetMm?: number
  svgNormOffsetX?: number
  svgNormOffsetY?: number
  onOffsetChange?: (x: number, y: number) => void
}

const MAT_COLOUR = '#1a1a2e'
const CUT_COLOUR = '#f87171'

export function Canvas({
  svgContent,
  previewPaths,
  parsedPaths,
  scale: userScale = 1.0,
  onScaleChange,
  mediaWidthMm,
  mediaHeightMm,
  xOffsetMm = 0,
  yOffsetMm = 0,
  svgNormOffsetX = 0,
  svgNormOffsetY = 0,
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
  const bbox = parsedPaths ? computeBbox(parsedPaths) : null

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
                style={{
                  width: '100%',
                  height: '100%',
                  transformOrigin: '0 0',
                  transform: `scale(${userScale}) translate(${-svgNormOffsetX * PX_PER_MM}px, ${-svgNormOffsetY * PX_PER_MM}px)`,
                }}
                dangerouslySetInnerHTML={{ __html: svgContent }}
              />
            </foreignObject>
          )}

          {previewPaths && pathsToPolyline(previewPaths, scale, userScale).map((pts, i) => (
            <polyline
              key={i}
              points={pts}
              fill="none"
              stroke={CUT_COLOUR}
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
          ))}

          {bbox && hasContent && (
            <rect
              x={0}
              y={0}
              width={bbox.w * userScale}
              height={bbox.h * userScale}
              fill="none"
              stroke="#6366f1"
              strokeWidth={1.5 / scale}
              strokeDasharray={`${4 / scale} ${4 / scale}`}
              pointerEvents="none"
            />
          )}
        </g>
      </svg>
    </div>
  )
}
