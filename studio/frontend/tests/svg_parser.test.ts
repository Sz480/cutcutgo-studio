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
})
