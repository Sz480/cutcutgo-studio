// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'

// Test the path scaling logic used in handleSend/handlePreview
function scalePaths(
  paths: Array<Array<[number, number]>>,
  scale: number,
): Array<Array<[number, number]>> {
  return paths.map(p => p.map(([x, y]) => [x * scale, y * scale] as [number, number]))
}

// Test the scale clamping logic used in handleScaleChange
function clampScale(s: number): number {
  return Math.max(0.1, Math.min(5.0, Math.round(s * 100) / 100))
}

// Test bounding box computation
function computeBbox(paths: Array<Array<[number, number]>>): { x: number; y: number; w: number; h: number } | null {
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

describe('scalePaths', () => {
  it('scales paths by the given factor', () => {
    const paths: Array<Array<[number, number]>> = [[[0, 0], [10, 0], [10, 10]]]
    const result = scalePaths(paths, 2.0)
    expect(result[0][0]).toEqual([0, 0])
    expect(result[0][1]).toEqual([20, 0])
    expect(result[0][2]).toEqual([20, 20])
  })

  it('handles scale = 1.0 as identity', () => {
    const paths: Array<Array<[number, number]>> = [[[5, 5], [15, 15]]]
    expect(scalePaths(paths, 1.0)).toEqual(paths)
  })

  it('handles scale < 1', () => {
    const paths: Array<Array<[number, number]>> = [[[0, 0], [10, 10]]]
    const result = scalePaths(paths, 0.5)
    expect(result[0][1]).toEqual([5, 5])
  })

  it('handles multiple subpaths', () => {
    const paths: Array<Array<[number, number]>> = [[[0, 0], [10, 0]], [[5, 5], [15, 5]]]
    const result = scalePaths(paths, 2.0)
    expect(result).toHaveLength(2)
    expect(result[0][1]).toEqual([20, 0])
    expect(result[1][1]).toEqual([30, 10])
  })

  it('handles empty paths', () => {
    expect(scalePaths([], 2.0)).toEqual([])
  })
})

describe('clampScale', () => {
  it('returns value within range unchanged', () => {
    expect(clampScale(1.0)).toBe(1.0)
    expect(clampScale(0.5)).toBe(0.5)
    expect(clampScale(3.75)).toBe(3.75)
  })

  it('clamps below minimum (0.1 = 10%)', () => {
    expect(clampScale(0.05)).toBe(0.1)
    expect(clampScale(-0.5)).toBe(0.1)
  })

  it('clamps above maximum (5.0 = 500%)', () => {
    expect(clampScale(6.0)).toBe(5.0)
    expect(clampScale(10.0)).toBe(5.0)
  })

  it('rounds to 2 decimal places', () => {
    expect(clampScale(1.234)).toBe(1.23)
    expect(clampScale(1.235)).toBe(1.24)
  })
})

describe('computeBbox', () => {
  it('returns null for empty input', () => {
    expect(computeBbox([])).toBeNull()
  })

  it('computes bounding box for a single path', () => {
    const bbox = computeBbox([[[0, 0], [10, 5], [5, 10]]])
    expect(bbox).toEqual({ x: 0, y: 0, w: 10, h: 10 })
  })

  it('computes union bbox across multiple paths', () => {
    const bbox = computeBbox([
      [[0, 0], [10, 0]],
      [[5, 5], [20, 15]],
    ])
    expect(bbox).toEqual({ x: 0, y: 0, w: 20, h: 15 })
  })

  it('handles paths not starting at origin', () => {
    const bbox = computeBbox([[[10, 20], [30, 50]]])
    expect(bbox).toEqual({ x: 10, y: 20, w: 20, h: 30 })
  })
})
