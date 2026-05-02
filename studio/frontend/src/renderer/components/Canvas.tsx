import type { PathList } from '../types'

interface Props {
  svgContent: string | null
  previewPaths: PathList | null
  mediaWidthMm: number
  mediaHeightMm: number
}

const MAT_COLOUR = '#1a1a2e'
const CUT_COLOUR = '#f87171'

export function Canvas({ svgContent, previewPaths, mediaWidthMm, mediaHeightMm }: Props) {
  const scale = Math.min(800 / mediaWidthMm, 600 / mediaHeightMm)
  const canvasW = mediaWidthMm * scale
  const canvasH = mediaHeightMm * scale

  const pathsToPolyline = (paths: PathList): string[] =>
    paths
      .filter(p => p.length >= 2)
      .map(p => p.map(pt => `${pt[0] * scale},${pt[1] * scale}`).join(' '))

  const gridLinesX = Array.from({ length: Math.ceil(mediaWidthMm / 10) }, (_, i) => i)
  const gridLinesY = Array.from({ length: Math.ceil(mediaHeightMm / 10) }, (_, i) => i)

  return (
    <div className="flex-1 flex items-center justify-center bg-gray-950 overflow-auto p-4">
      <svg
        width={canvasW}
        height={canvasH}
        viewBox={`0 0 ${canvasW} ${canvasH}`}
        className="border border-gray-600 shadow-lg"
        style={{ background: MAT_COLOUR }}
      >
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

        {previewPaths && pathsToPolyline(previewPaths).map((pts, i) => (
          <polyline
            key={i}
            points={pts}
            fill="none"
            stroke={CUT_COLOUR}
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
        ))}
      </svg>
    </div>
  )
}
