# CutCutGo-Studio Frontend – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a cross-platform Electron desktop application (`studio/frontend/`) named "CutCutGo-Studio" that lets users import SVG files, visualize and position designs on a virtual cutting mat, configure cut settings (media, tool, speed, pressure), preview the optimised cut path, and dispatch jobs to the CutCutGo device via the Python backend API.

**Architecture:** Electron 31 app built with `electron-vite` (Vite 5 + React 18 + TypeScript). The main process spawns the Python backend (`python -m studio.backend.main`) as a child process on a fixed port (8765) and kills it on quit. The renderer process is a standard React SPA that calls the backend over HTTP. SVG files are parsed client-side using `paper.js` to extract polyline paths in SVG-pixel coordinates, which are then converted to millimetres using the document's viewBox. Tailwind CSS handles styling — no component library dependency.

**Tech Stack:** Node.js 20+, Electron 31, electron-vite 2, React 18, TypeScript 5, Tailwind CSS 3, paper.js 0.12, axios 1.7, vitest 1, @testing-library/react 15, electron-builder 24

**Dependency:** Backend plan must be complete and `python -m studio.backend.main` must start without error before running end-to-end tests.

---

## File Map

| File | Responsibility |
|------|---------------|
| `studio/frontend/package.json` | npm scripts, dependencies |
| `studio/frontend/electron.vite.config.ts` | electron-vite build config |
| `studio/frontend/tsconfig.json` | TypeScript config |
| `studio/frontend/tailwind.config.js` | Tailwind config |
| `studio/frontend/src/main/index.ts` | Electron main process: window, child-process manager |
| `studio/frontend/src/main/python_manager.ts` | Spawn/kill Python backend subprocess |
| `studio/frontend/src/preload/index.ts` | Preload: contextBridge IPC |
| `studio/frontend/src/renderer/index.html` | Renderer HTML shell |
| `studio/frontend/src/renderer/App.tsx` | Root React component, layout, routing |
| `studio/frontend/src/renderer/api/client.ts` | Axios-based typed HTTP client |
| `studio/frontend/src/renderer/svg/parser.ts` | SVG file → PathList (mm) using paper.js |
| `studio/frontend/src/renderer/hooks/useDevice.ts` | React hook: poll device status |
| `studio/frontend/src/renderer/hooks/useJob.ts` | React hook: preview + send job |
| `studio/frontend/src/renderer/components/Canvas.tsx` | SVG canvas: display design + cut-path overlay |
| `studio/frontend/src/renderer/components/SettingsPanel.tsx` | Cut settings form (media, tool, speed, pressure, …) |
| `studio/frontend/src/renderer/components/DeviceStatus.tsx` | Device connection badge + connect button |
| `studio/frontend/src/renderer/components/Toolbar.tsx` | Top toolbar: open file, preview, send, cancel |
| `studio/frontend/src/renderer/types.ts` | Shared TypeScript types mirroring backend models |
| `studio/frontend/tests/svg_parser.test.ts` | vitest unit tests for SVG parser |
| `studio/frontend/tests/client.test.ts` | vitest unit tests for API client |

---

## Task 1 — Project Scaffold (electron-vite + React + TypeScript)

**Files:**
- Create: `studio/frontend/package.json`
- Create: `studio/frontend/electron.vite.config.ts`
- Create: `studio/frontend/tsconfig.json`
- Create: `studio/frontend/tailwind.config.js`
- Create: `studio/frontend/postcss.config.js`

- [ ] **Step 1: Scaffold via electron-vite template**

```powershell
cd studio
npm create @quick-start/electron frontend -- --template react-ts --skip
cd ..
```

If the interactive prompt appears, choose: React + TypeScript.

- [ ] **Step 2: Override `studio/frontend/package.json` with exact deps**

```json
{
  "name": "cutcutgo-studio",
  "version": "1.0.0",
  "description": "Standalone CutCutGo design and cutting application",
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "tsc --noEmit && electron-vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "dist": "npm run build && electron-builder"
  },
  "dependencies": {
    "axios": "^1.7.2",
    "paper": "^0.12.18",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@electron-toolkit/preload": "^3.0.0",
    "@electron-toolkit/utils": "^3.0.0",
    "@testing-library/jest-dom": "^6.4.2",
    "@testing-library/react": "^15.0.7",
    "@types/node": "^20.14.2",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.19",
    "electron": "^31.0.1",
    "electron-builder": "^24.13.3",
    "electron-vite": "^2.3.0",
    "jsdom": "^24.1.0",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.4",
    "typescript": "^5.4.5",
    "vite": "^5.3.1",
    "vitest": "^1.6.0"
  },
  "build": {
    "appId": "com.cutcutgo.studio",
    "productName": "CutCutGo Studio",
    "directories": { "output": "dist" },
    "files": ["out/**/*"],
    "mac": { "target": "dmg" },
    "win": { "target": "nsis" }
  }
}
```

