# Teach Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hidden floating "teach panel" that lets the user manually jog the CutCutGo device's X/Y axes step-by-step, trigger home/tool commands, and see the current position — accessible via Extras → Teach Panel in the Electron menu bar.

**Architecture:** Backend (`DeviceService`) tracks absolute X/Y position and tool state; four new REST endpoints expose jog/home/tool/position. A floating React component (`TeachPanel.tsx`) renders the D-Pad UI, draggable by its title bar. The Electron main process adds the menu entry and sends an IPC message to toggle panel visibility.

**Tech Stack:** Python/FastAPI (backend), React/TypeScript/Tailwind (frontend), Electron IPC (menu → renderer)

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `studio/backend/models.py` | Add `JogRequest`, `ToolRequest`, `PositionResponse` |
| Modify | `studio/backend/device_service.py` | Add position state + jog/home/set_tool/reset_position |
| Modify | `studio/backend/routers/device.py` | Add 5 new endpoints |
| Modify | `studio/backend/tests/test_device.py` | Tests for new endpoints + DeviceService unit tests |
| Modify | `studio/frontend/src/renderer/types.ts` | Add `PositionResponse` interface |
| Modify | `studio/frontend/src/renderer/api/client.ts` | Add 5 new API calls |
| Create | `studio/frontend/src/renderer/hooks/useTeachPanel.ts` | State + API calls for teach panel |
| Create | `studio/frontend/src/renderer/components/TeachPanel.tsx` | Floating panel UI |
| Modify | `studio/frontend/src/renderer/App.tsx` | Panel state, IPC listener, render |
| Modify | `studio/frontend/src/main/index.ts` | Electron menu with Extras → Teach Panel |

---

## Task 1: Backend Models

**Files:**
- Modify: `studio/backend/models.py`

- [ ] **Step 1: Add three new Pydantic models to the bottom of `models.py`**

```python
class JogRequest(BaseModel):
    dx_mm: float
    dy_mm: float


class ToolRequest(BaseModel):
    action: str  # "up" | "pen" | "blade"


class PositionResponse(BaseModel):
    x_mm: float
    y_mm: float
    tool_state: str  # "up" | "pen" | "blade"
```

- [ ] **Step 2: Commit**

```bash
git add studio/backend/models.py
git commit -m "feat(teach-panel): add JogRequest, ToolRequest, PositionResponse models"
```

---

## Task 2: DeviceService Position Tracking

**Files:**
- Modify: `studio/backend/device_service.py`
- Modify: `studio/backend/tests/test_device.py` (unit tests for new methods)

- [ ] **Step 1: Write failing unit tests for jog clamping and home reset**

Add to `studio/backend/tests/test_device.py` (after existing imports):

