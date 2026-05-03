import axios from 'axios'
import type {
  CutJob, DeviceStatus, JobResponse, MediaPreset, TraceParams, TraceResult, PositionResponse
} from '../types'

const BASE = 'http://127.0.0.1:8765'

export const api = {
  async health(): Promise<{ status: string; version: string }> {
    const res = await axios.get(`${BASE}/api/health`)
    return res.data
  },

  async deviceStatus(): Promise<DeviceStatus> {
    const res = await axios.get(`${BASE}/api/device/status`)
    return res.data
  },

  async connectDevice(): Promise<DeviceStatus> {
    const res = await axios.post(`${BASE}/api/device/connect`)
    return res.data
  },

  async disconnectDevice(): Promise<void> {
    await axios.post(`${BASE}/api/device/disconnect`)
  },

  async listMedia(): Promise<MediaPreset[]> {
    const res = await axios.get(`${BASE}/api/media/`)
    return res.data
  },

  async previewJob(job: CutJob): Promise<JobResponse> {
    const res = await axios.post(`${BASE}/api/job/preview`, job)
    return res.data
  },

  async sendJob(job: CutJob, dryRun = false): Promise<JobResponse> {
    const res = await axios.post(`${BASE}/api/job/send?dry_run=${dryRun}`, job)
    return res.data
  },

  async cancelJob(): Promise<void> {
    await axios.post(`${BASE}/api/job/cancel`)
  },

  async traceImage(file: File, params: TraceParams): Promise<TraceResult> {
    const form = new FormData()
    form.append('file', file)
    form.append('params', JSON.stringify(params))
    const res = await axios.post(`${BASE}/api/import/trace`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return res.data
  },

  async jogDevice(dx_mm: number, dy_mm: number): Promise<PositionResponse> {
    const res = await axios.post(`${BASE}/api/device/jog`, { dx_mm, dy_mm })
    return res.data
  },

  async homeDevice(): Promise<PositionResponse> {
    const res = await axios.post(`${BASE}/api/device/home`)
    return res.data
  },

  async setTool(action: 'up' | 'pen' | 'blade'): Promise<PositionResponse> {
    const res = await axios.post(`${BASE}/api/device/tool`, { action })
    return res.data
  },

  async getPosition(): Promise<PositionResponse> {
    const res = await axios.get(`${BASE}/api/device/position`)
    return res.data
  },

  async resetPosition(): Promise<PositionResponse> {
    const res = await axios.post(`${BASE}/api/device/reset-position`)
    return res.data
  },
}
