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

// Tool-holder offsets: distance from GRBL home to the top-left corner of the mat.
// Pen (Clamp B, left holder): X=38, Y=44 measured empirically with Manual Mode.
// Blade (ATS, right holder): X=0, Y=0 — home position is already the cut origin.
export const TOOL_OFFSETS: Record<'blade' | 'pen', { x: number; y: number }> = {
  blade: { x: 0,  y: 0  },
  pen:   { x: 38, y: 44 },
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
  x_offset: TOOL_OFFSETS.blade.x,
  y_offset: TOOL_OFFSETS.blade.y,
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

export type TraceMode = 'silhouette' | 'color'

export interface TraceParams {
  mode: TraceMode
  threshold: number       // 0–255, silhouette mode
  num_colors: number      // 2–8, color mode
  smoothness: number      // 0.0–10.0
  media_width_mm: number  // fit image to this width
}

export interface ColorLayer {
  color: string   // CSS hex e.g. "#ff0000"
  paths: PathList
}

export interface TraceResult {
  paths:  PathList
  layers: ColorLayer[]
}

export interface PositionResponse {
  x_mm: number
  y_mm: number
  tool_state: 'up' | 'pen' | 'blade'
}

export const DEFAULT_TRACE_PARAMS: TraceParams = {
  mode: 'silhouette',
  threshold: 128,
  num_colors: 4,
  smoothness: 1.0,
  media_width_mm: 304.8,
}

export interface MatSize {
  label: string
  widthMm: number
  heightMm: number
}

export const MAT_SIZES = [
  { label: '12" × 12" (304.8 × 304.8 mm)', widthMm: 304.8, heightMm: 304.8 },
  { label: '12" × 24" (304.8 × 609.6 mm)', widthMm: 304.8, heightMm: 609.6 },
] as const satisfies readonly MatSize[]
