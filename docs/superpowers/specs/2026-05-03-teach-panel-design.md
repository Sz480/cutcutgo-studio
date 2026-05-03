# Teach Panel — Design Spec
**Date:** 2026-05-03  
**Status:** Approved

## Overview

A hidden "manual mode" floating panel that lets the user jog the CutCutGo device's X/Y axes step-by-step, execute basic machine functions (home, tool up/down), and read the current position in mm. Inspired by industrial robot teach pendants.

Access: **Extras → Teach Panel** in the native Electron menu bar (toggles visibility).

---

## UI Design

### Floating Panel (`TeachPanel.tsx`)

- Fixed-position overlay, draggable via title bar (pointer-capture, same pattern as Canvas drag)
- Default position: top-right corner, offset from toolbar
- Width: ~220px, compact D-Pad layout
- Does **not** block or overlay the main canvas — user can keep cutting workflow visible

**Sections (top to bottom):**

1. **Title bar** — `⚙ Teach Panel` label + `✕` close button, drag handle
2. **Position display** — three cells: `X [mm]`, `Y [mm]`, `Tool [UP/PEN/BLADE]`
3. **Step size toggles** — four buttons: `0.1` / `1` / `5` / `10` mm (one active at a time, highlighted)
4. **D-Pad** — 3×3 grid: ▲▼◀▶ arrows + 🏠 Home in center
5. **Action buttons** — 2×2 grid:
   - `⬆ Tool Up` — raises tool/blade/pen
   - `✒ Pen ↓` — lowers pen to cutting position
   - `🔪 Blade ↓` — lowers blade to cutting position
   - `↺ Reset XY` — resets software position counter to 0,0 without moving
6. **Keyboard hint** — small text: "↑↓←→ Pfeiltasten wenn Panel aktiv"

### Keyboard Support

Arrow keys jog X/Y when the panel is mounted and the device is ready. Uses the currently selected step size.

---

## Architecture

### Backend — New Endpoints (`routers/device.py`)

All endpoints require device to be connected; return `409` if not.

```
POST /api/device/jog
  body: { dx_mm: float, dy_mm: float }
  → moves by relative amount, updates tracked position
  → 409 if not connected, 409 if job in progress

POST /api/device/home
  → raises tool, executes $H reference move, resets tracked position to (0, 0)
  → 409 if not connected, 409 if job in progress

POST /api/device/tool
  body: { action: "up" | "pen" | "blade" }
  → sends Z-move using device's configured pressure/clearance values from setup()
  → updates tracked tool_state
  → 409 if not connected

POST /api/device/reset-position
  → resets tracked (x, y) to (0, 0) without moving the device
  → always succeeds (even if disconnected)

GET /api/device/position
  → { x_mm: float, y_mm: float, tool_state: "up" | "pen" | "blade" }
```

### Backend — Position State (`device_service.py`)

`DeviceService` gains three new fields:
- `_pos_x: float = 0.0`
- `_pos_y: float = 0.0`
- `_tool_state: str = "up"`

And three new methods:
- `jog(dx_mm, dy_mm)` — computes absolute target, sends `move_mm_cmd`, updates `_pos_x/_pos_y`
- `home()` — sends `$H`, resets `_pos_x = _pos_y = 0.0`, sets `_tool_state = "up"`
- `set_tool(action)` — sends appropriate Z-move command, updates `_tool_state`

Position state resets to `(0, 0, "up")` on `disconnect()`.

### Backend — Models (`models.py`)

```python
class JogRequest(BaseModel):
    dx_mm: float
    dy_mm: float

class ToolRequest(BaseModel):
    action: str  # "up" | "pen" | "blade"

class PositionResponse(BaseModel):
    x_mm: float
    y_mm: float
    tool_state: str
```

### Frontend — New Files

**`hooks/useTeachPanel.ts`**  
Manages all teach-panel state and API calls:
- `position: { x, y, toolState }` — polled every 500ms while panel is open
- `stepMm: number` — selected step size (default 1)
- `jog(dx, dy)` — calls `POST /api/device/jog`
- `home()` — calls `POST /api/device/home`
- `setTool(action)` — calls `POST /api/device/tool`
- `resetXY()` — calls `POST /api/device/reset-position` (no movement, just resets server-side counter)
- `busy: boolean` — true while any API call in flight (disables buttons)

**`components/TeachPanel.tsx`**  
Pure UI component, receives hook state as props. Handles:
- Drag via `onPointerDown`/`onPointerMove`/`onPointerUp` on title bar
- Keyboard `keydown` listener (arrow keys → jog)
- Renders all sections described above

### Frontend — Modified Files

**`App.tsx`**
- New state: `const [showTeachPanel, setShowTeachPanel] = useState(false)`
- Listen for IPC: `window.electron.ipcRenderer.on('teach-panel:toggle', () => setShowTeachPanel(s => !s))`
- Render `{showTeachPanel && <TeachPanel ... />}` in root (outside Canvas, fixed position)
- Pass `jobBusy` flag to TeachPanel to disable jog during cuts

**`api/client.ts`**
- `jogDevice(dx_mm, dy_mm)`
- `homeDevice()`
- `setTool(action)`
- `getPosition()` → `PositionResponse`
- `resetPosition()` → resets tracked position server-side

**`main/index.ts`** (Electron main process)
- Build custom `Menu` from template, preserving standard Electron items (Edit, View, Window, Help)
- Add `Extras` menu:
  ```
  Extras
    └─ Teach Panel    Ctrl+Shift+T   (checkmark, toggles)
  ```
- On click: `mainWindow.webContents.send('teach-panel:toggle')`

**`preload/index.ts`**
- Expose `ipcRenderer.on('teach-panel:toggle', cb)` via `contextBridge`

---

## Safety Rules

| Situation | Behavior |
|---|---|
| Device not connected | All jog/home/tool buttons disabled (greyed) |
| Cut job in progress | All jog/home/tool buttons disabled |
| Home triggered | Tool raised first, then `$H`, position reset to 0,0 |
| Jog out of bounds | Backend software clipping prevents negative coordinates |
| Panel closed mid-jog | In-flight request completes; no abort needed |

---

## Out of Scope

- Saving/loading teach positions
- Multi-step sequences / macros
- Z-axis manual jog (not exposed by firmware API)
- Speed control for manual jog (uses fixed feed rate from `move_mm_cmd`)