```python
import threading
from studio.backend.device_service import DeviceService


def _make_svc(pos_x=0.0, pos_y=0.0, tool_state="up"):
    """Build a DeviceService with a mock device, bypassing __init__."""
    svc = DeviceService.__new__(DeviceService)
    svc._lock = threading.Lock()
    svc._pos_x = pos_x
    svc._pos_y = pos_y
    svc._tool_state = tool_state
    mock_dev = MagicMock()
    mock_dev.pressure = 8.5
    mock_dev.clearance = 1.0
    mock_dev.tool_up = True
    mock_dev.move_mm_cmd.return_value = [b"G01X0F10"]
    mock_dev.send_receive_command.return_value = None
    svc._device = mock_dev
    return svc


def test_jog_updates_position():
    svc = _make_svc(pos_x=5.0, pos_y=3.0)
    svc.jog(2.0, -1.0)
    assert svc._pos_x == 7.0
    assert svc._pos_y == 2.0
    # move_mm_cmd receives (mmy, mmx) order
    svc._device.move_mm_cmd.assert_called_once_with(2.0, 7.0)


def test_jog_clamps_to_zero():
    svc = _make_svc(pos_x=2.0, pos_y=3.0)
    svc.jog(-10.0, -10.0)
    assert svc._pos_x == 0.0
    assert svc._pos_y == 0.0
    svc._device.move_mm_cmd.assert_called_once_with(0.0, 0.0)


def test_jog_sets_tool_state_up():
    svc = _make_svc(tool_state="pen")
    svc.jog(1.0, 0.0)
    assert svc._tool_state == "up"


def test_home_resets_position():
    svc = _make_svc(pos_x=10.0, pos_y=20.0, tool_state="blade")
    svc.home()
    assert svc._pos_x == 0.0
    assert svc._pos_y == 0.0
    assert svc._tool_state == "up"
    assert svc._device.tool_up is True


def test_set_tool_up():
    svc = _make_svc(tool_state="pen")
    svc.set_tool("up")
    assert svc._tool_state == "up"
    assert svc._device.tool_up is True


def test_set_tool_pen():
    svc = _make_svc()
    svc.set_tool("pen")
    assert svc._tool_state == "pen"
    assert svc._device.tool_up is False


def test_reset_position():
    svc = _make_svc(pos_x=15.0, pos_y=25.0)
    svc.reset_position()
    assert svc._pos_x == 0.0
    assert svc._pos_y == 0.0
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd studio && python -m pytest backend/tests/test_device.py::test_jog_updates_position -v
```
Expected: `FAILED` — `DeviceService has no attribute jog`

- [ ] **Step 3: Add position state to `DeviceService.__init__`**

In `studio/backend/device_service.py`, update `__init__`:

```python
def __init__(self) -> None:
    self._lock = threading.Lock()
    self._device: CricutMaker | None = None
    self.port: str | None = None
    self._pos_x: float = 0.0
    self._pos_y: float = 0.0
    self._tool_state: str = "up"
```

- [ ] **Step 4: Update `disconnect` to reset position state**

Replace the existing `disconnect` method with:

```python
def disconnect(self) -> None:
    with self._lock:
        if self._device is not None:
            try:
                dev = getattr(self._device, "dev", None)
                if dev is not None:
                    dev.close()
            except Exception:
                pass
            self._device = None
            self.port = None
        self._pos_x = 0.0
        self._pos_y = 0.0
        self._tool_state = "up"
```

- [ ] **Step 5: Add the four new methods to `DeviceService` (before `get_raw`)**

```python
def jog(self, dx_mm: float, dy_mm: float) -> None:
    """Move by relative offset; clamps to non-negative positions. Always raises tool."""
    with self._lock:
        if self._device is None:
            raise RuntimeError("Device not connected")
        new_x = max(0.0, self._pos_x + dx_mm)
        new_y = max(0.0, self._pos_y + dy_mm)
        cmds = self._device.move_mm_cmd(new_y, new_x)   # note: (mmy, mmx) order
        self._device.send_receive_command(cmds)
        self._pos_x = new_x
        self._pos_y = new_y
        self._tool_state = "up"

def home(self) -> None:
    """Raise tool, run homing cycle ($H), reset tracked position to (0, 0)."""
    with self._lock:
        if self._device is None:
            raise RuntimeError("Device not connected")
        d = self._device
        d.send_receive_command([b"G01Z-%fF10" % (d.pressure - d.clearance)])
        d.tool_up = True
        d.send_receive_command([b"$H"])
        self._pos_x = 0.0
        self._pos_y = 0.0
        self._tool_state = "up"

def set_tool(self, action: str) -> None:
    """Lower or raise the tool. action: 'up' | 'pen' | 'blade'."""
    with self._lock:
        if self._device is None:
            raise RuntimeError("Device not connected")
        d = self._device
        if action == "up":
            d.send_receive_command([b"G01Z-%fF10" % (d.pressure - d.clearance)])
            d.tool_up = True
        elif action in ("pen", "blade"):
            d.send_receive_command([b"G01Z-%fF10" % d.pressure])
            d.tool_up = False
        else:
            raise ValueError(f"Unknown action: {action!r}")
        self._tool_state = action

def reset_position(self) -> None:
    """Reset tracked (x, y) to (0, 0) without moving the device."""
    with self._lock:
        self._pos_x = 0.0
        self._pos_y = 0.0

def get_position(self) -> dict:
    return {"x_mm": self._pos_x, "y_mm": self._pos_y, "tool_state": self._tool_state}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd studio && python -m pytest backend/tests/test_device.py -k "jog or home or set_tool or reset_position" -v
```
Expected: 8 tests PASSED

