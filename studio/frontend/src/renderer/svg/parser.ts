import type { PathList, ParsedSvgPaths } from '../types'

// px per mm at 96 DPI
const PX_PER_MM = 96 / 25.4  // ≈ 3.7795

/**
 * Parse an SVG string and return all visible strokes as mm-coordinate polylines.
 * Works in both Electron renderer (real DOM) and jsdom (tests).
 */
export function parseSvgToMmPaths(
  svgString: string,
  smoothness = 0.05,
  onWarning?: (msg: string) => void,
  suppressTextWarning = false,
): ParsedSvgPaths {
  const parser = new DOMParser()
  const doc = parser.parseFromString(svgString, 'image/svg+xml')
  const svgEl = doc.documentElement as unknown as SVGSVGElement

  const { mmPerUnit, offsetX, offsetY } = computeTransform(svgEl)

  // Collect all shape elements
  const shapes = doc.querySelectorAll('path, rect, circle, ellipse, line, polyline, polygon')
  const result: PathList = []

  shapes.forEach((el) => {
    // Skip elements inside <defs> — they are templates, not rendered content
    if (el.closest('defs')) return

    const pathData = elementToPathData(el as SVGElement)
    if (!pathData) return

    const svgSubpaths = samplePathDataToSvgCoords(pathData, smoothness)
    const transform = getComposedTransform(el)
    for (const svgPoints of svgSubpaths) {
      const points = svgCoordsToMm(svgPoints, mmPerUnit, offsetX, offsetY, transform)
      if (points.length >= 2) {
        result.push(points)
      }
    }
  })

  // Warn on <text> elements
  const textEls = doc.querySelectorAll('text')
  if (textEls.length > 0 && onWarning && !suppressTextWarning) {
    onWarning('Hinweis: Text-Elemente wurden übersprungen — zum Schneiden bitte in Inkscape zu Pfaden konvertieren (Pfad → Objekt in Pfad umwandeln).')
  }

  // Resolve <use> elements
  const useEls = doc.querySelectorAll('use')
  useEls.forEach((useEl) => {
    const href = (
      useEl.getAttribute('href') ||
      useEl.getAttribute('xlink:href') ||
      ''
    ).trim()
    if (!href.startsWith('#')) return
    const refEl = doc.getElementById(href.slice(1))
    if (!refEl) return

    const cloned = refEl.cloneNode(true) as SVGElement
    const ux = parseFloat(useEl.getAttribute('x') || '0')
    const uy = parseFloat(useEl.getAttribute('y') || '0')

    const pathData = elementToPathData(cloned)
    if (!pathData) {
      const tag = cloned.tagName.toLowerCase()
      if ((tag === 'g' || tag === 'use') && onWarning) {
        onWarning(`<use> referenziert ein Gruppen-Element (<${tag}>) — nur einfache Formen werden unterstützt.`)
      }
      return
    }

    const svgSubpaths = samplePathDataToSvgCoords(pathData, smoothness)

    // Build combined transform:
    // 1) referenced element's own transform
    // 2) <use> x/y as translate
    // 3) <use> element's transform + ancestor transforms
    let combined: number[] | null = null

    const refTransform = getComposedTransform(cloned)
    if (refTransform) combined = [...refTransform]

    const translateMatrix = [1, 0, 0, 1, ux, uy]
    combined = combined ? multiplyMatrices(translateMatrix, combined) : translateMatrix

    const useComposed = getComposedTransform(useEl)
    if (useComposed) {
      combined = multiplyMatrices(useComposed, combined)
    }

    for (const svgPoints of svgSubpaths) {
      const points = svgCoordsToMm(svgPoints, mmPerUnit, offsetX, offsetY, combined)
      if (points.length >= 2) result.push(points)
    }
  })

  // Normalize all paths so the bounding box starts at (0, 0).
  // This ensures the design sits at the mat's upper-left corner when offset = (0,0),
  // preventing negative offsets that would cut outside the mat boundary.
  let normOffsetX = 0, normOffsetY = 0
  if (result.length > 0) {
    let minX = Infinity, minY = Infinity
    for (const path of result) {
      for (const pt of path) {
        if (pt[0] < minX) minX = pt[0]
        if (pt[1] < minY) minY = pt[1]
      }
    }
    normOffsetX = minX
    normOffsetY = minY
    if (minX !== 0 || minY !== 0) {
      for (const path of result) {
        for (const pt of path) {
          pt[0] -= minX
          pt[1] -= minY
        }
      }
    }
  }

  return { paths: result, normOffsetX, normOffsetY }
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

function samplePathDataToSvgCoords(
  d: string,
  smoothness: number
): Array<Array<[number, number]>> {
  const commands = parseSvgPath(d)
  const subpaths: Array<Array<[number, number]>> = []
  let current: Array<[number, number]> = []
  let cx = 0, cy = 0
  let startX = 0, startY = 0

  function flush() {
    if (current.length >= 2) {
      subpaths.push(current)
    }
    current = []
  }

  for (const cmd of commands) {
    switch (cmd.type) {
      case 'M':
        flush()
        cx = cmd.x!; cy = cmd.y!
        startX = cx; startY = cy
        current.push([cx, cy])
        break
      case 'L':
        cx = cmd.x!; cy = cmd.y!
        current.push([cx, cy])
        break
      case 'C': {
        const pts = subdivideCubic(
          cx, cy,
          cmd.x1!, cmd.y1!, cmd.x2!, cmd.y2!, cmd.x!, cmd.y!,
          smoothness
        )
        for (const pt of pts) current.push(pt)
        cx = cmd.x!; cy = cmd.y!
        break
      }
      case 'Z':
        current.push([startX, startY])
        break
    }
  }

  // Don't forget the last subpath
  flush()

  return subpaths
}

function toMm(x: number, y: number, mmPerUnit: number, ox: number, oy: number): [number, number] {
  return [(x - ox) * mmPerUnit, (y - oy) * mmPerUnit]
}

function svgCoordsToMm(
  points: Array<[number, number]>,
  mmPerUnit: number,
  offsetX: number,
  offsetY: number,
  transform?: number[] | null
): Array<[number, number]> {
  return points.map(([x, y]) => {
    if (transform) {
      const [tx, ty] = applyMatrix(x, y, transform)
      return toMm(tx, ty, mmPerUnit, offsetX, offsetY)
    }
    return toMm(x, y, mmPerUnit, offsetX, offsetY)
  })
}

// ---------------------------------------------------------------------------
// SVG transform parsing — supports matrix, translate, scale, rotate, skewX/Y
// Returns [a, b, c, d, e, f] for the 2D affine matrix:
//   [ a  c  e ]
//   [ b  d  f ]
//   [ 0  0  1 ]
// ---------------------------------------------------------------------------

function parseTransform(attr: string): number[] | null {
  if (!attr || attr === 'none') return null

  let composed: number[] | null = null
  const re = /(\w+)\s*\(([^)]*)\)/g
  let m: RegExpExecArray | null

  while ((m = re.exec(attr)) !== null) {
    const fn = m[1].toLowerCase()
    const args = m[2].trim().split(/[\s,]+/).filter(Boolean).map(Number)
    let matrix: number[] | null = null

    switch (fn) {
      case 'matrix':
        if (args.length >= 6) matrix = args.slice(0, 6)
        break
      case 'translate':
        matrix = [1, 0, 0, 1, args[0] ?? 0, args[1] ?? 0]
        break
      case 'scale':
        matrix = [args[0] ?? 1, 0, 0, args[1] ?? args[0] ?? 1, 0, 0]
        break
      case 'rotate': {
        const deg = (args[0] ?? 0) * Math.PI / 180
        const cos = Math.cos(deg), sin = Math.sin(deg)
        if (args.length >= 3) {
          // rotate(angle, cx, cy) = translate(cx,cy) * rotate(angle) * translate(-cx,-cy)
          const cx = args[1], cy = args[2]
          matrix = [
            cos, sin,
            -sin, cos,
            -cx * cos + cy * sin + cx,
            -cx * sin - cy * cos + cy,
          ]
        } else {
          matrix = [cos, sin, -sin, cos, 0, 0]
        }
        break
      }
      case 'skewx': {
        const t = Math.tan((args[0] ?? 0) * Math.PI / 180)
        matrix = [1, 0, t, 1, 0, 0]
        break
      }
      case 'skewy': {
        const t = Math.tan((args[0] ?? 0) * Math.PI / 180)
        matrix = [1, t, 0, 1, 0, 0]
        break
      }
    }

    if (matrix) {
      composed = composed ? multiplyMatrices(matrix, composed) : matrix
    }
  }

  return composed
}

