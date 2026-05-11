# Canvas Scaling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add uniform scaling (10%–500%) to imported graphics via corner handle, sidebar controls, and Ctrl+scroll.

**Architecture:** A single `scale` float in App state (default 1.0). Canvas applies it to path rendering and SVG overlay. Paths are scaled client-side before send/preview so the backend is untouched. A `ScalePanel` component provides slider, mm inputs, and presets in the sidebar.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest + jsdom

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `studio/frontend/src/renderer/App.tsx` | Modify | `scale` state, pass to Canvas, scale paths in send/preview, reset on import |
| `studio/frontend/src/renderer/components/Canvas.tsx` | Modify | Accept `scale` prop, render scaled paths/overlay, bounding box + corner handle, Ctrl+scroll |
| `studio/frontend/src/renderer/components/ScalePanel.tsx` | Create | Sidebar widget: slider, mm inputs, lock toggle, presets |
| `studio/frontend/tests/scaling.test.ts` | Create | Unit tests for scale logic |

`SettingsPanel.tsx` is NOT modified — `ScalePanel` is rendered separately in App.tsx's sidebar.

---

### Task 1: Add scale state and wiring in App.tsx

**Files:**
- Modify: `studio/frontend/src/renderer/App.tsx`

- [ ] **Step 1: Add `scale` state and `onScaleChange` handler**

Add after `svgWarning` state (line 23):

```tsx
const [scale, setScale] = useState<number>(1.0)
```

Add handler after `handleOffsetChange` (after line 121):

```tsx
const handleScaleChange = useCallback((s: number) => {
  setScale(Math.max(0.1, Math.min(5.0, Math.round(s * 100) / 100)))
}, [])
```

- [ ] **Step 2: Reset scale when new file is imported**

In `handleOpenFile`, after `setParsedPaths(paths)` (line 81) add:

```tsx
setScale(1.0)
```

After `importHook.accept` in `handleImportAccept` (line 96) — the scale reset happens implicitly because `handleImportAccept` already calls `reset()` and sets new paths. Add `setScale(1.0)` there too after `setParsedPaths(paths)`:

```tsx
const handleImportAccept = useCallback((enabledColors?: Set<string>) => {
  const paths = importHook.accept(enabledColors)
  if (paths && paths.length > 0) {
    setParsedPaths(paths)
    setSvgContent(null)
    setScale(1.0)
    reset()
  }
  setShowImportPanel(false)
  importHook.reset()
}, [importHook.accept, importHook.reset, reset])
```

- [ ] **Step 3: Scale paths in handlePreview and handleSend**

In `handlePreview`, scale paths before sending:

```tsx
const handlePreview = useCallback(() => {
  if (!parsedPaths) return
  const scaled = parsedPaths.map(p => p.map(([x, y]) => [x * scale, y * scale] as [number, number]))
  preview({ paths: scaled, settings })
}, [parsedPaths, settings, scale, preview])
```

In `handleSend`, same pattern:

```tsx
const handleSend = useCallback(() => {
  if (!parsedPaths) return
  const scaled = parsedPaths.map(p => p.map(([x, y]) => [x * scale, y * scale] as [number, number]))
  send({ paths: scaled, settings })
}, [parsedPaths, settings, scale, send])
```

- [ ] **Step 4: Pass scale prop to Canvas**

Update the Canvas JSX (line 149–158) to include `scale`:

```tsx
<Canvas
  svgContent={svgContent}
  previewPaths={previewPaths}
  parsedPaths={parsedPaths}
  scale={scale}
  onScaleChange={handleScaleChange}
  mediaWidthMm={settings.media_width_mm}
  mediaHeightMm={settings.media_height_mm}
  xOffsetMm={settings.x_offset}
  yOffsetMm={settings.y_offset}
  svgNormOffsetX={svgNormOffset.x}
  svgNormOffsetY={svgNormOffset.y}
  onOffsetChange={handleOffsetChange}
/>
```

- [ ] **Step 5: Render ScalePanel in sidebar**

Add import at top:

```tsx
import { ScalePanel } from './components/ScalePanel'
```

Render after SettingsPanel in the sidebar div (after line 176):

```tsx
<ScalePanel
  scale={scale}
  originalWidthMm={parsedPaths ? Math.max(...parsedPaths.flatMap(p => p.map(pt => pt[0]))) : 0}
  originalHeightMm={parsedPaths ? Math.max(...parsedPaths.flatMap(p => p.map(pt => pt[1]))) : 0}
  mediaWidthMm={settings.media_width_mm}
  onChange={handleScaleChange}
/>
```

