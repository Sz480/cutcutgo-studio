import { describe, it, expect, vi, beforeEach } from 'vitest'
import axios from 'axios'
import { api } from '../src/renderer/api/client'

vi.mock('axios')
const mockedAxios = vi.mocked(axios, true)

describe('api.health', () => {
  beforeEach(() => vi.resetAllMocks())

  it('calls GET /api/health', async () => {
    mockedAxios.get = vi.fn().mockResolvedValue({ data: { status: 'ok', version: '1.0.0' } })
    const result = await api.health()
    expect(mockedAxios.get).toHaveBeenCalledWith('http://127.0.0.1:8765/api/health')
    expect(result.status).toBe('ok')
  })
})

describe('api.deviceStatus', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns DeviceStatus from GET /api/device/status', async () => {
    mockedAxios.get = vi.fn().mockResolvedValue({
      data: { connected: true, status: 'ready', version: 'CutcutGo 1.0', port: 'COM3' }
    })
    const result = await api.deviceStatus()
    expect(result.connected).toBe(true)
    expect(result.status).toBe('ready')
  })
})

describe('api.sendJob', () => {
  beforeEach(() => vi.resetAllMocks())

  it('posts to /api/job/send and returns JobResponse', async () => {
    mockedAxios.post = vi.fn().mockResolvedValue({
      data: { success: true, message: 'Job complete', bbox: {} }
    })
    const result = await api.sendJob(
      { paths: [[[0, 0], [10, 0]]], settings: {} as any },
      false
    )
    expect(result.success).toBe(true)
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'http://127.0.0.1:8765/api/job/send?dry_run=false',
      expect.any(Object)
    )
  })
})
