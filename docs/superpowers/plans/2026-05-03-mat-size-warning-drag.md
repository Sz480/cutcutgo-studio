# Mat Size Selector, Text Warning Fix & Drag-to-Place Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mat-size dropdown (12"×12" / 12"×24"), fix the phantom text-element warning that shows even after successful Inkscape flattening, and let the user drag the design to reposition it on the canvas.

**Architecture:** All three changes are purely in the Electron/React frontend (`studio/frontend/src/renderer/`). The backend is unaffected. The drag offset writes directly into the existing `CutSettings.x_offset / y_offset` fields that are already sent to the backend at cut time — no new backend fields needed.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, SVG mouse events, existing `CutSettings` type in `types.ts`.

---

## Affected Files

| File | Change |
|------|--------|
| `studio/frontend/src/renderer/types.ts` | Add `MAT_SIZES` constant |
| `studio/frontend/src/renderer/components/SettingsPanel.tsx` | Add Mat Size dropdown at top |
| `studio/frontend/src/renderer/App.tsx` | Fix text-warning logic; add dismiss button; pass offset + drag handler to Canvas |
| `studio/frontend/src/renderer/components/Canvas.tsx` | Accept offset props; add drag handlers; translate content group |
| `studio/frontend/tests/svg_parser.test.ts` | Existing tests must stay green (no change needed) |

---

## Task 1: Add `MAT_SIZES` constant to `types.ts`

**Files:**
- Modify: `studio/frontend/src/renderer/types.ts`

- [ ] **Step 1: Add the constant after `DEFAULT_TRACE_PARAMS`**

Open `studio/frontend/src/renderer/types.ts`. After the closing `}` of `DEFAULT_TRACE_PARAMS`, append:

```typescript
export interface MatSize {
  label: string
  widthMm: number
  heightMm: number
}

export const MAT_SIZES: MatSize[] = [
  { label: '12" × 12"  (304,8 × 304,8 mm)', widthMm: 304.8, heightMm: 304.8 },
  { label: '12" × 24"  (304,8 × 609,6 mm)', widthMm: 304.8, heightMm: 609.6 },
]
```

- [ ] **Step 2: Type-check**

```powershell
cd studio/frontend; npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add studio/frontend/src/renderer/types.ts
git commit -m "feat(types): add MAT_SIZES constant for mat size selector"
```

---

## Task 2: Mat Size Dropdown in `SettingsPanel.tsx`

**Files:**
- Modify: `studio/frontend/src/renderer/components/SettingsPanel.tsx`

- [ ] **Step 1: Import `MAT_SIZES`**

Replace the first line of `SettingsPanel.tsx`:
```typescript
import type { CutSettings, MediaPreset } from '../types'
```
with:
```typescript
import type { CutSettings, MediaPreset } from '../types'
import { MAT_SIZES } from '../types'
```

- [ ] **Step 2: Derive selected mat size index inside the component**

After the `set` helper (line 10 in current file), add:
```typescript
  const selectedMatIdx = MAT_SIZES.findIndex(
    m => m.widthMm === settings.media_width_mm && m.heightMm === settings.media_height_mm,
  )
  // Fall back to last size (12"×24") when no exact match
  const matIdx = selectedMatIdx >= 0 ? selectedMatIdx : MAT_SIZES.length - 1
```

- [ ] **Step 3: Insert the dropdown as the first control (before Media)**

Replace the JSX block starting with `<h2 className="font-semibold text-base">Cut Settings</h2>` so it reads:

```tsx
      <h2 className="font-semibold text-base">Cut Settings</h2>

      <label className="flex flex-col gap-1">
        <span>Mattengröße</span>
        <select
          className="bg-gray-700 rounded px-2 py-1"
          value={matIdx}
          onChange={e => {
            const m = MAT_SIZES[Number(e.target.value)]
            onChange({ ...settings, media_width_mm: m.widthMm, media_height_mm: m.heightMm })
          }}
        >
          {MAT_SIZES.map((m, i) => (
            <option key={i} value={i}>{m.label}</option>
          ))}
        </select>
      </label>
```

- [ ] **Step 4: Type-check**