- [ ] **Step 3: Write `studio/frontend/electron.vite.config.ts`**

```typescript
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: { index: resolve(__dirname, 'src/main/index.ts') } } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: { index: resolve(__dirname, 'src/preload/index.ts') } } }
  },
  renderer: {
    plugins: [react()],
    css: { postcss: resolve(__dirname, 'postcss.config.js') },
    test: {
      environment: 'jsdom',
      setupFiles: ['./tests/setup.ts'],
    }
  }
})
```

- [ ] **Step 4: Write `studio/frontend/tailwind.config.js`**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  theme: { extend: {} },
  plugins: [],
}
```

- [ ] **Step 5: Write `studio/frontend/postcss.config.js`**

```javascript
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} }
}
```

- [ ] **Step 6: Write `studio/frontend/tsconfig.json`**

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" }
  ]
}
```

Create `studio/frontend/tsconfig.node.json`:
```json
{
  "extends": "@electron-toolkit/tsconfig/tsconfig.node.json",
  "include": ["electron.vite.config.*", "src/main/**/*", "src/preload/**/*"],
  "compilerOptions": {
    "composite": true,
    "types": ["electron-vite/node"]
  }
}
```

Create `studio/frontend/tsconfig.web.json`:
```json
{
  "extends": "@electron-toolkit/tsconfig/tsconfig.web.json",
  "include": ["src/renderer/**/*", "tests/**/*"],
  "compilerOptions": {
    "composite": true,
    "baseUrl": ".",
    "paths": { "@renderer/*": ["src/renderer/*"] }
  }
}
```

- [ ] **Step 7: Install dependencies**

```powershell
cd studio/frontend
npm install
cd ../..
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 8: Create test setup file**

```powershell
New-Item -ItemType Directory -Force -Path studio/frontend/tests | Out-Null
```

Create `studio/frontend/tests/setup.ts`:
```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 9: Commit scaffold**

```bash
git add studio/frontend/
git commit -m "feat(studio): add Electron + React + TypeScript frontend scaffold"
```

---

## Task 2 — TypeScript Types (mirror backend models)

**Files:**
- Create: `studio/frontend/src/renderer/types.ts`

- [ ] **Step 1: Write the types**

```typescript
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
```

No test needed — pure type declarations verified by TypeScript compiler.

- [ ] **Step 2: Commit**

```bash
git add studio/frontend/src/renderer/types.ts
git commit -m "feat(studio): add TypeScript types mirroring backend Pydantic models"
```

---

## Task 3 — API Client

**Files:**
- Create: `studio/frontend/src/renderer/api/client.ts`
- Create: `studio/frontend/tests/client.test.ts`

- [ ] **Step 1: Write failing test**

Create `studio/frontend/tests/client.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
cd studio/frontend
npx vitest run tests/client.test.ts
cd ../..
```

Expected: `Cannot find module '../src/renderer/api/client'`

- [ ] **Step 3: Write `studio/frontend/src/renderer/api/client.ts`**

```typescript
import axios from 'axios'
import type {
  CutJob, DeviceStatus, JobResponse, MediaPreset, PathList, CutSettings
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
```

- [ ] **Step 4: Run test to verify it passes**

```powershell
cd studio/frontend
npx vitest run tests/client.test.ts
cd ../..
```

Expected: `3 passed`

- [ ] **Step 5: Commit**

```bash
git add studio/frontend/src/renderer/api/client.ts studio/frontend/tests/client.test.ts
git commit -m "feat(studio): add typed axios API client for backend endpoints"
```

---

## Task 4 — SVG Parser (browser-side, paper.js)

**Files:**
- Create: `studio/frontend/src/renderer/svg/parser.ts`
- Create: `studio/frontend/tests/svg_parser.test.ts`

The parser accepts an SVG file string, extracts all visible path/shape elements, flattens bezier curves to polylines, and returns coordinates in millimetres using the SVG viewBox as the coordinate reference.

- [ ] **Step 1: Write failing test**