function multiplyMatrices(a: number[], b: number[]): number[] {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ]
}

function applyMatrix(x: number, y: number, m: number[]): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
}

function getComposedTransform(el: Element): number[] | null {
  let current: Element | null = el
  let composed: number[] | null = null

  while (current) {
    const attr = current.getAttribute('transform')
    if (attr) {
      const m = parseTransform(attr)
      if (m) {
        composed = composed ? multiplyMatrices(m, composed) : m
      }
    }
    current = current.parentElement
  }

  return composed
}

// SVG path command parser — handles all standard commands: M L H V C S Q T A Z
function parseSvgPath(d: string): Array<any> {
  const cmds: any[] = []
  const re = /([MLHVCSQTAZmlhvcsqtaz])([^MLHVCSQTAZmlhvcsqtaz]*)/g
  let m: RegExpExecArray | null
  let lastX = 0, lastY = 0
  let subpathStartX = 0, subpathStartY = 0
  // Previous cubic/quadratic control points for S and T shortcuts
  let lastCubicCP: { x: number; y: number } | null = null
  let lastQuadCP: { x: number; y: number } | null = null

  while ((m = re.exec(d)) !== null) {
    const letter = m[1]
    const type = letter.toUpperCase()
    const isRel = letter !== letter.toUpperCase()
    const nums = m[2].trim().split(/[\s,]+/).filter(Boolean).map(Number)
    const ox = isRel ? lastX : 0
    const oy = isRel ? lastY : 0

    // Only C/S maintain lastCubicCP; only Q/T maintain lastQuadCP
    if (type !== 'C' && type !== 'S') lastCubicCP = null
    if (type !== 'Q' && type !== 'T') lastQuadCP = null

    if (type === 'M') {
      for (let i = 0; i < nums.length; i += 2) {
        const x = nums[i] + ox, y = nums[i+1] + oy
        cmds.push({ type: i === 0 ? 'M' : 'L', x, y })
        if (i === 0) { subpathStartX = x; subpathStartY = y }
        lastX = x; lastY = y
      }
    } else if (type === 'L') {
      for (let i = 0; i < nums.length; i += 2) {
        const x = nums[i] + ox, y = nums[i+1] + oy
        cmds.push({ type: 'L', x, y })
        lastX = x; lastY = y
      }
    } else if (type === 'H') {
      for (let i = 0; i < nums.length; i++) {
        const x = nums[i] + ox
        cmds.push({ type: 'L', x, y: lastY })
        lastX = x
      }
    } else if (type === 'V') {
      for (let i = 0; i < nums.length; i++) {
        const y = nums[i] + oy
        cmds.push({ type: 'L', x: lastX, y })
        lastY = y
      }
    } else if (type === 'C') {
      for (let i = 0; i < nums.length; i += 6) {
        const x1 = nums[i]+ox, y1 = nums[i+1]+oy
        const x2 = nums[i+2]+ox, y2 = nums[i+3]+oy
        const x = nums[i+4]+ox, y = nums[i+5]+oy
        cmds.push({ type: 'C', x1, y1, x2, y2, x, y })
        lastCubicCP = { x: x2, y: y2 }
        lastX = x; lastY = y
      }
    } else if (type === 'S') {
      for (let i = 0; i < nums.length; i += 4) {
        // Reflect previous cubic second control point (or use current point if none)
        const x1 = lastCubicCP ? 2 * lastX - lastCubicCP.x : lastX
        const y1 = lastCubicCP ? 2 * lastY - lastCubicCP.y : lastY
        const x2 = nums[i]+ox, y2 = nums[i+1]+oy
        const x = nums[i+2]+ox, y = nums[i+3]+oy
        cmds.push({ type: 'C', x1, y1, x2, y2, x, y })
        lastCubicCP = { x: x2, y: y2 }
        lastX = x; lastY = y
      }
    } else if (type === 'Q') {
      // Quadratic bezier → convert to cubic
      for (let i = 0; i < nums.length; i += 4) {
        const qx = nums[i]+ox, qy = nums[i+1]+oy
        const x = nums[i+2]+ox, y = nums[i+3]+oy
        // Elevate degree: cp1 = p0 + 2/3*(q-p0), cp2 = p3 + 2/3*(q-p3)
        const x1 = lastX + (2/3) * (qx - lastX)
        const y1 = lastY + (2/3) * (qy - lastY)
        const x2 = x + (2/3) * (qx - x)
        const y2 = y + (2/3) * (qy - y)
        cmds.push({ type: 'C', x1, y1, x2, y2, x, y })
        lastQuadCP = { x: qx, y: qy }
        lastX = x; lastY = y
      }
    } else if (type === 'T') {
      // Smooth quadratic → reflect previous quad control point, then convert to cubic
      for (let i = 0; i < nums.length; i += 2) {
        const qx = lastQuadCP ? 2 * lastX - lastQuadCP.x : lastX
        const qy = lastQuadCP ? 2 * lastY - lastQuadCP.y : lastY
        const x = nums[i]+ox, y = nums[i+1]+oy
        const x1 = lastX + (2/3) * (qx - lastX)
        const y1 = lastY + (2/3) * (qy - lastY)
        const x2 = x + (2/3) * (qx - x)
        const y2 = y + (2/3) * (qy - y)
        cmds.push({ type: 'C', x1, y1, x2, y2, x, y })
        lastQuadCP = { x: qx, y: qy }
        lastX = x; lastY = y
      }
    } else if (type === 'A') {
      for (let i = 0; i < nums.length; i += 7) {
        const rx = Math.abs(nums[i]), ry = Math.abs(nums[i+1])
        const xRot = nums[i+2]
        const largeArc = nums[i+3] !== 0
        const sweep = nums[i+4] !== 0
        const x = nums[i+5]+ox, y = nums[i+6]+oy
        const arcs = arcToCubics(lastX, lastY, rx, ry, xRot, largeArc, sweep, x, y)
        for (const a of arcs) {
          cmds.push({ type: 'C', x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2, x: a.x, y: a.y })
        }
        lastX = x; lastY = y
      }
    } else if (type === 'Z') {
      cmds.push({ type: 'Z' })
      // Per SVG spec: after Z the current point is the subpath start
      lastX = subpathStartX; lastY = subpathStartY
    }
  }
  return cmds
}

