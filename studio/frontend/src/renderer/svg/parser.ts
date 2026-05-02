import type { PathList } from '../types'

// px per mm at 96 DPI
const PX_PER_MM = 96 / 25.4  // ≈ 3.7795

/**
 * Parse an SVG string and return all visible strokes as mm-coordinate polylines.
 * Works in both Electron renderer (real DOM) and jsdom (tests).
 */
export function parseSvgToMmPaths(svgString: string, smoothness = 0.05): PathList {
  const parser = new DOMParser()
  const doc = parser.parseFromString(svgString, 'image/svg+xml')
  const svgEl = doc.documentElement as unknown as SVGSVGElement

  const { mmPerUnit, offsetX, offsetY } = computeTransform(svgEl)

  // Collect all shape elements
  const shapes = doc.querySelectorAll('path, rect, circle, ellipse, line, polyline, polygon')
  const result: PathList = []

  shapes.forEach((el) => {
    const pathData = elementToPathData(el as SVGElement)
    if (!pathData) return

    const points = samplePathData(pathData, mmPerUnit, offsetX, offsetY, smoothness)
    if (points.length >= 2) {
      result.push(points)
    }
  })

  return result
}

function computeTransform(svgEl: SVGSVGElement): {
  mmPerUnit: number
  offsetX: number
  offsetY: number
} {
  const vb = svgEl.getAttribute('viewBox')
  let vbX = 0, vbY = 0, vbW = 0

  if (vb) {
    const parts = vb.trim().split(/[\s,]+/).map(Number)
    vbX = parts[0] ?? 0
    vbY = parts[1] ?? 0
    vbW = parts[2] ?? 0
  }

  const widthAttr = svgEl.getAttribute('width') || String(vbW) || '100'
  const docWidthMm = parseAttrToMm(widthAttr, vbW)

  const mmPerUnit = vbW > 0 ? docWidthMm / vbW : 1 / PX_PER_MM

  return { mmPerUnit, offsetX: vbX, offsetY: vbY }
}

function parseAttrToMm(attr: string, fallbackPx: number): number {
  const val = parseFloat(attr)
  if (attr.endsWith('mm')) return val
  if (attr.endsWith('cm')) return val * 10
  if (attr.endsWith('in')) return val * 25.4
  if (attr.endsWith('px')) return val / PX_PER_MM
  // bare number treated as px
  return (isNaN(val) ? fallbackPx : val) / PX_PER_MM
}

function elementToPathData(el: SVGElement): string | null {
  const tag = el.tagName.toLowerCase()

  if (tag === 'path') {
    return el.getAttribute('d')
  }
  if (tag === 'rect') {
    const x = parseFloat(el.getAttribute('x') || '0')
    const y = parseFloat(el.getAttribute('y') || '0')
    const w = parseFloat(el.getAttribute('width') || '0')
    const h = parseFloat(el.getAttribute('height') || '0')
    if (w <= 0 || h <= 0) return null
    return `M ${x} ${y} L ${x+w} ${y} L ${x+w} ${y+h} L ${x} ${y+h} Z`
  }
  if (tag === 'circle') {
    const cx = parseFloat(el.getAttribute('cx') || '0')
    const cy = parseFloat(el.getAttribute('cy') || '0')
    const r = parseFloat(el.getAttribute('r') || '0')
    if (r <= 0) return null
    // Approximate circle with cubic beziers
    const k = 0.5522847498
    return `M ${cx+r} ${cy} C ${cx+r} ${cy+r*k} ${cx+r*k} ${cy+r} ${cx} ${cy+r} C ${cx-r*k} ${cy+r} ${cx-r} ${cy+r*k} ${cx-r} ${cy} C ${cx-r} ${cy-r*k} ${cx-r*k} ${cy-r} ${cx} ${cy-r} C ${cx+r*k} ${cy-r} ${cx+r} ${cy-r*k} ${cx+r} ${cy} Z`
  }
  if (tag === 'ellipse') {
    const cx = parseFloat(el.getAttribute('cx') || '0')
    const cy = parseFloat(el.getAttribute('cy') || '0')
    const rx = parseFloat(el.getAttribute('rx') || '0')
    const ry = parseFloat(el.getAttribute('ry') || '0')
    if (rx <= 0 || ry <= 0) return null
    const k = 0.5522847498
    return `M ${cx+rx} ${cy} C ${cx+rx} ${cy+ry*k} ${cx+rx*k} ${cy+ry} ${cx} ${cy+ry} C ${cx-rx*k} ${cy+ry} ${cx-rx} ${cy+ry*k} ${cx-rx} ${cy} C ${cx-rx} ${cy-ry*k} ${cx-rx*k} ${cy-ry} ${cx} ${cy-ry} C ${cx+rx*k} ${cy-ry} ${cx+rx} ${cy-ry*k} ${cx+rx} ${cy} Z`
  }
  if (tag === 'line') {
    const x1 = el.getAttribute('x1') || '0'
    const y1 = el.getAttribute('y1') || '0'
    const x2 = el.getAttribute('x2') || '0'
    const y2 = el.getAttribute('y2') || '0'
    return `M ${x1} ${y1} L ${x2} ${y2}`
  }
  if (tag === 'polyline' || tag === 'polygon') {
    const pts = (el.getAttribute('points') || '').trim()
    if (!pts) return null
    const coords = pts.split(/[\s,]+/).map(Number)
    let d = `M ${coords[0]} ${coords[1]}`
    for (let i = 2; i < coords.length - 1; i += 2) {
      d += ` L ${coords[i]} ${coords[i+1]}`
    }
    if (tag === 'polygon') d += ' Z'
    return d
  }
  return null
}

