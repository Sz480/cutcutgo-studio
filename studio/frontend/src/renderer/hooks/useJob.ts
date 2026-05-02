import { useState, useCallback } from 'react'
import { api } from '../api/client'
import type { CutJob, JobResponse, PathList } from '../types'

type JobState = 'idle' | 'previewing' | 'sending' | 'done' | 'error'

export function useJob() {
  const [state, setState] = useState<JobState>('idle')
  const [result, setResult] = useState<JobResponse | null>(null)
  const [previewPaths, setPreviewPaths] = useState<PathList | null>(null)
  const [error, setError] = useState<string | null>(null)

  const preview = useCallback(async (job: CutJob) => {
    setState('previewing')
    setError(null)
    try {
      const res = await api.previewJob(job)
      setResult(res)
      setPreviewPaths(res.optimized_paths ?? null)
      setState('done')
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Preview failed')
      setState('error')
    }
  }, [])

  const send = useCallback(async (job: CutJob, dryRun = false) => {
    setState('sending')
    setError(null)
    try {
      const res = await api.sendJob(job, dryRun)
      setResult(res)
      setState('done')
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Send failed')
      setState('error')
    }
  }, [])

  const cancel = useCallback(async () => {
    await api.cancelJob()
    setState('idle')
  }, [])

  const reset = useCallback(() => {
    setState('idle')
    setResult(null)
    setPreviewPaths(null)
    setError(null)
  }, [])

  return { state, result, previewPaths, error, preview, send, cancel, reset }
}