- [ ] **Step 7: Commit**

```bash
git add studio/backend/device_service.py studio/backend/tests/test_device.py
git commit -m "feat(teach-panel): add position tracking and jog/home/tool methods to DeviceService"
```

---

## Task 3: Backend Endpoints

**Files:**
- Modify: `studio/backend/routers/device.py`
- Modify: `studio/backend/tests/test_device.py`

- [ ] **Step 1: Write failing endpoint tests**

Append to `studio/backend/tests/test_device.py`:

```python
def test_jog_not_connected():
    with patch("studio.backend.routers.device.get_device_service") as mock_get:
        svc = MagicMock()
        svc.is_connected.return_value = False
        mock_get.return_value = svc
        response = client.post("/api/device/jog", json={"dx_mm": 1.0, "dy_mm": 0.0})
    assert response.status_code == 409


def test_jog_connected_calls_service():
    with patch("studio.backend.routers.device.get_device_service") as mock_get:
        svc = MagicMock()
        svc.is_connected.return_value = True
        svc.get_position.return_value = {"x_mm": 1.0, "y_mm": 0.0, "tool_state": "up"}
        mock_get.return_value = svc
        response = client.post("/api/device/jog", json={"dx_mm": 1.0, "dy_mm": 0.0})
    assert response.status_code == 200
    svc.jog.assert_called_once_with(1.0, 0.0)


def test_home_not_connected():
    with patch("studio.backend.routers.device.get_device_service") as mock_get:
        svc = MagicMock()
        svc.is_connected.return_value = False
        mock_get.return_value = svc
        response = client.post("/api/device/home")
    assert response.status_code == 409


def test_tool_invalid_action():
    with patch("studio.backend.routers.device.get_device_service") as mock_get:
        svc = MagicMock()
        svc.is_connected.return_value = True
        mock_get.return_value = svc
        response = client.post("/api/device/tool", json={"action": "invalid"})
    assert response.status_code == 422


def test_tool_valid_action():
    with patch("studio.backend.routers.device.get_device_service") as mock_get:
        svc = MagicMock()
        svc.is_connected.return_value = True
        svc.get_position.return_value = {"x_mm": 0.0, "y_mm": 0.0, "tool_state": "pen"}
        mock_get.return_value = svc
        response = client.post("/api/device/tool", json={"action": "pen"})
    assert response.status_code == 200
    svc.set_tool.assert_called_once_with("pen")


def test_get_position():
    with patch("studio.backend.routers.device.get_device_service") as mock_get:
        svc = MagicMock()
        svc.get_position.return_value = {"x_mm": 5.0, "y_mm": 10.0, "tool_state": "pen"}
        mock_get.return_value = svc
        response = client.get("/api/device/position")
    assert response.status_code == 200
    data = response.json()
    assert data["x_mm"] == 5.0
    assert data["y_mm"] == 10.0
    assert data["tool_state"] == "pen"


def test_reset_position():
    with patch("studio.backend.routers.device.get_device_service") as mock_get:
        svc = MagicMock()
        svc.get_position.return_value = {"x_mm": 0.0, "y_mm": 0.0, "tool_state": "up"}
        mock_get.return_value = svc
        response = client.post("/api/device/reset-position")
    assert response.status_code == 200
    svc.reset_position.assert_called_once()
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd studio && python -m pytest backend/tests/test_device.py::test_jog_not_connected -v
```
Expected: `FAILED` — 404 or 422 (route doesn't exist yet)

- [ ] **Step 3: Add imports and five new endpoints to `studio/backend/routers/device.py`**

Replace the entire file content with:

```python
from fastapi import APIRouter, HTTPException
from studio.backend.models import DeviceStatus, JogRequest, ToolRequest, PositionResponse
from studio.backend.device_service import get_device_service

router = APIRouter()


@router.get("/status", response_model=DeviceStatus)
def device_status() -> DeviceStatus:
    svc = get_device_service()
    if not svc.is_connected():
        return DeviceStatus(connected=False, status="not_found")
    return DeviceStatus(
        connected=True,
        status=svc.status(),
        version=svc.version(),
        port=svc.port,
    )


@router.post("/connect", response_model=DeviceStatus)
def device_connect() -> DeviceStatus:
    svc = get_device_service()
    try:
        svc.connect()
    except RuntimeError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return DeviceStatus(
        connected=True,
        status=svc.status(),
        version=svc.version(),
        port=svc.port,
    )


@router.post("/disconnect")
def device_disconnect() -> dict:
    get_device_service().disconnect()
    return {"disconnected": True}


@router.post("/jog")
def device_jog(req: JogRequest) -> dict:
    svc = get_device_service()
    if not svc.is_connected():
        raise HTTPException(status_code=409, detail="Device not connected")
    try:
        svc.jog(req.dx_mm, req.dy_mm)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return svc.get_position()


@router.post("/home")
def device_home() -> dict:
    svc = get_device_service()
    if not svc.is_connected():
        raise HTTPException(status_code=409, detail="Device not connected")
    try:
        svc.home()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return svc.get_position()


@router.post("/tool")
def device_tool(req: ToolRequest) -> dict:
    svc = get_device_service()
    if not svc.is_connected():
        raise HTTPException(status_code=409, detail="Device not connected")
    if req.action not in ("up", "pen", "blade"):
        raise HTTPException(status_code=422, detail="action must be 'up', 'pen', or 'blade'")
    try:
        svc.set_tool(req.action)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return svc.get_position()


@router.post("/reset-position")
def device_reset_position() -> dict:
    svc = get_device_service()
    svc.reset_position()
    return svc.get_position()


@router.get("/position", response_model=PositionResponse)
def device_position() -> PositionResponse:
    return PositionResponse(**get_device_service().get_position())
```

- [ ] **Step 4: Run all device tests**

```bash
cd studio && python -m pytest backend/tests/test_device.py -v
```
Expected: all tests PASSED

- [ ] **Step 5: Commit**

```bash
git add studio/backend/routers/device.py studio/backend/tests/test_device.py
git commit -m "feat(teach-panel): add jog/home/tool/position endpoints"
```

---

## Task 4: Frontend Types and API Client

**Files:**
- Modify: `studio/frontend/src/renderer/types.ts`
- Modify: `studio/frontend/src/renderer/api/client.ts`

- [ ] **Step 1: Add `PositionResponse` interface to `types.ts`**

Append after the `TraceResult` interface (before `MatSize`):

```typescript
export interface PositionResponse {
  x_mm: number
  y_mm: number
  tool_state: 'up' | 'pen' | 'blade'
}
```

- [ ] **Step 2: Add five new methods to `api/client.ts`**

Update the import line at the top:

```typescript
import type {
  CutJob, DeviceStatus, JobResponse, MediaPreset, TraceParams, TraceResult, PositionResponse
} from '../types'
```

Append these methods inside the `api` object (before the closing `}`):

```typescript
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
```

- [ ] **Step 3: Run frontend type-check**

```bash
cd studio/frontend && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add studio/frontend/src/renderer/types.ts studio/frontend/src/renderer/api/client.ts
git commit -m "feat(teach-panel): add PositionResponse type and API client methods"
```

---

## Task 5: useTeachPanel Hook

**Files:**
- Create: `studio/frontend/src/renderer/hooks/useTeachPanel.ts`

- [ ] **Step 1: Create the file**

```typescript
import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../api/client'
import type { PositionResponse } from '../types'

export const STEP_SIZES = [0.1, 1, 5, 10] as const
export type StepSize = typeof STEP_SIZES[number]

export interface TeachPanelState {
  position: PositionResponse
  stepMm: StepSize
  busy: boolean
  setStepMm: (s: StepSize) => void
  jog: (dx: number, dy: number) => void
  home: () => void
  setTool: (action: 'up' | 'pen' | 'blade') => void
  resetXY: () => void
}

const INITIAL_POSITION: PositionResponse = { x_mm: 0, y_mm: 0, tool_state: 'up' }

export function useTeachPanel(deviceConnected: boolean): TeachPanelState {
  const [position, setPosition] = useState<PositionResponse>(INITIAL_POSITION)
  const [stepMm, setStepMm] = useState<StepSize>(1)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  // Poll position every 500 ms while connected
  useEffect(() => {
    if (!deviceConnected) {
      setPosition(INITIAL_POSITION)
      return
    }
    const id = setInterval(async () => {
      try {
        const pos = await api.getPosition()
        setPosition(pos)
      } catch { /* device may not be ready */ }
    }, 500)
    return () => clearInterval(id)
  }, [deviceConnected])

  const withBusy = useCallback(async (fn: () => Promise<PositionResponse>) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      const result = await fn()
      setPosition(result)
    } catch { /* errors surface as device disconnected state */ }
    finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [])

  const jog = useCallback((dx: number, dy: number) => {
    withBusy(() => api.jogDevice(dx, dy))
  }, [withBusy])

  const home = useCallback(() => {
    withBusy(() => api.homeDevice())
  }, [withBusy])

  const setTool = useCallback((action: 'up' | 'pen' | 'blade') => {
    withBusy(() => api.setTool(action))
  }, [withBusy])

  const resetXY = useCallback(() => {
    withBusy(() => api.resetPosition())
  }, [withBusy])

  return { position, stepMm, busy, setStepMm, jog, home, setTool, resetXY }
}
```

- [ ] **Step 2: Run type-check**

```bash
cd studio/frontend && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add studio/frontend/src/renderer/hooks/useTeachPanel.ts
git commit -m "feat(teach-panel): add useTeachPanel hook"
```

---

## Task 6: TeachPanel Component

**Files:**
- Create: `studio/frontend/src/renderer/components/TeachPanel.tsx`

- [ ] **Step 1: Create the component file**

```tsx
import { useEffect, useRef, useState } from 'react'
import { STEP_SIZES } from '../hooks/useTeachPanel'
import type { TeachPanelState, StepSize } from '../hooks/useTeachPanel'

interface Props {
  state: TeachPanelState
  deviceConnected: boolean
  jobBusy: boolean
  onClose: () => void
}

export function TeachPanel({ state, deviceConnected, jobBusy, onClose }: Props) {
  const { position, stepMm, busy, setStepMm, jog, home, setTool, resetXY } = state
  const disabled = !deviceConnected || jobBusy || busy

  // Panel drag
  const [panelPos, setPanelPos] = useState({ x: window.innerWidth - 260, y: 80 })
  const dragOrigin = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null)

  // Keyboard jog
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (disabled) return
      if (e.key === 'ArrowRight') { e.preventDefault(); jog(stepMm, 0) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); jog(-stepMm, 0) }
      else if (e.key === 'ArrowDown') { e.preventDefault(); jog(0, stepMm) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); jog(0, -stepMm) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [disabled, jog, stepMm])

  const handleTitleDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragOrigin.current = { px: e.clientX, py: e.clientY, ox: panelPos.x, oy: panelPos.y }
  }
  const handleTitleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragOrigin.current) return
    setPanelPos({
      x: dragOrigin.current.ox + e.clientX - dragOrigin.current.px,
      y: dragOrigin.current.oy + e.clientY - dragOrigin.current.py,
    })
  }
  const endDrag = () => { dragOrigin.current = null }

  const toolLabel =
    position.tool_state === 'up' ? '▲ UP'
    : position.tool_state === 'pen' ? '✒ PEN'
    : '🔪 BLD'
  const toolColor =
    position.tool_state === 'up' ? 'text-green-400'
    : position.tool_state === 'pen' ? 'text-purple-400'
    : 'text-red-400'

  return (
    <div
      style={{ position: 'fixed', left: panelPos.x, top: panelPos.y, zIndex: 1000, width: 220 }}
      className="bg-slate-800 border-2 border-blue-500 rounded-xl shadow-2xl text-slate-200 text-xs select-none"
    >
      {/* Title / drag handle */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-slate-900 rounded-t-xl border-b border-slate-700 cursor-grab active:cursor-grabbing"
        onPointerDown={handleTitleDown}
        onPointerMove={handleTitleMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <span className="text-blue-400 font-bold text-sm">⚙ Teach Panel</span>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-300 px-1 leading-none">✕</button>
      </div>

      <div className="p-3 space-y-3">
        {/* Position display */}
        <div className="flex gap-2">
          {(['X', 'Y'] as const).map((axis) => (
            <div key={axis} className="flex-1 bg-slate-900 border border-slate-700 rounded p-2 text-center">
              <div className="text-slate-500 text-[9px] mb-0.5">{axis}</div>
              <div className="text-sky-400 font-bold text-sm">
                {(axis === 'X' ? position.x_mm : position.y_mm).toFixed(1)}
                <span className="text-slate-500 text-[9px] ml-0.5">mm</span>
              </div>
            </div>
          ))}
          <div className="flex-1 bg-slate-900 border border-slate-700 rounded p-2 text-center">
            <div className="text-slate-500 text-[9px] mb-0.5">Tool</div>
            <div className={`font-bold text-[10px] ${toolColor}`}>{toolLabel}</div>
          </div>
        </div>

        {/* Step size toggles */}
        <div>
          <div className="text-slate-500 text-[9px] uppercase tracking-wider mb-1">Schrittweite (mm)</div>
          <div className="flex gap-1">
            {STEP_SIZES.map((s) => (
              <button
                key={s}
                onClick={() => setStepMm(s as StepSize)}
                className={`flex-1 py-1 rounded text-center transition-colors ${
                  stepMm === s
                    ? 'bg-blue-700 border border-blue-400 text-blue-100 font-bold'
                    : 'bg-slate-900 border border-slate-700 hover:border-slate-500'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* D-Pad */}
        <div className="grid grid-cols-3 gap-1 w-[102px] mx-auto">
          <span />
          <JogBtn label="▲" onClick={() => jog(0, -stepMm)} disabled={disabled} />
          <span />
          <JogBtn label="◀" onClick={() => jog(-stepMm, 0)} disabled={disabled} />
          <button
            onClick={home}
            disabled={disabled}
            className="bg-green-950 border border-green-800 rounded py-1.5 text-center text-green-400 text-sm hover:bg-green-900 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            🏠
          </button>
          <JogBtn label="▶" onClick={() => jog(stepMm, 0)} disabled={disabled} />
          <span />
          <JogBtn label="▼" onClick={() => jog(0, stepMm)} disabled={disabled} />
          <span />
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-1">
          <ActionBtn label="⬆ Tool Up"  onClick={() => setTool('up')}    disabled={disabled} cls="border-blue-900   bg-blue-950   text-blue-300" />
          <ActionBtn label="✒ Pen ↓"    onClick={() => setTool('pen')}   disabled={disabled} cls="border-purple-900 bg-purple-950 text-purple-300" />
          <ActionBtn label="🔪 Blade ↓" onClick={() => setTool('blade')} disabled={disabled} cls="border-red-900    bg-red-950    text-red-300" />
          <ActionBtn label="↺ Reset XY" onClick={resetXY}                disabled={busy}     cls="border-slate-700 bg-slate-900  text-slate-400" />
        </div>

        <div className="text-slate-600 text-[8px] text-center">↑↓←→ Pfeiltasten wenn Panel aktiv</div>
      </div>
    </div>
  )
}