- [ ] **Step 6: Commit**

```bash
git add studio/frontend/src/renderer/App.tsx
git commit -m "feat: add scale state wiring in App, scale paths before send/preview"
```

---

### Task 2: Create ScalePanel component

**Files:**
- Create: `studio/frontend/src/renderer/components/ScalePanel.tsx`

- [ ] **Step 1: Write the component**

```tsx
interface Props {
  scale: number
  originalWidthMm: number
  originalHeightMm: number
  mediaWidthMm: number
  onChange: (scale: number) => void
}

export function ScalePanel({ scale, originalWidthMm, originalHeightMm, mediaWidthMm, onChange }: Props) {
  const scaledW = originalWidthMm * scale
  const scaledH = originalHeightMm * scale
  const hasDesign = originalWidthMm > 0 && originalHeightMm > 0
  const fitScale = originalWidthMm > 0 ? Math.round((mediaWidthMm * 0.9) / originalWidthMm * 100) / 100 : 1.0

  if (!hasDesign) {
    return (
      <aside className="w-full flex flex-col gap-3 text-sm text-white">
        <h2 className="font-semibold text-base">Skalierung</h2>
        <p className="text-gray-500 text-xs">Kein Design geladen.</p>
      </aside>
    )
  }

  return (
    <aside className="w-full flex flex-col gap-3 text-sm text-white">
      <h2 className="font-semibold text-base">Skalierung</h2>

      <label className="flex flex-col gap-1">
        <span>Skalierung: {Math.round(scale * 100)}%</span>
        <input
          type="range"
          min={10} max={500} step={5}
          value={Math.round(scale * 100)}
          onChange={e => onChange(Number(e.target.value) / 100)}
          className="accent-blue-500"
        />
      </label>

      <div className="flex gap-2">
        <label className="flex flex-col gap-1 flex-1">
          <span className="text-gray-400 text-xs">Breite (mm)</span>
          <input
            type="number"
            step={0.1}
            min={0.1}
            value={Math.round(scaledW * 10) / 10}
            onChange={e => {
              const v = Number(e.target.value)
              if (v > 0 && originalWidthMm > 0) onChange(v / originalWidthMm)
            }}
            className="bg-gray-700 rounded px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1 flex-1">
          <span className="text-gray-400 text-xs">Höhe (mm)</span>
          <input
            type="number"
            step={0.1}
            min={0.1}
            value={Math.round(scaledH * 10) / 10}
            onChange={e => {
              const v = Number(e.target.value)
              if (v > 0 && originalHeightMm > 0) onChange(v / originalHeightMm)
            }}
            className="bg-gray-700 rounded px-2 py-1"
          />
        </label>
      </div>

      <p className="text-gray-500 text-xs">
        Original: {originalWidthMm.toFixed(1)} × {originalHeightMm.toFixed(1)} mm
      </p>

      <div className="flex gap-2">
        {[0.5, 1.0, 2.0].map(pct => (
          <button
            key={pct}
            onClick={() => onChange(pct)}
            className={`flex-1 px-2 py-1 rounded text-xs border ${
              scale === pct
                ? 'bg-indigo-600 border-indigo-500 text-white'
                : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {Math.round(pct * 100)}%
          </button>
        ))}
        <button
          onClick={() => onChange(fitScale)}
          className={`flex-1 px-2 py-1 rounded text-xs border ${
            scale === fitScale
              ? 'bg-indigo-600 border-indigo-500 text-white'
              : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
          }`}
        >
          Fit
        </button>
      </div>

      <p className="text-gray-600 text-xs leading-relaxed">
        Ctrl+Scroll — Skaliert in 5%-Schritten<br />
        Ecke ziehen — Visuell skalieren
      </p>
    </aside>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add studio/frontend/src/renderer/components/ScalePanel.tsx
git commit -m "feat: add ScalePanel component with slider, mm inputs, and presets"
```

---

### Task 3: Extend Canvas with scale rendering and bounding box

**Files:**
- Modify: `studio/frontend/src/renderer/components/Canvas.tsx`

- [ ] **Step 1: Update Props interface**

Replace the existing `Props` interface (lines 10–20) with:

```tsx
import type { PathList } from '../types'