function samplePathData(
  d: string,
  mmPerUnit: number,
  offsetX: number,
  offsetY: number,
  smoothness: number
): Array<[number, number]> {
  // Flatten path using recursive cubic bezier subdivision
  const commands = parseSvgPath(d)
  const points: Array<[number, number]> = []
  let cx = 0, cy = 0
  let startX = 0, startY = 0

  for (const cmd of commands) {
    switch (cmd.type) {
      case 'M':
        cx = cmd.x!; cy = cmd.y!
        startX = cx; startY = cy
        points.push(toMm(cx, cy, mmPerUnit, offsetX, offsetY))
        break
      case 'L':
        cx = cmd.x!; cy = cmd.y!
        points.push(toMm(cx, cy, mmPerUnit, offsetX, offsetY))
        break
      case 'C': {
        const pts = subdivideCubic(
          cx, cy,
          cmd.x1!, cmd.y1!, cmd.x2!, cmd.y2!, cmd.x!, cmd.y!,
          smoothness
        )
        for (const [px, py] of pts) {
          points.push(toMm(px, py, mmPerUnit, offsetX, offsetY))
        }
        cx = cmd.x!; cy = cmd.y!
        break
      }
      case 'Z':
        points.push(toMm(startX, startY, mmPerUnit, offsetX, offsetY))
        break
    }
  }

  return points
}

function toMm(x: number, y: number, mmPerUnit: number, ox: number, oy: number): [number, number] {
  return [(x - ox) * mmPerUnit, (y - oy) * mmPerUnit]
}

// Simple SVG path command parser (handles M, L, C, Z)
function parseSvgPath(d: string): Array<any> {
  const cmds: any[] = []
  const re = /([MLCZmlcz])([^MLCZmlcz]*)/g
  let m: RegExpExecArray | null
  let lastX = 0, lastY = 0

  while ((m = re.exec(d)) !== null) {
    const type = m[1].toUpperCase()
    const isRel = m[1] !== m[1].toUpperCase()
    const nums = m[2].trim().split(/[\s,]+/).filter(Boolean).map(Number)
    const ox = isRel ? lastX : 0
    const oy = isRel ? lastY : 0

    if (type === 'M') {
      for (let i = 0; i < nums.length; i += 2) {
        const x = nums[i] + ox, y = nums[i+1] + oy
        cmds.push({ type: i === 0 ? 'M' : 'L', x, y })
        lastX = x; lastY = y
      }
    } else if (type === 'L') {
      for (let i = 0; i < nums.length; i += 2) {
        const x = nums[i] + ox, y = nums[i+1] + oy
        cmds.push({ type: 'L', x, y })
        lastX = x; lastY = y
      }
    } else if (type === 'C') {
      for (let i = 0; i < nums.length; i += 6) {
        const x1 = nums[i]+ox, y1 = nums[i+1]+oy
        const x2 = nums[i+2]+ox, y2 = nums[i+3]+oy
        const x = nums[i+4]+ox, y = nums[i+5]+oy
        cmds.push({ type: 'C', x1, y1, x2, y2, x, y })
        lastX = x; lastY = y
      }
    } else if (type === 'Z') {
      cmds.push({ type: 'Z' })
    }
  }
  return cmds
}

// Recursive de Casteljau subdivision
function subdivideCubic(
  x0: number, y0: number,
  x1: number, y1: number,
  x2: number, y2: number,
  x3: number, y3: number,
  smoothness: number
): Array<[number, number]> {
  // Check if the curve is flat enough
  const dx = x3 - x0, dy = y3 - y0
  const d1 = Math.abs((x1 - x3) * dy - (y1 - y3) * dx)
  const d2 = Math.abs((x2 - x3) * dy - (y2 - y3) * dx)

  if ((d1 + d2) * (d1 + d2) <= smoothness * (dx * dx + dy * dy)) {
    return [[x3, y3]]
  }

  // Subdivide at t=0.5
  const mx01 = (x0+x1)/2, my01 = (y0+y1)/2
  const mx12 = (x1+x2)/2, my12 = (y1+y2)/2
  const mx23 = (x2+x3)/2, my23 = (y2+y3)/2
  const mx012 = (mx01+mx12)/2, my012 = (my01+my12)/2
  const mx123 = (mx12+mx23)/2, my123 = (my12+my23)/2
  const mx = (mx012+mx123)/2, my = (my012+my123)/2

  return [
    ...subdivideCubic(x0, y0, mx01, my01, mx012, my012, mx, my, smoothness),
    ...subdivideCubic(mx, my, mx123, my123, mx23, my23, x3, y3, smoothness),
  ]
}
