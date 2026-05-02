import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import type { TraceParams, TraceResult, PathList } from '../types'
import { DEFAULT_TRACE_PARAMS } from '../types'

export function useImport() {
  const [file, setFile] = useState<File | null>(null)
  const [params, setParams] = useState<TraceParams>(DEFAULT_TRACE_PARAMS)
  const [traceResult, setTraceResult] = useState<TraceResult | null>(null)
  const [traceLoading, setTraceLoading] = useState(false)
  const [traceError, setTraceError] = useState<string | null>(null)

  const paramsKey = JSON.stringify(params)

  useEffect(() => {
    if (!file) return
    const timer = setTimeout(async () => {
      setTraceLoading(true)
      setTraceError(null)
      try {
        const result = await api.traceImage(file, params)
        setTraceResult(result)
      } catch (e: any) {
        setTraceError(e?.response?.data?.detail ?? 'Tracing fehlgeschlagen')
      } finally {
        setTraceLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [file, paramsKey])

  const accept = useCallback(
    (enabledColors?: Set<string>): PathList | null => {
      if (!traceResult) return null
      if (params.mode === 'silhouette' || !enabledColors) {
        return traceResult.paths
      }
      return traceResult.layers
        .filter(l => enabledColors.has(l.color))
        .flatMap(l => l.paths)
    },
    [traceResult, params.mode],
  )

  const reset = useCallback(() => {
    setFile(null)
    setTraceResult(null)
    setTraceError(null)
  }, [])

  return {
    file,
    setFile,
    params,
    setParams,
    traceResult,
    traceLoading,
    traceError,
    accept,
    reset,
    _setResultForTest: setTraceResult,
  }
}
