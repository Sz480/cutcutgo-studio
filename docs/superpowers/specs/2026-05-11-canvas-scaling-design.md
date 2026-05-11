# Canvas Scaling — Design Spec

## Summary

Add uniform scaling to imported graphics on the canvas. The user can resize a design via corner handle drag, sidebar controls, or Ctrl+scroll — with live mm/percentage readout. Scaled paths are sent to the cutter without backend changes.

## UI

### Canvas

- Bounding box rendered around the design (computed from original path extents).
- One corner handle at bottom-right: `16×16px` filled square with white border, shadow glow.
- Dragging the handle scales uniformly (aspect ratio locked by default).
- During drag, a floating tooltip shows: `Width: X mm · Height: Y mm · 125%`.
- Ctrl+Scroll on the canvas scales in ±5% steps (clamped to 10%–500%).

### Sidebar Panel

New "Skalierung" section in the sidebar (below SettingsPanel):

- **Scale slider** — range 10–500%, current value displayed next to label.
- **Width / Height inputs** — editable mm fields, bidirectionally synced with scale.
  - Changing width recalculates scale and updates height (via aspect ratio).
  - When lock is on, changing either dimension updates the other.
- **Aspect ratio lock** checkbox — on by default. When off, width/height can diverge (but still use a single uniform scale — see note below).
- **Quick presets** — 50%, 100%, 200%, "Fit" (scales to fill mat width minus margins).
- **Original dimensions** — small read-only text showing the design's natural size.
- **Keyboard hint** — subtle text: "Ctrl+Scroll skaliert in 5%-Schritten · Ecke ziehen visuell"

### Aspect Ratio

Uniform scale only — a single `scale` factor. The lock toggle *always* stays on for v1. Non-uniform stretch is out of scope (would distort cut paths and is rarely wanted for physical cutting).

## Data Model

### App State

```ts
const [scale, setScale] = useState<number>(1.0)
```

Reset to `1.0` whenever a new file is imported (both SVG and raster paths).

### Types

No new types needed. `CutJob` already carries `paths: PathList` — paths are scaled client-side before sending.

## Rendering

The Canvas component receives `scale` as a new prop and applies it inside the existing `<g transform="...">` group:

1. **SVG overlay** (`foreignObject`): multiply the existing `scale(s)` CSS transform by the user scale.
2. **Path polylines**: `pathsToPolyline` already multiplies by `scale` (the canvas mm→px scale). Add the user scale as a second factor: `pt * canvasScale * userScale`.
3. **Bounding box**: computed from the *original* (unscaled) paths, then rendered at the scaled position.

## Sending

In `handleSend` / `handlePreview`, paths are scaled before sending:

```ts
const scaledPaths = parsedPaths.map(path =>
  path.map(([x, y]) => [x * scale, y * scale])
)
```

The backend receives pre-scaled paths and requires no changes.

## UX States

| State | Behavior |
|---|---|
| No design loaded | Sidebar scale section hidden or disabled |
| Design loaded | Scale = 100%, panel active, bounding box visible |
| During drag | Live tooltip, smooth resizing, other UI responsive |
| Scale at min/max | Clamp at 10% / 500%, slider snaps |
| After send/cut | Scale persists (user may want to re-cut at same size) |
| New file imported | Scale resets to 1.0 |

## Files Touched

- `studio/frontend/src/renderer/App.tsx` — add `scale` state, pass to Canvas, scale paths in send/preview
- `studio/frontend/src/renderer/components/Canvas.tsx` — bounding box, corner handle, Ctrl+scroll, apply scale to rendering
- `studio/frontend/src/renderer/components/SettingsPanel.tsx` — new "Skalierung" section (or new component)
- `studio/frontend/src/renderer/types.ts` — no changes needed

## Out of Scope

- Non-uniform scaling (stretch X/Y independently)
- Rotation
- Per-layer scaling for color-separated imports
- Persisting scale across app restarts