Create `studio/frontend/tests/svg_parser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { parseSvgToMmPaths } from '../src/renderer/svg/parser'

// Minimal SVG: a 10x10mm rectangle in a 37.795x37.795px viewBox (96dpi → 10mm)
const SQUARE_SVG = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="37.795px" height="37.795px"
     viewBox="0 0 37.795 37.795">
  <rect x="0" y="0" width="37.795" height="37.795"/>
</svg>`

// 10mm circle
const CIRCLE_SVG = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="37.795px" height="37.795px"
     viewBox="0 0 37.795 37.795">
  <circle cx="18.898" cy="18.898" r="18.898"/>
</svg>`

describe('parseSvgToMmPaths', () => {
  it('extracts at least one path from a rect', () => {
    const paths = parseSvgToMmPaths(SQUARE_SVG)
    expect(paths.length).toBeGreaterThan(0)
  })

  it('rect corners are near 0 and 10 mm', () => {
    const paths = parseSvgToMmPaths(SQUARE_SVG)
    const allX = paths.flat().map(pt => pt[0])
    const allY = paths.flat().map(pt => pt[1])
    expect(Math.min(...allX)).toBeCloseTo(0, 0)
    expect(Math.max(...allX)).toBeCloseTo(10, 0)
    expect(Math.min(...allY)).toBeCloseTo(0, 0)
    expect(Math.max(...allY)).toBeCloseTo(10, 0)
  })

  it('extracts paths from a circle', () => {
    const paths = parseSvgToMmPaths(CIRCLE_SVG)
    expect(paths.length).toBeGreaterThan(0)
    // All points should be within 0–10mm range
    const allX = paths.flat().map(pt => pt[0])
    expect(Math.max(...allX)).toBeCloseTo(10, 0)
  })

  it('returns empty array for SVG with no shapes', () => {
    const empty = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>`
    expect(parseSvgToMmPaths(empty)).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
cd studio/frontend
npx vitest run tests/svg_parser.test.ts
cd ../..
```

Expected: `Cannot find module '../src/renderer/svg/parser'`

- [ ] **Step 3: Write `studio/frontend/src/renderer/svg/parser.ts`**

```typescript
import paper from 'paper'
import type { PathList } from '../types'

// px per mm at 96 DPI (CSS standard)
const PX_PER_MM = 96 / 25.4   // ≈ 3.7795

/**
 * Parse an SVG string and return all visible strokes as mm-coordinate polylines.
 * Uses paper.js for bezier flattening. Coordinate origin is SVG top-left.
 */
export function parseSvgToMmPaths(svgString: string, smoothness = 0.05): PathList {
  // Parse SVG in a detached DOM context
  const parser = new DOMParser()
  const doc = parser.parseFromString(svgString, 'image/svg+xml')
  const svgEl = doc.documentElement as unknown as SVGSVGElement

  const { mmPerPx, offsetX, offsetY } = computeTransform(svgEl)

  // Set up paper.js on an off-screen canvas
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  paper.setup(canvas)
  paper.project.clear()

  // Import SVG into paper.js
  const imported = paper.project.importSVG(svgEl)

  const result: PathList = []

  imported.getItems({ class: paper.Path }).forEach((item) => {
    const path = item as paper.Path
    if (!path.visible || path.isEmpty()) return

    // Flatten bezier curves to line segments
    const clone = path.clone({ insert: false }) as paper.Path
    clone.flatten(smoothness * PX_PER_MM)   // smoothness in px

    const points = clone.segments.map(seg => {
      const x = (seg.point.x - offsetX) * mmPerPx
      const y = (seg.point.y - offsetY) * mmPerPx
      return [x, y] as [number, number]
    })

    // Close path if original was closed
    if (path.closed && points.length > 1) {
      points.push([...points[0]] as [number, number])
    }

    if (points.length >= 2) {
      result.push(points)
    }
  })

  paper.project.clear()
  return result
}

