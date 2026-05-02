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
    const paths = parseSvgToMmPaths(SQUARE_SVG)
    expect(paths.length).toBeGreaterThan(0)
  })

  it('rect corners are near 0 and 10 mm', () => {
    const paths = parseSvgToMmPaths(SQUARE_SVG)
    const allX = paths.flat().map(pt => pt[0])
    const allY = paths.flat().map(pt => pt[1])
    expect(Math.min(...allX)).toBeCloseTo(0, 0)
    expect(Math.max(...allX)).toBeCloseTo(10, 0)
    expect(Math.min(...allY)).toBeCloseTo(0, 0)
    expect(Math.max(...allY)).toBeCloseTo(10, 0)
  })

  it('extracts paths from a circle', () => {
    const paths = parseSvgToMmPaths(CIRCLE_SVG)
    expect(paths.length).toBeGreaterThan(0)
  })

  it('returns empty array for SVG with no shapes', () => {
    const empty = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>`
    expect(parseSvgToMmPaths(empty)).toEqual([])
  })

  it('H command: horizontal lineto moves x only', () => {
    // M 0 10 H 50 → line from (0,10) to (50,10)
    const paths = parseSvgToMmPaths(svgWithPath('M 0 10 H 50'))
    expect(paths.length).toBe(1)
    const pts = paths[0]
    expect(pts.length).toBe(2)
    expect(pts[0][0]).toBeCloseTo(0)
    expect(pts[0][1]).toBeCloseTo(10)
    expect(pts[1][0]).toBeCloseTo(50)
    expect(pts[1][1]).toBeCloseTo(10)
  })

  it('V command: vertical lineto moves y only', () => {
    // M 20 0 V 60 → line from (20,0) to (20,60)
    const paths = parseSvgToMmPaths(svgWithPath('M 20 0 V 60'))
    expect(paths.length).toBe(1)
    const pts = paths[0]
    expect(pts.length).toBe(2)
    expect(pts[0][0]).toBeCloseTo(20)
    expect(pts[0][1]).toBeCloseTo(0)
    expect(pts[1][0]).toBeCloseTo(20)
    expect(pts[1][1]).toBeCloseTo(60)
  })

  it('Q command: quadratic bezier reaches endpoint', () => {
    // M 0 0 Q 50 100 100 0 → endpoint must be at (100,0)
    const paths = parseSvgToMmPaths(svgWithPath('M 0 0 Q 50 100 100 0'))
    expect(paths.length).toBe(1)
    const pts = paths[0]
    const last = pts[pts.length - 1]
    expect(last[0]).toBeCloseTo(100, 1)
    expect(last[1]).toBeCloseTo(0, 1)
  })

  it('S command: smooth cubic bezier reaches endpoint', () => {
    // M 0 0 C 10 -10 90 -10 100 0 S 190 10 200 0 → endpoint at (200,0)
    const paths = parseSvgToMmPaths(svgWithPath('M 0 0 C 10 -10 90 -10 100 0 S 190 10 200 0'))
    expect(paths.length).toBe(1)
    const pts = paths[0]
    const last = pts[pts.length - 1]
    expect(last[0]).toBeCloseTo(200, 1)
    expect(last[1]).toBeCloseTo(0, 1)
  })

  it('A command: arc reaches endpoint', () => {
    // Quarter circle arc from (10,0) to (0,10) with r=10
    const paths = parseSvgToMmPaths(svgWithPath('M 10 0 A 10 10 0 0 1 0 10'))
    expect(paths.length).toBe(1)
    const pts = paths[0]
    const last = pts[pts.length - 1]
    expect(last[0]).toBeCloseTo(0, 1)
    expect(last[1]).toBeCloseTo(10, 1)
  })
})
