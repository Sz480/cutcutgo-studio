// Coordinates always in millimetres
export type Point = [number, number]   // [x_mm, y_mm]
export type Path = Point[]
export type PathList = Path[]

export interface CutSettings {
  media: number           // 1–11
  tool: 'blade' | 'pen'
  speed: number           // 0–10; 0 = media default
  pressure: number        // 0–18; 0 = media default
  depth: number           // -1 = media default
  blade_diameter: number
  multipass: number       // 1–8
  overcut: number
  strategy: 'mintravel' | 'mintravelfull' | 'matfree' | 'zorder'
  x_offset: number
  y_offset: number
  media_width_mm: number
  media_height_mm: number
  sharpen_corners: boolean
  reverse_toggle: boolean
  sw_clipping: boolean
}

export const DEFAULT_SETTINGS: CutSettings = {
  media: 1,
  tool: 'blade',
  speed: 3,
  pressure: 0,
  depth: -1,
  blade_diameter: 0.9,
  multipass: 1,
  overcut: 0.5,
  strategy: 'mintravel',
  x_offset: 0,
  y_offset: 0,
  media_width_mm: 304.8,
  media_height_mm: 609.6,
  sharpen_corners: false,
  reverse_toggle: false,
  sw_clipping: true,
}

export interface CutJob {
  paths: PathList
  settings: CutSettings
}

export interface JobResponse {
  success: boolean
  message: string
  bbox?: Record<string, number>
  optimized_paths?: PathList
}

export interface DeviceStatus {
  connected: boolean
  status: 'ready' | 'moving' | 'unloaded' | 'not_found' | 'error'
  version?: string
  port?: string
}

export interface MediaPreset {
  id: number
  name: string
  default_pressure: number
  default_clearance: number
}
