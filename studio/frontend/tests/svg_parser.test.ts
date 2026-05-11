// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { parseSvgToMmPaths } from '../src/renderer/svg/parser'

// 10mm x 10mm square: viewBox 0 0 37.795 37.795 at 96dpi
// 37.795px = 10mm (at 96 DPI: 1mm = 3.7795px)
const SQUARE_SVG = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="37.795px" height="37.795px"
     viewBox="0 0 37.795 37.795">
  <rect x="0" y="0" width="37.795" height="37.795"/>
</svg>`

// 10mm diameter circle
const CIRCLE_SVG = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="37.795px" height="37.795px"
     viewBox="0 0 37.795 37.795">
  <circle cx="18.898" cy="18.898" r="18.898"/>
</svg>`

// Helper: wrap path data in a 100x100 viewBox SVG (1 unit = 1 mm for convenience)
function svgWithPath(d: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100">
  <path d="${d}"/>
</svg>`
}

describe('parseSvgToMmPaths', () => {
  it('extracts at least one path from a rect', () => {
    const { paths } = parseSvgToMmPaths(SQUARE_SVG)
    expect(paths.length).toBeGreaterThan(0)
  })

  it('rect corners are near 0 and 10 mm', () => {
    const { paths } = parseSvgToMmPaths(SQUARE_SVG)
    const allX = paths.flat().map(pt => pt[0])
    const allY = paths.flat().map(pt => pt[1])
    expect(Math.min(...allX)).toBeCloseTo(0, 0)
    expect(Math.max(...allX)).toBeCloseTo(10, 0)
    expect(Math.min(...allY)).toBeCloseTo(0, 0)
    expect(Math.max(...allY)).toBeCloseTo(10, 0)
  })

  it('extracts paths from a circle', () => {
    const { paths } = parseSvgToMmPaths(CIRCLE_SVG)
    expect(paths.length).toBeGreaterThan(0)
  })

  it('returns empty array for SVG with no shapes', () => {
    const empty = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>`
    expect(parseSvgToMmPaths(empty).paths).toEqual([])
  })

  it('H command: horizontal lineto moves x only', () => {
    // M 0 10 H 50 → line from (0,10) to (50,10); normalized → (0,0) to (50,0)
    const { paths } = parseSvgToMmPaths(svgWithPath('M 0 10 H 50'))
    expect(paths.length).toBe(1)
    const pts = paths[0]
    expect(pts.length).toBe(2)
    // After normalization both y values shift to 0; x displacement preserved
    expect(pts[0][0]).toBeCloseTo(0)
    expect(pts[0][1]).toBeCloseTo(0)
    expect(pts[1][0]).toBeCloseTo(50)
    expect(pts[1][1]).toBeCloseTo(0)
  })

  it('V command: vertical lineto moves y only', () => {
    // M 20 0 V 60 → line from (20,0) to (20,60); normalized → (0,0) to (0,60)
    const { paths } = parseSvgToMmPaths(svgWithPath('M 20 0 V 60'))
    expect(paths.length).toBe(1)
    const pts = paths[0]
    expect(pts.length).toBe(2)
    // After normalization x shifts to 0; y displacement preserved
    expect(pts[0][0]).toBeCloseTo(0)
    expect(pts[0][1]).toBeCloseTo(0)
    expect(pts[1][0]).toBeCloseTo(0)
    expect(pts[1][1]).toBeCloseTo(60)
  })

  it('Q command: quadratic bezier reaches endpoint', () => {
    // M 0 0 Q 50 100 100 0 → endpoint must be at (100,0)
    const { paths } = parseSvgToMmPaths(svgWithPath('M 0 0 Q 50 100 100 0'))
    expect(paths.length).toBe(1)
    const pts = paths[0]
    const last = pts[pts.length - 1]
    expect(last[0]).toBeCloseTo(100, 1)
    expect(last[1]).toBeCloseTo(0, 1)
  })

  it('S command: smooth cubic bezier reaches endpoint', () => {
    // M 0 0 C 10 -10 90 -10 100 0 S 190 10 200 0 → endpoint at (200,0)
    // Curve dips to negative y; after normalization start and end both shift by the same amount.
    const { paths } = parseSvgToMmPaths(svgWithPath('M 0 0 C 10 -10 90 -10 100 0 S 190 10 200 0'))
    expect(paths.length).toBe(1)
    const pts = paths[0]
    const first = pts[0]
    const last = pts[pts.length - 1]
    expect(last[0]).toBeCloseTo(200, 1)
    // Start and end share the same pre-normalization y=0, so they end up at the same y after shift
    expect(last[1]).toBeCloseTo(first[1], 1)
  })

  it('A command: arc reaches endpoint', () => {
    // Quarter circle arc from (10,0) to (0,10) with r=10
    const { paths } = parseSvgToMmPaths(svgWithPath('M 10 0 A 10 10 0 0 1 0 10'))
    expect(paths.length).toBe(1)
    const pts = paths[0]
    const last = pts[pts.length - 1]
    expect(last[0]).toBeCloseTo(0, 1)
    expect(last[1]).toBeCloseTo(10, 1)
  })

  it('relative m after Z uses subpath-start as reference, not last drawn point', () => {
    // Two separate sub-paths: first from (0,0)→(10,0), second starting 20 units right of
    // the FIRST subpath start (per SVG spec Z resets current point to subpath start).
    // d="M 0 0 L 10 0 Z m 20 0 L 30 0"
    //   sub1: M(0,0) → L(10,0) → Z  (current point resets to 0,0)
    //   sub2: m 20 0 → absolute (0+20, 0+0)=(20,0), L(30,0)
    const { paths } = parseSvgToMmPaths(svgWithPath('M 0 0 L 10 0 Z m 20 0 L 30 0'))
    // Both subpaths should be captured; after normalization minX=0
    const allX = paths.flat().map(pt => pt[0])
    // Second subpath starts at x=20 (before normalization); first at x=0.
    // Max x should be 30.
    expect(Math.max(...allX)).toBeCloseTo(30, 0)
  })
})