interface Props {
  svgContent: string | null
  previewPaths: PathList | null
  parsedPaths: PathList | null
  scale: number
  onScaleChange?: (scale: number) => void
  mediaWidthMm: number
  mediaHeightMm: number
  xOffsetMm?: number
  yOffsetMm?: number
  svgNormOffsetX?: number
  svgNormOffsetY?: number
  onOffsetChange?: (x: number, y: number) => void
}
```

- [ ] **Step 2: Compute bounding box from parsedPaths**

Add a helper after `pathsToPolyline`:

```tsx
function computeBbox(paths: PathList): { x: number; y: number; w: number; h: number } | null {
  if (!paths || paths.length === 0) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const path of paths) {
    for (const [x, y] of path) {
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}
```

- [ ] **Step 3: Destructure new props and compute scaled bbox**

Update the destructuring line (36) to include `scale`, `parsedPaths`, `onScaleChange`:

```tsx
export function Canvas({
  svgContent,
  previewPaths,
  parsedPaths,
  scale = 1.0,
  onScaleChange,
  mediaWidthMm,
  mediaHeightMm,
  xOffsetMm = 0,
  yOffsetMm = 0,
  svgNormOffsetX = 0,
  svgNormOffsetY = 0,
  onOffsetChange,
}: Props) {
```

After `const hasContent`:

```tsx
const bbox = parsedPaths ? computeBbox(parsedPaths) : null
```

- [ ] **Step 4: Apply scale to path rendering**

Update the `pathsToPolyline` call (line 133) to include the user scale:

```tsx
{previewPaths && pathsToPolyline(previewPaths, scale * PX_PER_MM).map((pts, i) => (
```

Wait — let me reconsider. Currently `pathsToPolyline` takes a `scale` parameter that maps mm to px. The preview is always rendered within the `<g transform="translate(offsetXPx, offsetYPx)">`. The paths should be rendered at their scaled size.

Current call: `pathsToPolyline(previewPaths, scale)` where `scale` is the canvas mm-to-px scale. Actually, looking at the code, the `scale` variable in Canvas is `Math.min(800 / mediaWidthMm, 600 / mediaHeightMm)` — the mm-to-px ratio.

So the current rendering is: each path point `[x_mm, y_mm]` is multiplied by `scale` (the canvas mm-to-px factor). This produces correct px positions.

For user scaling: multiply by both: `pt[0] * canvasScale * userScale`.

Update `pathsToPolyline` signature and the call site:

```tsx
function pathsToPolyline(paths: PathList, mmToPx: number, userScale: number): string[] {
  return paths
    .filter(p => p.length >= 2)
    .map(p => p.map(pt => `${pt[0] * mmToPx * userScale},${pt[1] * mmToPx * userScale}`).join(' '))
}
```

And update the call site (around line 133):

```tsx
{previewPaths && pathsToPolyline(previewPaths, scale, userScale).map((pts, i) => (
```

Where `userScale` is the prop `scale`. Let me rename the prop to avoid shadowing the canvas `scale` variable. Actually, let me keep the prop name and rename the canvas scale. Or better, keep the canvas scale as is and destructure differently.

Actually, I have a naming collision: the canvas-level `scale` variable (mmToPx) and the prop `scale` (user scale). Let me destructure the prop as `userScale`:

In the destructuring: rename to avoid confusion — internally use the prop as `userScale`:

```tsx
scale: userScale = 1.0,
```

But the prop is named `scale` externally. Inside the component, `userScale` is clearer.

- [ ] **Step 5: Apply userScale to SVG overlay**

Update the foreignObject transform (lines 123–124). Currently:

```tsx
transform: `scale(${s}) translate(${-svgNormOffsetX * PX_PER_MM}px, ${-svgNormOffsetY * PX_PER_MM}px)`,
```

Add userScale:

```tsx
transform: `scale(${s * userScale}) translate(${-svgNormOffsetX * PX_PER_MM}px, ${-svgNormOffsetY * PX_PER_MM}px)`,
```

- [ ] **Step 6: Render bounding box rect**

After the preview polyline block (after line 143, before `</g>`), add a bounding box rect (shown when there are original paths but no preview to avoid double-rendering):

```tsx
{bbox && hasContent && (
  <rect
    x={0}
    y={0}
    width={bbox.w * userScale}
    height={bbox.h * userScale}
    fill="none"
    stroke="#6366f1"
    strokeWidth={1.5 / scale}
    strokeDasharray={`${4 / scale} ${4 / scale}`}
    pointerEvents="none"
  />
)}
```

Note: dividing stroke widths and dasharray by `scale` (canvas mmToPx) keeps them visually consistent regardless of zoom.

- [ ] **Step 7: Commit**

```bash
git add studio/frontend/src/renderer/components/Canvas.tsx
git commit -m "feat: apply user scale to Canvas rendering, add bounding box"
```

---

### Task 4: Corner handle drag-to-scale

**Files:**
- Modify: `studio/frontend/src/renderer/components/Canvas.tsx`

- [ ] **Step 1: Add corner handle state**

Add after the existing drag state (after line 43):

```tsx
const [scaleDrag, setScaleDrag] = useState<{
  startPx: number; startPy: number; startScale: number
} | null>(null)
```

- [ ] **Step 2: Add handle size constant and event handlers**

After the `cursorStyle` definition (after line 74), add:

```tsx
const HANDLE_SIZE = 8 // px in screen coordinates (not affected by canvas scale)

const handleScalePointerDown = (e: React.PointerEvent<SVGRectElement>) => {
  if (!onScaleChange) return
  e.stopPropagation()
  e.currentTarget.setPointerCapture(e.pointerId)
  setScaleDrag({ startPx: e.clientX, startPy: e.clientY, startScale: userScale })
}

const handleScalePointerMove = (e: React.PointerEvent<SVGRectElement>) => {
  if (!scaleDrag || !onScaleChange || !bbox) return
  const dx = (e.clientX - scaleDrag.startPx) / scale
  const newScale = scaleDrag.startScale + dx / bbox.w
  onScaleChange(newScale)
}
```

- [ ] **Step 3: Render corner handle on the bounding box**

After the bounding box `<rect>` added in Task 3, add inside the same conditional block:

```tsx
{bbox && hasContent && onScaleChange && (
  <>
    <rect
      x={bbox.w * userScale}
      y={bbox.h * userScale}
      width={HANDLE_SIZE * 2 / scale}
      height={HANDLE_SIZE * 2 / scale}
      fill="#6366f1"
      stroke="#fff"
      strokeWidth={2 / scale}
      rx={2 / scale}
      style={{ cursor: 'se-resize' }}
      onPointerDown={handleScalePointerDown}
      onPointerMove={handleScalePointerMove}
      onPointerUp={() => setScaleDrag(null)}
      onPointerCancel={() => setScaleDrag(null)}
    />
  </>
)}
```

The handle is positioned at the bottom-right corner of the scaled bounding box: `(bbox.w * userScale, bbox.h * userScale)`. Sizes are divided by `scale` (canvas mmToPx) to keep them visually consistent in screen pixels.

- [ ] **Step 4: Commit**

```bash
git add studio/frontend/src/renderer/components/Canvas.tsx
git commit -m "feat: add corner handle drag-to-scale on canvas"
```

---

### Task 5: Ctrl+scroll to scale

**Files:**
- Modify: `studio/frontend/src/renderer/components/Canvas.tsx`

- [ ] **Step 1: Add wheel handler**

After the pointer event handlers, add:

```tsx
const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
  if (!e.ctrlKey && !e.metaKey) return
  if (!onScaleChange || !hasContent) return
  e.preventDefault()
  const delta = e.deltaY > 0 ? -0.05 : 0.05
  onScaleChange(userScale + delta)
}
```

Attach it to the `<svg>` element — add `onWheel={handleWheel}` to the svg props (after line 88 `onPointerCancel={endDrag}`).

- [ ] **Step 2: Commit**

```bash
git add studio/frontend/src/renderer/components/Canvas.tsx
git commit -m "feat: add Ctrl+scroll to scale on canvas"
```

---

### Task 6: Write tests

**Files:**
- Create: `studio/frontend/tests/scaling.test.ts`

- [ ] **Step 1: Write the test file**

```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'

// Test the path scaling logic used in handleSend/handlePreview
function scalePaths(
  paths: Array<Array<[number, number]>>,
  scale: number,
): Array<Array<[number, number]>> {
  return paths.map(p => p.map(([x, y]) => [x * scale, y * scale] as [number, number]))
}

// Test the scale clamping logic used in handleScaleChange
function clampScale(s: number): number {
  return Math.max(0.1, Math.min(5.0, Math.round(s * 100) / 100))
}

// Test bounding box computation
function computeBbox(paths: Array<Array<[number, number]>>): { x: number; y: number; w: number; h: number } | null {
  if (!paths || paths.length === 0) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const path of paths) {
    for (const [x, y] of path) {
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

describe('scalePaths', () => {
  it('scales paths by the given factor', () => {
    const paths: Array<Array<[number, number]>> = [[[0, 0], [10, 0], [10, 10]]]
    const result = scalePaths(paths, 2.0)
    expect(result[0][0]).toEqual([0, 0])
    expect(result[0][1]).toEqual([20, 0])
    expect(result[0][2]).toEqual([20, 20])
  })

  it('handles scale = 1.0 as identity', () => {
    const paths: Array<Array<[number, number]>> = [[[5, 5], [15, 15]]]
    expect(scalePaths(paths, 1.0)).toEqual(paths)
  })

  it('handles scale < 1', () => {
    const paths: Array<Array<[number, number]>> = [[[0, 0], [10, 10]]]
    const result = scalePaths(paths, 0.5)
    expect(result[0][1]).toEqual([5, 5])
  })

  it('handles multiple subpaths', () => {
    const paths: Array<Array<[number, number]>> = [[[0, 0], [10, 0]], [[5, 5], [15, 5]]]
    const result = scalePaths(paths, 2.0)
    expect(result).toHaveLength(2)
    expect(result[0][1]).toEqual([20, 0])
    expect(result[1][1]).toEqual([30, 10])
  })

  it('handles empty paths', () => {
    expect(scalePaths([], 2.0)).toEqual([])
  })
})

describe('clampScale', () => {
  it('returns value within range unchanged', () => {
    expect(clampScale(1.0)).toBe(1.0)
    expect(clampScale(0.5)).toBe(0.5)
    expect(clampScale(3.75)).toBe(3.75)
  })

  it('clamps below minimum (0.1 = 10%)', () => {
    expect(clampScale(0.05)).toBe(0.1)
    expect(clampScale(-0.5)).toBe(0.1)
  })

  it('clamps above maximum (5.0 = 500%)', () => {
    expect(clampScale(6.0)).toBe(5.0)
    expect(clampScale(10.0)).toBe(5.0)
  })

  it('rounds to 2 decimal places', () => {
    expect(clampScale(1.234)).toBe(1.23)
    expect(clampScale(1.235)).toBe(1.24)
  })
})

describe('computeBbox', () => {
  it('returns null for empty input', () => {
    expect(computeBbox([])).toBeNull()
  })

  it('computes bounding box for a single path', () => {
    const bbox = computeBbox([[[0, 0], [10, 5], [5, 10]]])
    expect(bbox).toEqual({ x: 0, y: 0, w: 10, h: 10 })
  })

  it('computes union bbox across multiple paths', () => {
    const bbox = computeBbox([
      [[0, 0], [10, 0]],
      [[5, 5], [20, 15]],
    ])
    expect(bbox).toEqual({ x: 0, y: 0, w: 20, h: 15 })
  })

  it('handles paths not starting at origin', () => {
    const bbox = computeBbox([[[10, 20], [30, 50]]])
    expect(bbox).toEqual({ x: 10, y: 20, w: 20, h: 30 })
  })
})
```

- [ ] **Step 2: Run tests**

```bash
cd studio/frontend && npx vitest run tests/scaling.test.ts
```

Expected: All 14 tests pass.

- [ ] **Step 3: Commit**

```bash
git add studio/frontend/tests/scaling.test.ts
git commit -m "test: add unit tests for scale, bbox, and clamp logic"
```

---

### Task 7: Integration smoke test

**Files:** None new — manual verification.

- [ ] **Step 1: Build and check for type errors**

```bash
cd studio/frontend && npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 2: Run all existing tests**

```bash
cd studio/frontend && npx vitest run
```

Expected: All tests pass (existing + new scaling tests).

- [ ] **Step 3: Commit (if any fixes from type check)**

Only if changes were needed:

```bash
git add -u && git commit -m "chore: fix type errors from scaling feature"
```

---

### Task 8: Final commit — all pieces assembled

- [ ] **Step 1: Verify git status**

```bash
git status
git diff --stat HEAD
```

- [ ] **Step 2: Create final aggregated commit if needed**

Only if there are uncommitted changes from integration fixes.