function computeTransform(svgEl: SVGSVGElement): {
  mmPerPx: number
  offsetX: number
  offsetY: number
} {
  const viewBox = svgEl.viewBox?.baseVal
  const widthAttr = svgEl.getAttribute('width') || ''
  const heightAttr = svgEl.getAttribute('height') || ''

  // Determine document dimensions in mm
  let docWidthMm: number
  if (widthAttr.endsWith('mm')) {
    docWidthMm = parseFloat(widthAttr)
  } else if (widthAttr.endsWith('px')) {
    docWidthMm = parseFloat(widthAttr) / PX_PER_MM
  } else if (widthAttr.endsWith('cm')) {
    docWidthMm = parseFloat(widthAttr) * 10
  } else if (widthAttr.endsWith('in')) {
    docWidthMm = parseFloat(widthAttr) * 25.4
  } else {
    // Assume px
    docWidthMm = parseFloat(widthAttr || '100') / PX_PER_MM
  }

  // viewBox width (in SVG user units)
  const vbWidth = viewBox?.width ?? parseFloat(widthAttr || '100')

  // px per SVG user unit in the context of paper.js import
  // paper.js preserves viewBox units so 1 paper unit = 1 SVG user unit
  const mmPerUnit = docWidthMm / vbWidth

  return {
    mmPerPx: mmPerUnit,
    offsetX: viewBox?.x ?? 0,
    offsetY: viewBox?.y ?? 0,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```powershell
cd studio/frontend
npx vitest run tests/svg_parser.test.ts
cd ../..
```

Expected: `4 passed`

> **Note:** paper.js requires a DOM environment. vitest is configured with `environment: 'jsdom'` in `electron.vite.config.ts`. If `DOMParser` is unavailable, add `import 'jsdom'` or use `vitest --environment jsdom`.

- [ ] **Step 5: Commit**

```bash
git add studio/frontend/src/renderer/svg/parser.ts studio/frontend/tests/svg_parser.test.ts
git commit -m "feat(studio): add SVG→mm path parser using paper.js bezier flattening"
```

---

## Task 5 — React Hooks (device status + job state)

**Files:**
- Create: `studio/frontend/src/renderer/hooks/useDevice.ts`
- Create: `studio/frontend/src/renderer/hooks/useJob.ts`

- [ ] **Step 1: Write `studio/frontend/src/renderer/hooks/useDevice.ts`**

```typescript
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
```

- [ ] **Step 2: Write `studio/frontend/src/renderer/hooks/useJob.ts`**

```typescript
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
```

No unit tests for hooks — they are thin wrappers around the API client which is already tested. Integration testing happens via the running app.

- [ ] **Step 3: Commit**

```bash
git add studio/frontend/src/renderer/hooks/
git commit -m "feat(studio): add useDevice and useJob React hooks"
```

---

## Task 6 — UI Components

**Files:**
- Create: `studio/frontend/src/renderer/components/DeviceStatus.tsx`
- Create: `studio/frontend/src/renderer/components/SettingsPanel.tsx`
- Create: `studio/frontend/src/renderer/components/Canvas.tsx`
- Create: `studio/frontend/src/renderer/components/Toolbar.tsx`

- [ ] **Step 1: Write `studio/frontend/src/renderer/components/DeviceStatus.tsx`**

```tsx
import type { DeviceStatus as DS } from '../types'

interface Props {
  status: DS
  loading: boolean
  error: string | null
  onConnect: () => void
  onDisconnect: () => void
}

const STATUS_COLOUR: Record<string, string> = {
  ready: 'bg-green-500',
  moving: 'bg-yellow-400',
  unloaded: 'bg-orange-400',
  not_found: 'bg-gray-400',
  error: 'bg-red-500',
}

export function DeviceStatus({ status, loading, error, onConnect, onDisconnect }: Props) {
  const dot = STATUS_COLOUR[status.status] ?? 'bg-gray-400'

  return (
    <div className="flex items-center gap-2 p-2 rounded border border-gray-700 bg-gray-800 text-sm text-white select-none">
      <span className={`w-2.5 h-2.5 rounded-full ${dot}`} />
      <span className="flex-1">
        {status.connected
          ? `${status.status} · ${status.port ?? ''}`
          : 'No device'}
      </span>
      {error && <span className="text-red-400 text-xs">{error}</span>}
      {status.connected ? (
        <button
          onClick={onDisconnect}
          className="px-2 py-0.5 rounded text-xs bg-gray-600 hover:bg-gray-500"
        >
          Disconnect
        </button>
      ) : (
        <button
          onClick={onConnect}
          disabled={loading}
          className="px-2 py-0.5 rounded text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
        >
          {loading ? 'Connecting…' : 'Connect'}
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Write `studio/frontend/src/renderer/components/SettingsPanel.tsx`**

```tsx
import type { CutSettings, MediaPreset } from '../types'

interface Props {
  settings: CutSettings
  mediaPresets: MediaPreset[]
  onChange: (s: CutSettings) => void
}

export function SettingsPanel({ settings, mediaPresets, onChange }: Props) {
  const set = <K extends keyof CutSettings>(key: K, value: CutSettings[K]) =>
    onChange({ ...settings, [key]: value })

  return (
    <aside className="w-64 flex-shrink-0 p-3 bg-gray-900 text-white text-sm overflow-y-auto flex flex-col gap-3">
      <h2 className="font-semibold text-base">Cut Settings</h2>

      <label className="flex flex-col gap-1">
        <span>Media</span>
        <select
          className="bg-gray-700 rounded px-2 py-1"
          value={settings.media}
          onChange={e => set('media', Number(e.target.value))}
        >
          {mediaPresets.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span>Tool</span>
        <select
          className="bg-gray-700 rounded px-2 py-1"
          value={settings.tool}
          onChange={e => set('tool', e.target.value as 'blade' | 'pen')}
        >
          <option value="blade">Blade (right holder)</option>
          <option value="pen">Pen (left holder)</option>
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span>Speed: {settings.speed === 0 ? 'auto' : settings.speed}</span>
        <input
          type="range" min={0} max={10} step={1}
          value={settings.speed}
          onChange={e => set('speed', Number(e.target.value))}
          className="accent-blue-500"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span>Pressure: {settings.pressure === 0 ? 'auto' : settings.pressure}</span>
        <input
          type="range" min={0} max={18} step={0.5}
          value={settings.pressure}
          onChange={e => set('pressure', Number(e.target.value))}
          className="accent-blue-500"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span>Multipass</span>
        <input
          type="number" min={1} max={8}
          value={settings.multipass}
          onChange={e => set('multipass', Number(e.target.value))}
          className="bg-gray-700 rounded px-2 py-1 w-16"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span>Strategy</span>
        <select
          className="bg-gray-700 rounded px-2 py-1"
          value={settings.strategy}
          onChange={e => set('strategy', e.target.value as CutSettings['strategy'])}
        >
          <option value="mintravel">Min Travel</option>
          <option value="mintravelfull">Min Travel Full</option>
          <option value="matfree">Mat Free</option>
          <option value="zorder">Z-Order (as drawn)</option>
        </select>
      </label>

      <div className="flex gap-4">
        <label className="flex flex-col gap-1 flex-1">
          <span>X offset mm</span>
          <input
            type="number" step={0.5}
            value={settings.x_offset}
            onChange={e => set('x_offset', Number(e.target.value))}
            className="bg-gray-700 rounded px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1 flex-1">
          <span>Y offset mm</span>
          <input
            type="number" step={0.5}
            value={settings.y_offset}
            onChange={e => set('y_offset', Number(e.target.value))}
            className="bg-gray-700 rounded px-2 py-1"
          />
        </label>
      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={settings.sw_clipping}
          onChange={e => set('sw_clipping', e.target.checked)}
          className="accent-blue-500"
        />
        Software clipping
      </label>
    </aside>
  )
}
```

- [ ] **Step 3: Write `studio/frontend/src/renderer/components/Canvas.tsx`**

```tsx
import { useEffect, useRef } from 'react'
import type { PathList } from '../types'

interface Props {
  svgContent: string | null         // raw SVG string loaded from file
  previewPaths: PathList | null     // optimised cut paths in mm
  mediaWidthMm: number
  mediaHeightMm: number
}

const MAT_COLOUR = '#1a1a2e'
const DESIGN_COLOUR = '#60a5fa'     // blue — original design
const CUT_COLOUR = '#f87171'        // red — optimised cut path

export function Canvas({ svgContent, previewPaths, mediaWidthMm, mediaHeightMm }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)

  // Derive a scale so the mat fits in the container (max 800×600 logical px)
  const scale = Math.min(800 / mediaWidthMm, 600 / mediaHeightMm)
  const canvasW = mediaWidthMm * scale
  const canvasH = mediaHeightMm * scale

  const pathsToPolyline = (paths: PathList): string[] =>
    paths
      .filter(p => p.length >= 2)
      .map(p => p.map(pt => `${pt[0] * scale},${pt[1] * scale}`).join(' '))

  return (
    <div className="flex-1 flex items-center justify-center bg-gray-950 overflow-auto">
      <svg
        ref={svgRef}
        width={canvasW}
        height={canvasH}
        viewBox={`0 0 ${canvasW} ${canvasH}`}
        className="border border-gray-600 shadow-lg"
        style={{ background: MAT_COLOUR }}
      >
        {/* Grid lines every 10mm */}
        {Array.from({ length: Math.ceil(mediaWidthMm / 10) }, (_, i) => (
          <line
            key={`vg${i}`}
            x1={i * 10 * scale} y1={0}
            x2={i * 10 * scale} y2={canvasH}
            stroke="#ffffff10" strokeWidth={0.5}
          />
        ))}
        {Array.from({ length: Math.ceil(mediaHeightMm / 10) }, (_, i) => (
          <line
            key={`hg${i}`}
            x1={0} y1={i * 10 * scale}
            x2={canvasW} y2={i * 10 * scale}
            stroke="#ffffff10" strokeWidth={0.5}
          />
        ))}

        {/* Original SVG design embedded */}
        {svgContent && (
          <foreignObject width={canvasW} height={canvasH} style={{ opacity: 0.4 }}>
            <div
              // @ts-ignore
              xmlns="http://www.w3.org/1999/xhtml"
              style={{ width: '100%', height: '100%' }}
              dangerouslySetInnerHTML={{ __html: svgContent }}
            />
          </foreignObject>
        )}

        {/* Optimised cut path overlay */}
        {previewPaths && pathsToPolyline(previewPaths).map((pts, i) => (
          <polyline
            key={i}
            points={pts}
            fill="none"
            stroke={CUT_COLOUR}
            strokeWidth={1}
            strokeLinejoin="round"
          />
        ))}
      </svg>
    </div>
  )
}
```

- [ ] **Step 4: Write `studio/frontend/src/renderer/components/Toolbar.tsx`**

```tsx
interface Props {
  onOpenFile: () => void
  onPreview: () => void
  onSend: () => void
  onCancel: () => void
  jobState: 'idle' | 'previewing' | 'sending' | 'done' | 'error'
  hasDesign: boolean
  deviceConnected: boolean
}

export function Toolbar({
  onOpenFile, onPreview, onSend, onCancel,
  jobState, hasDesign, deviceConnected,
}: Props) {
  const busy = jobState === 'previewing' || jobState === 'sending'

  return (
    <header className="flex items-center gap-2 px-3 py-2 bg-gray-800 border-b border-gray-700">
      <span className="font-bold text-white mr-4 text-lg tracking-tight">
        ✂ CutCutGo Studio
      </span>

      <button
        onClick={onOpenFile}
        className="px-3 py-1 rounded bg-gray-600 hover:bg-gray-500 text-white text-sm"
      >
        Open SVG…
      </button>

      <button
        onClick={onPreview}
        disabled={!hasDesign || busy}
        className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-sm disabled:opacity-40"
      >
        {jobState === 'previewing' ? 'Previewing…' : 'Preview Cut'}
      </button>

      <button
        onClick={onSend}
        disabled={!hasDesign || !deviceConnected || busy}
        className="px-3 py-1 rounded bg-green-600 hover:bg-green-500 text-white text-sm disabled:opacity-40"
      >
        {jobState === 'sending' ? 'Cutting…' : 'Cut Now'}
      </button>

      {busy && (
        <button
          onClick={onCancel}
          className="px-3 py-1 rounded bg-red-700 hover:bg-red-600 text-white text-sm"
        >
          Cancel
        </button>
      )}

      {jobState === 'error' && (
        <span className="text-red-400 text-sm ml-2">Error — see console</span>
      )}
      {jobState === 'done' && (
        <span className="text-green-400 text-sm ml-2">Done</span>
      )}
    </header>
  )
}
```

- [ ] **Step 5: Commit all components**

```bash
git add studio/frontend/src/renderer/components/
git commit -m "feat(studio): add DeviceStatus, SettingsPanel, Canvas, Toolbar components"
```

---

## Task 7 — Root App + Renderer Entry

**Files:**
- Create: `studio/frontend/src/renderer/App.tsx`
- Create: `studio/frontend/src/renderer/index.html`
- Create: `studio/frontend/src/renderer/main.tsx`

- [ ] **Step 1: Write `studio/frontend/src/renderer/App.tsx`**

```tsx
import { useState, useCallback, useEffect } from 'react'
import { DEFAULT_SETTINGS } from './types'
import type { CutSettings, PathList } from './types'
import { api } from './api/client'
import type { MediaPreset } from './types'
import { parseSvgToMmPaths } from './svg/parser'
import { useDevice } from './hooks/useDevice'
import { useJob } from './hooks/useJob'
import { Toolbar } from './components/Toolbar'
import { Canvas } from './components/Canvas'
import { SettingsPanel } from './components/SettingsPanel'
import { DeviceStatus } from './components/DeviceStatus'

export default function App() {
  const [settings, setSettings] = useState<CutSettings>(DEFAULT_SETTINGS)
  const [mediaPresets, setMediaPresets] = useState<MediaPreset[]>([])
  const [svgContent, setSvgContent] = useState<string | null>(null)
  const [parsedPaths, setParsedPaths] = useState<PathList | null>(null)

  const { status: deviceStatus, loading: deviceLoading, error: deviceError, connect, disconnect } = useDevice()
  const { state: jobState, previewPaths, error: jobError, preview, send, cancel, reset } = useJob()

  useEffect(() => {
    api.listMedia().then(setMediaPresets).catch(() => {})
  }, [])

  const handleOpenFile = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.svg'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      const text = await file.text()
      setSvgContent(text)
      const paths = parseSvgToMmPaths(text)
      setParsedPaths(paths)
      reset()
    }
    input.click()
  }, [reset])

  const handlePreview = useCallback(() => {
    if (!parsedPaths) return
    preview({ paths: parsedPaths, settings })
  }, [parsedPaths, settings, preview])

  const handleSend = useCallback(() => {
    if (!parsedPaths) return
    send({ paths: parsedPaths, settings })
  }, [parsedPaths, settings, send])

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white">
      <Toolbar
        onOpenFile={handleOpenFile}
        onPreview={handlePreview}
        onSend={handleSend}
        onCancel={cancel}
        jobState={jobState}
        hasDesign={parsedPaths !== null && parsedPaths.length > 0}
        deviceConnected={deviceStatus.connected}
      />

      <div className="flex flex-1 overflow-hidden">
        <Canvas
          svgContent={svgContent}
          previewPaths={previewPaths}
          mediaWidthMm={settings.media_width_mm}
          mediaHeightMm={settings.media_height_mm}
        />

        <div className="w-64 flex-shrink-0 flex flex-col gap-2 p-2 bg-gray-900 overflow-y-auto">
          <DeviceStatus
            status={deviceStatus}
            loading={deviceLoading}
            error={deviceError}
            onConnect={connect}
            onDisconnect={disconnect}
          />
          {jobError && (
            <div className="text-red-400 text-xs p-2 rounded bg-gray-800">{jobError}</div>
          )}
          <SettingsPanel
            settings={settings}
            mediaPresets={mediaPresets}
            onChange={setSettings}
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write `studio/frontend/src/renderer/main.tsx`**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './assets/main.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 3: Write `studio/frontend/src/renderer/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src http://127.0.0.1:8765" />
    <title>CutCutGo Studio</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Create CSS entry with Tailwind directives**