// Convert SVG elliptical arc to cubic bezier segments
function arcToCubics(
  x0: number, y0: number,
  rx: number, ry: number,
  xRotDeg: number,
  largeArc: boolean,
  sweep: boolean,
  x1: number, y1: number
): Array<{ x1: number; y1: number; x2: number; y2: number; x: number; y: number }> {
  if (rx === 0 || ry === 0 || (x0 === x1 && y0 === y1)) {
    return [{ x1: x1, y1: y1, x2: x1, y2: y1, x: x1, y: y1 }]
  }

  const phi = xRotDeg * Math.PI / 180
  const cosPhi = Math.cos(phi), sinPhi = Math.sin(phi)

  // Step 1: midpoint in rotated frame
  const dx = (x0 - x1) / 2, dy = (y0 - y1) / 2
  const x1p =  cosPhi * dx + sinPhi * dy
  const y1p = -sinPhi * dx + cosPhi * dy

  // Step 2: ensure radii are large enough
  let rxSq = rx * rx, rySq = ry * ry
  const x1pSq = x1p * x1p, y1pSq = y1p * y1p
  const lambda = x1pSq / rxSq + y1pSq / rySq
  if (lambda > 1) {
    const s = Math.sqrt(lambda)
    rx *= s; ry *= s
    rxSq = rx * rx; rySq = ry * ry
  }

  // Step 3: compute center in rotated frame
  const num = Math.max(0, rxSq * rySq - rxSq * y1pSq - rySq * x1pSq)
  const den = rxSq * y1pSq + rySq * x1pSq
  const sq = (largeArc === sweep ? -1 : 1) * Math.sqrt(num / den)
  const cxp = sq * rx * y1p / ry
  const cyp = -sq * ry * x1p / rx

  // Step 4: center in user space
  const cx = cosPhi * cxp - sinPhi * cyp + (x0 + x1) / 2
  const cy = sinPhi * cxp + cosPhi * cyp + (y0 + y1) / 2

  // Signed angle between two vectors
  function vecAngle(ux: number, uy: number, vx: number, vy: number): number {
    const dot = ux * vx + uy * vy
    const len = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy)
    const a = Math.acos(Math.max(-1, Math.min(1, dot / len)))
    return (ux * vy - uy * vx < 0) ? -a : a
  }

  const theta1 = vecAngle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
  let dtheta = vecAngle(
    (x1p - cxp) / rx, (y1p - cyp) / ry,
    (-x1p - cxp) / rx, (-y1p - cyp) / ry
  )
  if (!sweep && dtheta > 0) dtheta -= 2 * Math.PI
  if (sweep && dtheta < 0) dtheta += 2 * Math.PI

  // Split into ≤90° segments and convert each to a cubic bezier
  const n = Math.max(1, Math.ceil(Math.abs(dtheta) / (Math.PI / 2)))
  const result: Array<{ x1: number; y1: number; x2: number; y2: number; x: number; y: number }> = []

  for (let i = 0; i < n; i++) {
    const t1 = theta1 + (i / n) * dtheta
    const t2 = theta1 + ((i + 1) / n) * dtheta
    const dt = t2 - t1
    // de Casteljau approximation factor for this arc segment
    const alpha = (Math.sin(dt) * (Math.sqrt(4 + 3 * Math.pow(Math.tan(dt / 2), 2)) - 1)) / 3

    const pt = (t: number): [number, number] => {
      const cosT = Math.cos(t), sinT = Math.sin(t)
      return [
        cx + cosPhi * rx * cosT - sinPhi * ry * sinT,
        cy + sinPhi * rx * cosT + cosPhi * ry * sinT,
      ]
    }
    const dpt = (t: number): [number, number] => {
      const cosT = Math.cos(t), sinT = Math.sin(t)
      return [
        -cosPhi * rx * sinT - sinPhi * ry * cosT,
        -sinPhi * rx * sinT + cosPhi * ry * cosT,
      ]
    }

    const [p1x, p1y] = pt(t1)
    const [p2x, p2y] = pt(t2)
    const [d1x, d1y] = dpt(t1)
    const [d2x, d2y] = dpt(t2)

    result.push({
      x1: p1x + alpha * d1x, y1: p1y + alpha * d1y,
      x2: p2x - alpha * d2x, y2: p2y - alpha * d2y,
      x: p2x, y: p2y,
    })
  }

  return result
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
