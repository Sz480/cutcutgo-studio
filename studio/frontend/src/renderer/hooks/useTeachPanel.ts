import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../api/client'
import type { PositionResponse } from '../types'

export const STEP_SIZES = [0.1, 1, 5, 10] as const
export type StepSize = typeof STEP_SIZES[number]

export interface TeachPanelState {
  position: PositionResponse
  stepMm: StepSize
  busy: boolean
  setStepMm: (s: StepSize) => void
  jog: (dx: number, dy: number) => void
  home: () => void
  setTool: (action: 'up' | 'pen' | 'blade') => void
  resetXY: () => void
}

const INITIAL_POSITION: PositionResponse = { x_mm: 0, y_mm: 0, tool_state: 'up' }

export function useTeachPanel(deviceConnected: boolean): TeachPanelState {
  const [position, setPosition] = useState<PositionResponse>(INITIAL_POSITION)
  const [stepMm, setStepMm] = useState<StepSize>(1)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  // Poll position every 500 ms while connected
  useEffect(() => {
    if (!deviceConnected) {
      setPosition(INITIAL_POSITION)
      return
    }
    const id = setInterval(async () => {
      try {
        const pos = await api.getPosition()
        setPosition(pos)
      } catch { /* device may not be ready */ }
    }, 500)
    return () => clearInterval(id)
  }, [deviceConnected])

  const withBusy = useCallback(async (fn: () => Promise<PositionResponse>) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      const result = await fn()
      setPosition(result)
    } catch { /* errors surface as device disconnected state */ }
    finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [])

  const jog = useCallback((dx: number, dy: number) => {
    withBusy(() => api.jogDevice(dx, dy))
  }, [withBusy])

  const home = useCallback(() => {
    withBusy(() => api.homeDevice())
  }, [withBusy])

  const setTool = useCallback((action: 'up' | 'pen' | 'blade') => {
    withBusy(() => api.setTool(action))
  }, [withBusy])

  const resetXY = useCallback(() => {
    withBusy(() => api.resetPosition())
  }, [withBusy])

  return { position, stepMm, busy, setStepMm, jog, home, setTool, resetXY }
}