Create `studio/frontend/src/renderer/assets/main.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

* { box-sizing: border-box; }
body { margin: 0; overflow: hidden; }
```

- [ ] **Step 5: Commit**

```bash
git add studio/frontend/src/renderer/
git commit -m "feat(studio): add root App component and renderer entry point"
```

---

## Task 8 — Electron Main Process + Python Manager

**Files:**
- Create: `studio/frontend/src/main/python_manager.ts`
- Create: `studio/frontend/src/main/index.ts`
- Create: `studio/frontend/src/preload/index.ts`

- [ ] **Step 1: Write `studio/frontend/src/main/python_manager.ts`**

```typescript
import { ChildProcess, spawn } from 'child_process'
import { join } from 'path'

const BACKEND_PORT = 8765
const STARTUP_TIMEOUT_MS = 10_000

let proc: ChildProcess | null = null

function repoRoot(): string {
  // In dev: __dirname = studio/frontend/src/main
  // In prod packaged: resources/app.asar — adjust as needed
  return join(__dirname, '..', '..', '..', '..', '..')
}

export async function startPythonBackend(): Promise<void> {
  const root = repoRoot()

  proc = spawn('python', ['-m', 'studio.backend.main'], {
    cwd: root,
    env: { ...process.env, PYTHONPATH: root },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  proc.stdout?.on('data', (d: Buffer) => console.log('[backend]', d.toString().trim()))
  proc.stderr?.on('data', (d: Buffer) => console.error('[backend:err]', d.toString().trim()))
  proc.on('exit', code => console.log(`[backend] exited with code ${code}`))

  // Poll until the backend responds to /api/health
  const start = Date.now()
  while (Date.now() - start < STARTUP_TIMEOUT_MS) {
    try {
      const res = await fetch(`http://127.0.0.1:${BACKEND_PORT}/api/health`)
      if (res.ok) return
    } catch {
      // backend not ready yet
    }
    await new Promise(r => setTimeout(r, 300))
  }
  throw new Error(`Python backend did not start within ${STARTUP_TIMEOUT_MS}ms`)
}