function JogBtn({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="bg-slate-900 border border-blue-800 rounded py-1.5 text-center text-blue-300 text-sm hover:bg-blue-950 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {label}
    </button>
  )
}

function ActionBtn({ label, onClick, disabled, cls }: { label: string; onClick: () => void; disabled: boolean; cls: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`border rounded py-1.5 text-center hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed ${cls}`}
    >
      {label}
    </button>
  )
}
```

- [ ] **Step 2: Run type-check**

```bash
cd studio/frontend && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add studio/frontend/src/renderer/components/TeachPanel.tsx
git commit -m "feat(teach-panel): add TeachPanel floating component"
```

---

## Task 7: App.tsx Integration + Electron Menu

**Files:**
- Modify: `studio/frontend/src/renderer/App.tsx`
- Modify: `studio/frontend/src/main/index.ts`

- [ ] **Step 1: Add teach panel state and IPC listener to `App.tsx`**

Add imports at the top of `App.tsx`:

```tsx
import { TeachPanel } from './components/TeachPanel'
import { useTeachPanel } from './hooks/useTeachPanel'
```

Inside the `App` component function, after the existing hook calls, add:

```tsx
const [showTeachPanel, setShowTeachPanel] = useState(false)
const teachPanelState = useTeachPanel(deviceStatus.connected)