describe('parseSvgToMmPaths — <use> support', () => {
  it('resolves <use href="#id"> and returns paths from the referenced element', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" viewBox="0 0 100 100">
      <defs>
        <rect id="box" x="10" y="10" width="20" height="20"/>
      </defs>
      <use href="#box"/>
    </svg>`
    const { paths } = parseSvgToMmPaths(svg)
    expect(paths.length).toBeGreaterThan(0)
  })

  it('resolves <use xlink:href="#id"> (legacy)', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100mm" viewBox="0 0 100 100">
      <defs>
        <circle id="dot" cx="50" cy="50" r="10"/>
      </defs>
      <use xlink:href="#dot"/>
    </svg>`
    const { paths } = parseSvgToMmPaths(svg)
    expect(paths.length).toBeGreaterThan(0)
  })

  it('calls onWarning when <text> is present', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" viewBox="0 0 100 100">
      <text x="10" y="20">Hello</text>
    </svg>`
    const warnings: string[] = []
    parseSvgToMmPaths(svg, 0.05, (msg) => warnings.push(msg))
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings[0].toLowerCase()).toContain('text')
  })
})

describe('parseSvgToMmPaths — transform support', () => {
  it('applies translate transform from path attribute', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" viewBox="0 0 100 100">
      <path transform="translate(20,30)" d="M 0 0 L 10 0"/>
    </svg>`
    const { paths } = parseSvgToMmPaths(svg)
    expect(paths.length).toBe(1)
    const pts = paths[0]
    // After normalization (minX=20, minY=30): points at (0,0) and (10,0)
    expect(pts[0][0]).toBeCloseTo(0)
    expect(pts[0][1]).toBeCloseTo(0)
    expect(pts[1][0]).toBeCloseTo(10)
    expect(pts[1][1]).toBeCloseTo(0)
  })

  it('applies matrix transform equivalent to translate', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" viewBox="0 0 100 100">
      <path transform="matrix(1,0,0,1,50,0)" d="M 0 0 L 10 0"/>
    </svg>`
    const { paths } = parseSvgToMmPaths(svg)
    expect(paths.length).toBe(1)
    const pts = paths[0]
    const allX = pts.map(p => p[0])
    expect(Math.max(...allX) - Math.min(...allX)).toBeCloseTo(10, 0)
    expect(Math.min(...allX)).toBeCloseTo(0, 0)
  })

  it('composes nested group and path transforms', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" viewBox="0 0 100 100">
      <g transform="translate(10,20)">
        <path transform="scale(2)" d="M 0 0 L 5 0"/>
      </g>
    </svg>`
    const { paths } = parseSvgToMmPaths(svg)
    expect(paths.length).toBe(1)
    const pts = paths[0]
    const allX = pts.map(p => p[0])
    const allY = pts.map(p => p[1])
    // Local (0,0)→scale2→(0,0)→translate(10,20)→(10,20)
    // Local (5,0)→scale2→(10,0)→translate(10,20)→(20,20)
    // After normalization: (0,0)→(10,0), width=10, all Y=0
    expect(Math.max(...allX) - Math.min(...allX)).toBeCloseTo(10, 0)
    expect(Math.min(...allX)).toBeCloseTo(0, 0)
    expect(Math.max(...allY) - Math.min(...allY)).toBeCloseTo(0, 0)
  })

  it('handles multiple transformed paths like Inkscape text-to-path output', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" viewBox="0 0 100 100">
      <path transform="translate(10,30)" d="M 0 0 L 0 20 M 0 10 L 10 10 M 10 0 L 10 20"/>
      <path transform="translate(24,30)" d="M 0 0 L 0 20"/>
      <path transform="translate(36,30)" d="M 0 20 Q 2 25 4 20"/>
    </svg>`
    const { paths } = parseSvgToMmPaths(svg)
    expect(paths.length).toBe(5)
    const allX = paths.flat().map(p => p[0])
    const minX = Math.min(...allX)
    expect(minX).toBeCloseTo(0, 0)
    expect(Math.max(...allX)).toBeGreaterThan(20)
  })

  it('handles paths without any transforms (regression)', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" viewBox="0 0 100 100">
      <path d="M 0 0 L 50 0 L 50 50 L 0 50 Z"/>
    </svg>`
    const { paths } = parseSvgToMmPaths(svg)
    expect(paths.length).toBe(1)
    const allX = paths.flat().map(p => p[0])
    const allY = paths.flat().map(p => p[1])
    expect(Math.max(...allX) - Math.min(...allX)).toBeCloseTo(50, 0)
    expect(Math.max(...allY) - Math.min(...allY)).toBeCloseTo(50, 0)
  })

  it('applies <use> x/y with referenced element transform', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" viewBox="0 0 100 100">
      <defs>
        <rect id="box" x="0" y="0" width="10" height="10"/>
      </defs>
      <use href="#box" x="20" y="30"/>
    </svg>`
    const { paths } = parseSvgToMmPaths(svg)
    expect(paths.length).toBeGreaterThan(0)
    const allX = paths.flat().map(p => p[0])
    const allY = paths.flat().map(p => p[1])
    expect(Math.max(...allX) - Math.min(...allX)).toBeCloseTo(10, 0)
    expect(Math.max(...allY) - Math.min(...allY)).toBeCloseTo(10, 0)
  })
})