export function stopPythonBackend(): void {
  if (proc) {
    proc.kill()
    proc = null
  }
}
```

- [ ] **Step 2: Write `studio/frontend/src/main/index.ts`**

```typescript
import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { startPythonBackend, stopPythonBackend } from './python_manager'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'CutCutGo Studio',
    backgroundColor: '#0a0a14',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
    },
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.cutcutgo.studio')
  app.on('browser-window-created', (_, w) => optimizer.watchShortcuts(w))

  try {
    await startPythonBackend()
    console.log('[main] Python backend started')
  } catch (e) {
    console.error('[main] Failed to start backend:', e)
    // Continue anyway — renderer will show "backend not reachable"
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopPythonBackend()
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 3: Write `studio/frontend/src/preload/index.ts`**

```typescript
import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Expose minimal Electron API to renderer (no Node.js APIs in renderer)
contextBridge.exposeInMainWorld('electron', electronAPI)
```

- [ ] **Step 4: Commit**

```bash
git add studio/frontend/src/main/ studio/frontend/src/preload/
git commit -m "feat(studio): add Electron main process and Python backend manager"
```

---

## Task 9 — Dev + Build Verification

- [ ] **Step 1: Start Python backend in one terminal**

```powershell
cd C:\Git\inkscape-cutcutgo-sz
python -m studio.backend.main
```

Expected: `INFO:     Uvicorn running on http://127.0.0.1:8765`

- [ ] **Step 2: Start Electron in dev mode in another terminal**

```powershell
cd studio/frontend
npm run dev
```

Expected: Electron window opens showing the CutCutGo Studio UI. The "No device" badge appears in the sidebar.

- [ ] **Step 3: Verify golden path — file import → preview**

1. Click "Open SVG…" and open any SVG file with closed paths
2. Design should appear (faint blue) on the dark mat canvas
3. Click "Preview Cut"
4. Red cut-path overlay should appear on the canvas
5. Settings panel should respond to changes (speed, pressure, media)

- [ ] **Step 4: Run all frontend tests**

```powershell
cd studio/frontend
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 5: Run full backend test suite**

```bash
cd C:\Git\inkscape-cutcutgo-sz
python -m pytest studio/backend/tests/ -v
```

Expected: All tests pass.

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "feat(studio): complete CutCutGo-Studio MVP — Electron + Python backend integration"
```

---

## Self-Review

**Spec coverage:**
- ✅ Cross-platform desktop app (Electron: Windows + macOS)
- ✅ Import SVG files (Task 7 — file input → parseSvgToMmPaths)
- ✅ Display design on virtual mat canvas (Task 6 — Canvas component)
- ✅ Cut settings UI (media, tool, speed, pressure, strategy, offset) (Task 6 — SettingsPanel)
- ✅ Cut path preview without device (Task 5 — useJob.preview → /api/job/preview)
- ✅ Send cut job to device (Task 5 — useJob.send → /api/job/send)
- ✅ Device status polling + connect button (Task 5 — useDevice)
- ✅ Cancel in-progress job (Task 6 — Toolbar cancel button)
- ✅ Python backend spawned automatically (Task 8 — python_manager.ts)
- ✅ Inkscape extension preserved as-is in repo root

**Placeholder scan:** No TBDs found.

**Type consistency:** `PathList`, `CutSettings`, `CutJob`, `JobResponse`, `DeviceStatus`, `MediaPreset` — defined once in `types.ts` and used consistently across hooks, components, and API client.

**Known risk — paper.js in jsdom:** The SVG parser uses `DOMParser` which is available in jsdom (vitest). In the actual Electron renderer it uses the real Chromium DOM — this is correct. Confirm `paper.setup(canvas)` does not throw in jsdom; if it does, mock paper.js in the test with `vi.mock('paper', ...)`.

---

## Plan complete

Saved to `docs/superpowers/plans/2026-05-02-cutcutgo-studio-frontend.md`.

**Execution order:**
1. Execute backend plan first (`2026-05-02-cutcutgo-studio-backend.md`) — produces working API
2. Execute this frontend plan — produces complete desktop app

**Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks

**2. Inline Execution** — execute tasks sequentially in this session using executing-plans skill

Which approach?