```powershell
cd studio/frontend; npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Verify in dev build**

```powershell
cd studio/frontend; npm run dev
```

Open the app, check that the sidebar shows "Mattengröße" dropdown with two sizes. Switching size should shrink/grow the mat canvas (12"×12" shows a square mat, 12"×24" shows the long mat). No other settings should change.

- [ ] **Step 6: Commit**

```bash
git add studio/frontend/src/renderer/components/SettingsPanel.tsx
git commit -m "feat(ui): add mat size dropdown (12x12 / 12x24) to SettingsPanel"
```

---

## Task 3: Fix Phantom Text Warning in `App.tsx`

**Problem:** When Inkscape successfully flattens text to paths, the updated SVG is passed to `parseSvgToMmPaths`. If Inkscape's output still contains any `<text>` node (e.g. residual `<defs>` entries in some Inkscape versions), the parser fires `onWarning` again—overwriting the clean state. Additionally, when Inkscape is not installed the warning message is imperative ("please convert") even though the cut still works fine.

**Files:**
- Modify: `studio/frontend/src/renderer/App.tsx`

- [ ] **Step 1: Track whether Inkscape handled text successfully**

Find the SVG branch inside `handleOpenFile` (around line 40). Replace the whole `if (ext === 'svg')` block with:

```typescript
      if (ext === 'svg') {
        let text = await file.text()
        setSvgWarning(null)
        let inkscapeHandledText = false

        if (/<text[\s>]/i.test(text)) {
          const result = await window.electron.ipcRenderer.invoke(
            'svg:flattenText', text,
          ) as { ok: boolean; svg?: string }
          if (result.ok && result.svg) {
            text = result.svg
            inkscapeHandledText = true
          } else {
            setSvgWarning(
              'Hinweis: Text-Elemente wurden übersprungen — zum Schneiden bitte in Inkscape zu Pfaden konvertieren (Pfad → Objekt in Pfad umwandeln).',
            )
          }
        }

        setSvgContent(text)
        const paths = parseSvgToMmPaths(
          text,
          0.05,
          inkscapeHandledText ? undefined : (msg) => setSvgWarning(msg),
        )
        setParsedPaths(paths)
        reset()
```

Key changes:
- `inkscapeHandledText` flag prevents the parser from re-triggering the text warning when Inkscape already converted the text.
- Warning copy changed from imperative error to a softer "Hinweis:" (note).
- When `inkscapeHandledText` is true, no `onWarning` is passed to the parser for text-related messages.

- [ ] **Step 2: Add a dismiss button to the warning banner**

Find the warning banner JSX (around line 102):
```tsx
      {svgWarning && (
        <div className="px-4 py-1 bg-yellow-900/60 text-yellow-300 text-xs border-b border-yellow-700">
          {svgWarning}
        </div>
      )}
```

Replace with:
```tsx
      {svgWarning && (
        <div className="flex items-center gap-2 px-4 py-1 bg-yellow-900/60 text-yellow-300 text-xs border-b border-yellow-700">
          <span className="flex-1">{svgWarning}</span>
          <button
            onClick={() => setSvgWarning(null)}
            className="ml-2 text-yellow-400 hover:text-yellow-200 leading-none"
            aria-label="Meldung schließen"
          >
            ✕
          </button>
        </div>
      )}
```

- [ ] **Step 3: Type-check**

```powershell
cd studio/frontend; npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Manual smoke test**

1. Open an SVG **without** text → no warning banner.
2. Open an SVG **with** `<text>` elements and Inkscape installed → Inkscape flattens silently, no warning.
3. Open an SVG **with** `<text>` elements and Inkscape NOT installed → yellow banner appears with "Hinweis: …", shows an ✕ button. Click ✕ → banner disappears.

- [ ] **Step 5: Commit**

```bash
git add studio/frontend/src/renderer/App.tsx
git commit -m "fix(ui): suppress phantom text-warning after Inkscape flatten; soften message; add dismiss button"
```

---

## Task 4: Drag-to-Reposition Content on Canvas

**Goal:** Let the user drag the design on the mat to visually set the X/Y offset. The offset is stored in `settings.x_offset` / `settings.y_offset` (already sent to the backend at cut time). The number inputs in SettingsPanel remain as a precise fallback — they stay in sync automatically because they read from `settings`.

**Files:**
- Modify: `studio/frontend/src/renderer/components/Canvas.tsx`
- Modify: `studio/frontend/src/renderer/App.tsx`

### 4a — Extend `Canvas.tsx` with drag support

- [ ] **Step 1: Add new props and drag state**

Replace the entire `Canvas.tsx` file with:

```typescript
import { useState } from 'react'
import type { PathList } from '../types'

interface Props {
  svgContent: string | null
  previewPaths: PathList | null
  mediaWidthMm: number
  mediaHeightMm: number
  xOffsetMm?: number
  yOffsetMm?: number
  onOffsetChange?: (x: number, y: number) => void
}

const MAT_COLOUR = '#1a1a2e'
const CUT_COLOUR = '#f87171'

export function Canvas({
  svgContent,
  previewPaths,
  mediaWidthMm,
  mediaHeightMm,
  xOffsetMm = 0,
  yOffsetMm = 0,
  onOffsetChange,
}: Props) {
  const scale = Math.min(800 / mediaWidthMm, 600 / mediaHeightMm)
  const canvasW = mediaWidthMm * scale
  const canvasH = mediaHeightMm * scale

  // Drag state: null when idle, {px,py} = pointer origin, {ox,oy} = offset origin in mm
  const [dragOrigin, setDragOrigin] = useState<{
    px: number; py: number; ox: number; oy: number
  } | null>(null)

  const hasContent = !!(svgContent || previewPaths)

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!hasContent || !onOffsetChange) return
    setDragOrigin({ px: e.clientX, py: e.clientY, ox: xOffsetMm, oy: yOffsetMm })
    e.preventDefault()
  }

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragOrigin || !onOffsetChange) return
    const dx = (e.clientX - dragOrigin.px) / scale
    const dy = (e.clientY - dragOrigin.py) / scale
    onOffsetChange(dragOrigin.ox + dx, dragOrigin.oy + dy)
  }

  const endDrag = () => setDragOrigin(null)

  const pathsToPolyline = (paths: PathList): string[] =>
    paths
      .filter(p => p.length >= 2)
      .map(p => p.map(pt => `${pt[0] * scale},${pt[1] * scale}`).join(' '))

  const gridLinesX = Array.from({ length: Math.ceil(mediaWidthMm / 10) }, (_, i) => i)
  const gridLinesY = Array.from({ length: Math.ceil(mediaHeightMm / 10) }, (_, i) => i)

  const offsetXPx = xOffsetMm * scale
  const offsetYPx = yOffsetMm * scale

  const cursorStyle = dragOrigin
    ? 'grabbing'
    : hasContent && onOffsetChange
      ? 'grab'
      : 'default'

  return (
    <div className="flex-1 flex items-center justify-center bg-gray-950 overflow-auto p-4">
      <svg
        width={canvasW}
        height={canvasH}
        viewBox={`0 0 ${canvasW} ${canvasH}`}
        className="border border-gray-600 shadow-lg"
        style={{ background: MAT_COLOUR, cursor: cursorStyle }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
      >
        {/* Grid — fixed to mat, does not move with offset */}
        {gridLinesX.map(i => (
          <line
            key={`vg${i}`}
            x1={i * 10 * scale} y1={0}
            x2={i * 10 * scale} y2={canvasH}
            stroke="#ffffff10" strokeWidth={0.5}
          />
        ))}
        {gridLinesY.map(i => (
          <line
            key={`hg${i}`}
            x1={0} y1={i * 10 * scale}
            x2={canvasW} y2={i * 10 * scale}
            stroke="#ffffff10" strokeWidth={0.5}
          />
        ))}

        {/* Design — translated by current offset */}
        <g transform={`translate(${offsetXPx}, ${offsetYPx})`}>
          {svgContent && (
            <foreignObject width={canvasW} height={canvasH} style={{ opacity: 0.35 }}>
              <div
                // @ts-ignore — xmlns needed for foreignObject children
                xmlns="http://www.w3.org/1999/xhtml"
                style={{ width: '100%', height: '100%' }}
                dangerouslySetInnerHTML={{ __html: svgContent }}
              />
            </foreignObject>
          )}

          {previewPaths && pathsToPolyline(previewPaths).map((pts, i) => (
            <polyline
              key={i}
              points={pts}
              fill="none"
              stroke={CUT_COLOUR}
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
          ))}
        </g>
      </svg>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```powershell
cd studio/frontend; npx tsc --noEmit
```

Expected: no errors.

### 4b — Wire offset and handler in `App.tsx`

- [ ] **Step 3: Pass offset props and handler to `<Canvas>`**

In `App.tsx`, find the `<Canvas .../>` JSX block (around line 109):

```tsx
        <Canvas
          svgContent={svgContent}
          previewPaths={previewPaths}
          mediaWidthMm={settings.media_width_mm}
          mediaHeightMm={settings.media_height_mm}
        />
```

Replace with:
```tsx
        <Canvas
          svgContent={svgContent}
          previewPaths={previewPaths}
          mediaWidthMm={settings.media_width_mm}
          mediaHeightMm={settings.media_height_mm}
          xOffsetMm={settings.x_offset}
          yOffsetMm={settings.y_offset}
          onOffsetChange={(x, y) =>
            setSettings(s => ({ ...s, x_offset: Math.round(x * 10) / 10, y_offset: Math.round(y * 10) / 10 }))
          }
        />
```

The `Math.round(x * 10) / 10` snaps to 0.1 mm precision, which keeps the number inputs readable.

- [ ] **Step 4: Type-check**

```powershell
cd studio/frontend; npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Manual test in dev build**

```powershell
cd studio/frontend; npm run dev
```

Test these scenarios:
1. Open an SVG file → design appears on mat.
2. Hover over mat → cursor becomes `grab`.
3. Drag design to the right → design moves right, X offset value in SettingsPanel updates live.
4. Drag design downward → Y offset updates.
5. Verify that the X/Y number inputs in SettingsPanel still work: type `10` in X offset → design jumps 10 mm right.
6. Reset offsets to 0 → design is back at origin.
7. Click "Preview" after positioning → backend receives correct offset in `CutJob.settings`.

- [ ] **Step 6: Commit**

```bash
git add studio/frontend/src/renderer/components/Canvas.tsx \
        studio/frontend/src/renderer/App.tsx
git commit -m "feat(canvas): drag-to-reposition design on mat; offset syncs with settings inputs"
```

---

## Task 5: Run full test suite and final verification

- [ ] **Step 1: Run frontend tests**

```powershell
cd studio/frontend; npm test -- --run
```

Expected: all tests pass (existing `svg_parser.test.ts`, `client.test.ts`, `useImport.test.ts`).

- [ ] **Step 2: Build production bundle**

```powershell
cd studio/frontend; npm run build
```

Expected: no TypeScript or build errors.

- [ ] **Step 3: Smoke test in built Electron app**

```powershell
cd studio/frontend; npm run electron:preview
```

Verify:
- Mattengröße dropdown present, two sizes, switching resizes the mat.
- Open SVG with text → "Hinweis:" warning (not imperative), ✕ dismisses it.
- Drag design on mat → offsets update in number inputs.
- Number inputs still update design position.

- [ ] **Step 4: Final commit if any cleanup needed**

```bash
git add -p
git commit -m "chore: final cleanup after mat-size / drag / warning fixes"
```

---

## Self-Review Checklist

| Requirement | Covered by |
|-------------|-----------|
| 12"×12" mat size | Task 1 + Task 2 (MAT_SIZES constant + dropdown) |
| 12"×24" mat size | Task 1 + Task 2 (second entry in MAT_SIZES) |
| Suppress phantom text warning after Inkscape success | Task 3 (`inkscapeHandledText` flag + `undefined` callback) |
| Softer "Hinweis:" copy when Inkscape not available | Task 3 (new message string) |
| Dismissible warning banner | Task 3 (✕ button) |
| Drag design on canvas to set position | Task 4 (Canvas mouse handlers + `<g transform>`) |
| Offset inputs still work alongside drag | Task 4b (both write to same `settings.x_offset/y_offset`) |
| Backend unchanged | All tasks (offset was already in CutSettings) |
| Existing tests green | Task 5 |
