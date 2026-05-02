import axios from 'axios'
import type {
  CutJob, DeviceStatus, JobResponse, MediaPreset
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
}
