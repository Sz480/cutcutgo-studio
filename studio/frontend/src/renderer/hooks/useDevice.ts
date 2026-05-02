import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import type { DeviceStatus } from '../types'

const POLL_INTERVAL_MS = 2000

export function useDevice() {
  const [status, setStatus] = useState<DeviceStatus>({
    connected: false,
    status: 'not_found',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const s = await api.deviceStatus()
      setStatus(s)
      setError(null)
    } catch {
      setError('Backend not reachable')
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [refresh])

  const connect = useCallback(async () => {
    setLoading(true)
    try {
      const s = await api.connectDevice()
      setStatus(s)
      setError(null)
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Connection failed')
    } finally {
      setLoading(false)
    }
  }, [])

  const disconnect = useCallback(async () => {
    await api.disconnectDevice()
    await refresh()
  }, [refresh])

  return { status, loading, error, connect, disconnect, refresh }
}
