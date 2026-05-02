// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useImport } from '../src/renderer/hooks/useImport'
import { api } from '../src/renderer/api/client'

vi.mock('../src/renderer/api/client')

const MOCK_RESULT = {
  paths: [[[0, 0], [10, 10]]],
  layers: [],
}

describe('useImport', () => {
  beforeEach(() => vi.clearAllMocks())

  it('starts with no result and not loading', () => {
    const { result } = renderHook(() => useImport())
    expect(result.current.traceResult).toBeNull()
    expect(result.current.traceLoading).toBe(false)
  })

  it('accept() with no result returns null', () => {
    const { result } = renderHook(() => useImport())
    expect(result.current.accept()).toBeNull()
  })

  it('accept() returns all paths in silhouette mode', () => {
    const { result } = renderHook(() => useImport())
    act(() => {
      result.current._setResultForTest(MOCK_RESULT)
    })
    const paths = result.current.accept()
    expect(paths).toEqual(MOCK_RESULT.paths)
  })
})