useEffect(() => {
  return window.electron.ipcRenderer.on('teach-panel:toggle', () => {
    setShowTeachPanel(s => !s)
  })
}, [])
```

At the very bottom of the JSX return (just before the closing `</div>`), add:

```tsx
{showTeachPanel && (
  <TeachPanel
    state={teachPanelState}
    deviceConnected={deviceStatus.connected}
    jobBusy={jobState === 'previewing' || jobState === 'sending'}
    onClose={() => setShowTeachPanel(false)}
  />
)}
```

- [ ] **Step 2: Add `Menu` import and build Electron menu in `main/index.ts`**

Update the import line at the top of `studio/frontend/src/main/index.ts`:

```typescript
import { app, BrowserWindow, shell, ipcMain, Menu } from 'electron'
```

Add the menu setup inside `app.whenReady().then(async () => { ... })`, **after** `createWindow()`:

```typescript
Menu.setApplicationMenu(
  Menu.buildFromTemplate([
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      label: 'Extras',
      submenu: [
        {
          label: 'Teach Panel',
          accelerator: 'CmdOrCtrl+Shift+T',
          click: () => mainWindow?.webContents.send('teach-panel:toggle'),
        },
      ],
    },
    { role: 'helpMenu' },
  ])
)
```

- [ ] **Step 3: Run type-check**

```bash
cd studio/frontend && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Run all frontend tests**

```bash
cd studio/frontend && npx vitest run
```
Expected: all tests PASSED

- [ ] **Step 5: Run all backend tests**

```bash
cd studio && python -m pytest backend/tests/ -v
```
Expected: all tests PASSED

- [ ] **Step 6: Commit**

```bash
git add studio/frontend/src/renderer/App.tsx studio/frontend/src/main/index.ts
git commit -m "feat(teach-panel): wire IPC toggle in App.tsx and add Extras menu"
```

---

## Manual Smoke Test

After all tasks are complete:

1. Start the app: `cd studio/frontend && npm run dev`
2. Click **Extras → Teach Panel** in the menu bar → panel appears top-right
3. Press `Ctrl+Shift+T` → panel toggles
4. Drag the title bar → panel moves
5. Click **✕** → panel closes
6. Without device: all jog/home/tool buttons are greyed out
7. With device connected:
   - Click step size `5` → becomes highlighted
   - Click ▶ → device moves +5mm on X, position display updates
   - Press ← arrow key → device moves -5mm on X
   - Click 🏠 → home cycle runs, position resets to 0.0 / 0.0
   - Click ✒ Pen ↓ → tool lowers, display shows `✒ PEN`
   - Click ⬆ Tool Up → tool raises, display shows `▲ UP`
   - Click ↺ Reset XY → position display resets to 0.0 / 0.0 without moving
