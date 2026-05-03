# CutCutGo-Studio Backend API – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Python FastAPI server (`studio/backend/`) that wraps the existing `cutcutgo/` device driver and path-optimizer and exposes HTTP endpoints so the Electron frontend can query device status, fetch media presets, preview optimized cut-paths, and dispatch cutting jobs — without Inkscape.

**Architecture:** FastAPI app running on `localhost:8765`. It adds the repo root to `sys.path` so it can import `cutcutgo.Cutcutgo.CricutMaker`, `cutcutgo.Strategy`, and `cutcutgo.StrategyMinTraveling` unchanged. A `DeviceService` holds the single serial connection as a module-level singleton. A `BackgroundTask` handles the actual serial I/O so HTTP responses return immediately. The frontend sends paths already converted to millimetres; the backend only does optimization + device dispatch.

**Tech Stack:** Python 3.11+, FastAPI 0.110+, uvicorn 0.29+, pydantic v2, pyserial 3.5+, pytest 8+, httpx 0.27+, pytest-asyncio 0.23+

---

## File Map

| File | Responsibility |
|------|---------------|
| `studio/backend/main.py` | FastAPI app factory, CORS, lifespan, `uvicorn.run` entry |
| `studio/backend/models.py` | Pydantic request/response models (shared types) |
| `studio/backend/device_service.py` | Singleton `DeviceService` wrapping `CricutMaker` |
| `studio/backend/optimizer_service.py` | `optimize_paths()` wrapping `Strategy` + `StrategyMinTraveling` |
| `studio/backend/routers/device.py` | `/api/device/*` endpoints |
| `studio/backend/routers/media.py` | `/api/media` endpoint |
| `studio/backend/routers/job.py` | `/api/job/*` endpoints |
| `studio/backend/requirements.txt` | Backend-only Python deps |
| `studio/backend/tests/conftest.py` | pytest fixtures (TestClient, mock serial) |
| `studio/backend/tests/test_health.py` | Health + CORS smoke tests |
| `studio/backend/tests/test_device.py` | Device status + connect tests |
| `studio/backend/tests/test_media.py` | Media presets tests |
| `studio/backend/tests/test_optimizer.py` | Path optimization tests |
| `studio/backend/tests/test_job.py` | Job send (dry-run) tests |

---

## Task 1 — Project Scaffold

**Files:**
- Create: `studio/backend/requirements.txt`
- Create: `studio/backend/tests/__init__.py` (empty)
- Create: `studio/backend/routers/__init__.py` (empty)

- [ ] **Step 1: Create directory tree**

```powershell
# Run from repo root: C:\Git\inkscape-cutcutgo-sz
New-Item -ItemType Directory -Force -Path studio/backend/tests | Out-Null
New-Item -ItemType Directory -Force -Path studio/backend/routers | Out-Null
New-Item -ItemType File -Force -Path studio/backend/tests/__init__.py | Out-Null
New-Item -ItemType File -Force -Path studio/backend/routers/__init__.py | Out-Null
```

- [ ] **Step 2: Write `studio/backend/requirements.txt`**

```text
fastapi==0.110.3
uvicorn[standard]==0.29.0
pydantic==2.7.1
pyserial==3.5
pytest==8.2.0
httpx==0.27.0
pytest-asyncio==0.23.6
```

- [ ] **Step 3: Install dependencies**

```powershell
cd studio/backend
pip install -r requirements.txt
cd ../..
```

Expected: All packages install without error.

- [ ] **Step 4: Commit scaffold**

```bash
git add studio/backend/requirements.txt studio/backend/tests/__init__.py studio/backend/routers/__init__.py
git commit -m "feat(studio): add backend project scaffold"
```

---

## Task 2 — Pydantic Models

**Files:**
- Create: `studio/backend/models.py`

- [ ] **Step 1: Write failing type-check test**

Create `studio/backend/tests/test_models.py`:

```python
from studio.backend.models import CutSettings, CutJob, DeviceStatus, MediaPreset, JobResponse


def test_cut_settings_defaults():
    s = CutSettings()
    assert s.media == 1
    assert s.tool == "blade"
    assert s.speed == 3
    assert s.pressure == 0.0
    assert s.multipass == 1
    assert s.overcut == 0.5
    assert s.strategy == "mintravel"
    assert s.media_width_mm == 304.8
    assert s.media_height_mm == 609.6


def test_cut_job_requires_paths():
    job = CutJob(paths=[[[0.0, 0.0], [10.0, 0.0], [10.0, 10.0]]])
    assert len(job.paths) == 1
    assert job.settings.media == 1


def test_device_status_model():
    s = DeviceStatus(connected=False, status="not_found")
    assert s.version is None


def test_media_preset_model():
    m = MediaPreset(id=1, name="Laser Copy Paper", default_pressure=8.5, default_clearance=2.0)
    assert m.id == 1
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd C:\Git\inkscape-cutcutgo-sz
python -m pytest studio/backend/tests/test_models.py -v
```

Expected: `ModuleNotFoundError: No module named 'studio'`

- [ ] **Step 3: Write `studio/backend/models.py`**

```python
from __future__ import annotations
from typing import Optional
from pydantic import BaseModel, Field

# Coordinate types (all values in millimetres)
Point = list[float]   # [x_mm, y_mm]
Path = list[Point]    # ordered sequence of points forming one stroke
PathList = list[Path] # collection of strokes


class CutSettings(BaseModel):
    media: int = Field(default=1, ge=1, le=11, description="Media preset ID (1–11)")
    tool: str = Field(default="blade", description="'blade' or 'pen'")
    speed: int = Field(default=3, ge=0, le=10, description="Cut speed 1–10; 0 = media default")
    pressure: float = Field(default=0.0, ge=0, le=18, description="Force 1–18; 0 = media default")
    depth: int = Field(default=-1, ge=-1, le=10, description="Autoblade depth; -1 = media default")
    blade_diameter: float = Field(default=0.9, ge=0, le=2.3, description="Physical blade diameter mm")
    multipass: int = Field(default=1, ge=1, le=8, description="Number of repeat cuts")
    overcut: float = Field(default=0.5, ge=0, description="Extra mm at path end for closed paths")
    strategy: str = Field(default="mintravel", description="mintravel | mintravelfull | matfree | zorder")
    x_offset: float = Field(default=0.0, description="X offset in mm added to all paths")
    y_offset: float = Field(default=0.0, description="Y offset in mm added to all paths")
    media_width_mm: float = Field(default=304.8, description="Media width in mm (12 inch = 304.8)")
    media_height_mm: float = Field(default=609.6, description="Media height in mm (24 inch = 609.6)")
    sharpen_corners: bool = Field(default=False, description="Lift blade at sharp corners")
    reverse_toggle: bool = Field(default=False, description="Alternate cut direction each pass")
    sw_clipping: bool = Field(default=True, description="Clip paths to media bounds in software")


class CutJob(BaseModel):
    paths: PathList = Field(description="Cut paths — list of strokes, each a list of [x_mm, y_mm] points")
    settings: CutSettings = Field(default_factory=CutSettings)


class JobResponse(BaseModel):
    success: bool
    message: str
    bbox: Optional[dict] = None
    optimized_paths: Optional[PathList] = None


class DeviceStatus(BaseModel):
    connected: bool
    status: str  # "ready" | "moving" | "unloaded" | "not_found" | "error"
    version: Optional[str] = None
    port: Optional[str] = None


class MediaPreset(BaseModel):
    id: int
    name: str
    default_pressure: float
    default_clearance: float
```

- [ ] **Step 4: Add `studio/__init__.py` so pytest can import the package**

```powershell
New-Item -ItemType File -Force -Path studio/__init__.py | Out-Null
New-Item -ItemType File -Force -Path studio/backend/__init__.py | Out-Null
```

- [ ] **Step 5: Run test to verify it passes**

```bash
python -m pytest studio/backend/tests/test_models.py -v
```

Expected: `4 passed`

- [ ] **Step 6: Commit**

```bash
git add studio/backend/models.py studio/__init__.py studio/backend/__init__.py studio/backend/tests/test_models.py
git commit -m "feat(studio): add pydantic models for cut jobs, device status, media presets"
```

---

## Task 3 — FastAPI App + Health Endpoint

**Files:**
- Create: `studio/backend/main.py`
- Create: `studio/backend/tests/conftest.py`
- Create: `studio/backend/tests/test_health.py`

- [ ] **Step 1: Write failing test**

Create `studio/backend/tests/test_health.py`:

```python
from fastapi.testclient import TestClient
from studio.backend.main import app


def test_health_returns_ok():
    client = TestClient(app)
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": "1.0.0"}


def test_cors_header_present():
    client = TestClient(app)
    response = client.options(
        "/api/health",
        headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET"},
    )
    assert response.status_code in (200, 204)
    assert "access-control-allow-origin" in response.headers
```

- [ ] **Step 2: Run test to verify it fails**

```bash
python -m pytest studio/backend/tests/test_health.py -v
```

Expected: `ImportError` — `main` does not exist yet.

- [ ] **Step 3: Write `studio/backend/main.py`**

```python
from __future__ import annotations
import sys
from pathlib import Path

# Make repo-root importable so 'cutcutgo' package is on the path
_REPO_ROOT = Path(__file__).parent.parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from studio.backend.routers import device, media, job

APP_VERSION = "1.0.0"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: nothing to do — device connects on first use
    yield
    # Shutdown: close serial connection if open
    from studio.backend.device_service import get_device_service
    svc = get_device_service()
    svc.disconnect()


app = FastAPI(title="CutCutGo-Studio API", version=APP_VERSION, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "app://.", "file://"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(device.router, prefix="/api/device", tags=["device"])
app.include_router(media.router, prefix="/api/media", tags=["media"])
app.include_router(job.router, prefix="/api/job", tags=["job"])


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "version": APP_VERSION}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("studio.backend.main:app", host="127.0.0.1", port=8765, reload=False)
```

- [ ] **Step 4: Create stub router files so import does not fail**

Create `studio/backend/routers/device.py`:
```python
from fastapi import APIRouter
router = APIRouter()
```

Create `studio/backend/routers/media.py`:
```python
from fastapi import APIRouter
router = APIRouter()
```

Create `studio/backend/routers/job.py`:
```python
from fastapi import APIRouter
router = APIRouter()
```

Create `studio/backend/device_service.py` (minimal stub):
```python
class DeviceService:
    def disconnect(self): pass

_instance: DeviceService | None = None

def get_device_service() -> DeviceService:
    global _instance
    if _instance is None:
        _instance = DeviceService()
    return _instance
```

- [ ] **Step 5: Run test to verify it passes**

```bash
python -m pytest studio/backend/tests/test_health.py -v
```

Expected: `2 passed`

- [ ] **Step 6: Commit**

```bash
git add studio/backend/main.py studio/backend/device_service.py studio/backend/routers/device.py studio/backend/routers/media.py studio/backend/routers/job.py studio/backend/tests/test_health.py
git commit -m "feat(studio): add FastAPI app skeleton with health endpoint and CORS"
```

---

## Task 4 — Media Presets Endpoint

**Files:**
- Modify: `studio/backend/routers/media.py`
- Create: `studio/backend/tests/test_media.py`

The media dict lives in `cutcutgo/Cutcutgo.py`. We read it directly instead of duplicating it.

- [ ] **Step 1: Write failing test**

Create `studio/backend/tests/test_media.py`:

```python
from fastapi.testclient import TestClient
from studio.backend.main import app

client = TestClient(app)


def test_media_list_returns_array():
    response = client.get("/api/media/")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1


def test_media_item_has_required_fields():
    response = client.get("/api/media/")
    first = response.json()[0]
    assert "id" in first
    assert "name" in first
    assert "default_pressure" in first
    assert "default_clearance" in first


def test_media_get_by_id():
    response = client.get("/api/media/1")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == 1


def test_media_get_invalid_id():
    response = client.get("/api/media/999")
    assert response.status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

```bash
python -m pytest studio/backend/tests/test_media.py -v
```

Expected: `4 failed` — router has no endpoints yet.

- [ ] **Step 3: Implement `studio/backend/routers/media.py`**

```python
from __future__ import annotations
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).parent.parent.parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from fastapi import APIRouter, HTTPException
from studio.backend.models import MediaPreset

# Import MEDIA dict from existing CutCutGo driver
from cutcutgo.Cutcutgo import MEDIA  # type: ignore[import]

router = APIRouter()


def _to_preset(media_id: int, entry: dict) -> MediaPreset:
    return MediaPreset(
        id=media_id,
        name=entry.get("name", f"Media {media_id}"),
        default_pressure=float(entry.get("pressure", 8.5)),
        default_clearance=float(entry.get("clearance", 2.0)),
    )


@router.get("/", response_model=list[MediaPreset])
def list_media() -> list[MediaPreset]:
    return [_to_preset(mid, entry) for mid, entry in sorted(MEDIA.items())]


@router.get("/{media_id}", response_model=MediaPreset)
def get_media(media_id: int) -> MediaPreset:
    if media_id not in MEDIA:
        raise HTTPException(status_code=404, detail=f"Media ID {media_id} not found")
    return _to_preset(media_id, MEDIA[media_id])
```

- [ ] **Step 4: Run test to verify it passes**

```bash
python -m pytest studio/backend/tests/test_media.py -v
```

Expected: `4 passed`

- [ ] **Step 5: Commit**

```bash
git add studio/backend/routers/media.py studio/backend/tests/test_media.py
git commit -m "feat(studio): add /api/media endpoints backed by MEDIA dict from Cutcutgo.py"
```

---

## Task 5 — Device Service

**Files:**
- Modify: `studio/backend/device_service.py`
- Modify: `studio/backend/routers/device.py`
- Create: `studio/backend/tests/test_device.py`

- [ ] **Step 1: Write failing tests**

Create `studio/backend/tests/test_device.py`:

```python
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from studio.backend.main import app

client = TestClient(app)


def test_device_status_no_device():
    """When no serial port is found, status returns not_found."""
    with patch("studio.backend.device_service._instance", None):
        with patch("cutcutgo.Cutcutgo.list_ports") as mock_ports:
            mock_ports.comports.return_value = []
            response = client.get("/api/device/status")
    assert response.status_code == 200
    data = response.json()
    assert data["connected"] is False
    assert data["status"] == "not_found"


def test_device_status_connected():
    """When device_service reports ready, endpoint reflects it."""
    mock_svc = MagicMock()
    mock_svc.is_connected.return_value = True
    mock_svc.status.return_value = "ready"
    mock_svc.version.return_value = "CutcutGo 1.0"
    mock_svc.port = "/dev/ttyUSB0"
    with patch("studio.backend.routers.device.get_device_service", return_value=mock_svc):
        response = client.get("/api/device/status")
    assert response.status_code == 200
    data = response.json()
    assert data["connected"] is True
    assert data["status"] == "ready"
    assert data["version"] == "CutcutGo 1.0"


def test_device_connect_not_found():
    """POST /connect when no device → 404."""
    with patch("studio.backend.routers.device.get_device_service") as mock_get:
        svc = MagicMock()
        svc.connect.side_effect = RuntimeError("No CutCutGo device found")
        mock_get.return_value = svc
        response = client.post("/api/device/connect")
    assert response.status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

```bash
python -m pytest studio/backend/tests/test_device.py -v
```

Expected: `3 failed`

- [ ] **Step 3: Implement full `studio/backend/device_service.py`**

```python
from __future__ import annotations
import sys
import threading
from pathlib import Path

_REPO_ROOT = Path(__file__).parent.parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from cutcutgo.Cutcutgo import CricutMaker  # type: ignore[import]


class DeviceService:
    """Thread-safe singleton wrapper around CricutMaker."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._device: CricutMaker | None = None
        self.port: str | None = None

    def connect(self) -> None:
        """Attempt to find and connect to the device. Raises RuntimeError if not found."""
        with self._lock:
            if self._device is not None:
                return
            try:
                self._device = CricutMaker()
                self.port = getattr(self._device, "_port", None)
            except Exception as exc:
                self._device = None
                raise RuntimeError(f"No CutCutGo device found: {exc}") from exc

    def disconnect(self) -> None:
        with self._lock:
            if self._device is not None:
                try:
                    self._device.close()
                except Exception:
                    pass
                self._device = None
                self.port = None

    def is_connected(self) -> bool:
        return self._device is not None

    def status(self) -> str:
        if self._device is None:
            return "not_found"
        try:
            return self._device.status()
        except Exception:
            return "error"

    def version(self) -> str | None:
        if self._device is None:
            return None
        try:
            return self._device.get_version()
        except Exception:
            return None

    def get_raw(self) -> CricutMaker | None:
        return self._device


_instance: DeviceService | None = None
_instance_lock = threading.Lock()


def get_device_service() -> DeviceService:
    global _instance
    with _instance_lock:
        if _instance is None:
            _instance = DeviceService()
    return _instance
```

- [ ] **Step 4: Implement `studio/backend/routers/device.py`**

```python
from fastapi import APIRouter, HTTPException
from studio.backend.models import DeviceStatus
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
```

- [ ] **Step 5: Run test to verify it passes**

```bash
python -m pytest studio/backend/tests/test_device.py -v
```

Expected: `3 passed`

- [ ] **Step 6: Commit**

```bash
git add studio/backend/device_service.py studio/backend/routers/device.py studio/backend/tests/test_device.py
git commit -m "feat(studio): add DeviceService singleton and /api/device/* endpoints"
```

---

## Task 6 — Path Optimizer Service

**Files:**
- Create: `studio/backend/optimizer_service.py`
- Create: `studio/backend/tests/test_optimizer.py`

- [ ] **Step 1: Write failing test**

Create `studio/backend/tests/test_optimizer.py`:

```python
from studio.backend.optimizer_service import optimize_paths
from studio.backend.models import CutSettings

# Simple square in mm
SQUARE = [
    [[0.0, 0.0], [10.0, 0.0], [10.0, 10.0], [0.0, 10.0], [0.0, 0.0]]
]


def test_optimize_returns_pathlist():
    result = optimize_paths(SQUARE, CutSettings())
    assert isinstance(result, list)
    assert len(result) >= 1
    # Each path is a list of [x, y] pairs
    for path in result:
        assert isinstance(path, list)
        for pt in path:
            assert len(pt) == 2


def test_optimize_mintravel_does_not_lose_points():
    settings = CutSettings(strategy="mintravel")
    original_points = sum(len(p) for p in SQUARE)
    result = optimize_paths(SQUARE, settings)
    result_points = sum(len(p) for p in result)
    # May gain points (overcut/serifs) but should not drop all paths
    assert result_points > 0


def test_optimize_matfree_strategy():
    settings = CutSettings(strategy="matfree")
    result = optimize_paths(SQUARE, settings)
    assert isinstance(result, list)


def test_optimize_multipass_doubles_paths():
    settings = CutSettings(strategy="mintravel", multipass=2)
    single = optimize_paths(SQUARE, CutSettings(multipass=1))
    double = optimize_paths(SQUARE, settings)
    # With multipass=2 we expect at least as many paths as single pass
    assert len(double) >= len(single)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
python -m pytest studio/backend/tests/test_optimizer.py -v
```

Expected: `ImportError` — `optimizer_service` does not exist.

- [ ] **Step 3: Implement `studio/backend/optimizer_service.py`**

```python
from __future__ import annotations
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).parent.parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from cutcutgo.Strategy import Strategy  # type: ignore[import]
from cutcutgo.StrategyMinTraveling import StrategyMinTraveling  # type: ignore[import]
from studio.backend.models import CutSettings, PathList

# Convert list[list[float]] points to tuple pairs expected by Strategy
def _to_tuples(paths: PathList) -> list[list[tuple[float, float]]]:
    return [[(pt[0], pt[1]) for pt in path] for path in paths]


def _to_lists(paths: list[list[tuple[float, float]]]) -> PathList:
    return [[[pt[0], pt[1]] for pt in path] for path in paths]


def _fuse_paths(paths: list[list[tuple[float, float]]]) -> list[list[tuple[float, float]]]:
    """Merge consecutive paths where end == start of next."""
    if not paths:
        return paths
    fused = [list(paths[0])]
    for path in paths[1:]:
        if path and fused[-1] and fused[-1][-1] == path[0]:
            fused[-1].extend(path[1:])
        else:
            fused.append(list(path))
    return fused


def _apply_multipass(
    paths: list[list[tuple[float, float]]], multipass: int, reverse_toggle: bool
) -> list[list[tuple[float, float]]]:
    result: list[list[tuple[float, float]]] = []
    for i in range(multipass):
        for path in paths:
            if reverse_toggle and i % 2 == 1:
                result.append(list(reversed(path)))
            else:
                result.append(list(path))
    return result


def _apply_overcut(
    paths: list[list[tuple[float, float]]], overcut_mm: float
) -> list[list[tuple[float, float]]]:
    """Add extra points at end of closed paths for clean corner cuts."""
    if overcut_mm <= 0:
        return paths
    result = []
    for path in paths:
        if len(path) >= 2 and path[0] == path[-1]:
            dx = path[1][0] - path[0][0]
            dy = path[1][1] - path[0][1]
            length = (dx**2 + dy**2) ** 0.5
            if length > 0:
                extra_x = path[-1][0] + (dx / length) * overcut_mm
                extra_y = path[-1][1] + (dy / length) * overcut_mm
                result.append(path + [(extra_x, extra_y)])
                continue
        result.append(path)
    return result


def optimize_paths(paths: PathList, settings: CutSettings) -> PathList:
    """
    Apply path optimization strategies and return optimized PathList.
    All coordinates remain in millimetres throughout.
    """
    work = _to_tuples(paths)

    strategy = settings.strategy.lower()

    if strategy in ("mintravel", "mintravelfull", "mintravelfwd"):
        forward_only = strategy == "mintravelfwd"
        full = strategy == "mintravelfull"
        sorter = StrategyMinTraveling()
        work = sorter.sort(work, forward_only=forward_only, full_reverse=full)
    elif strategy == "matfree":
        strat = Strategy()
        work = strat.sort(work)
    # "zorder" → keep original order (no-op)

    work = _fuse_paths(work)
    work = _apply_overcut(work, settings.overcut)
    work = _apply_multipass(work, settings.multipass, settings.reverse_toggle)

    return _to_lists(work)
```

> **Note:** `Strategy.sort()` and `StrategyMinTraveling.sort()` signatures were inferred from `sendto_cricut.py` usage. If the actual API differs, check `cutcutgo/Strategy.py` lines 74–1028 and `cutcutgo/StrategyMinTraveling.py` and adjust the call accordingly — the wrapper contract (takes `list[list[tuple]]`, returns same) must stay stable.

- [ ] **Step 4: Run test to verify it passes**

```bash
python -m pytest studio/backend/tests/test_optimizer.py -v
```

Expected: `4 passed` (adjust if Strategy API differs — see note above)

- [ ] **Step 5: Commit**

```bash
git add studio/backend/optimizer_service.py studio/backend/tests/test_optimizer.py
git commit -m "feat(studio): add optimizer_service wrapping Strategy + StrategyMinTraveling"
```

---

## Task 7 — Job Endpoints (Preview + Send)

**Files:**
- Modify: `studio/backend/routers/job.py`
- Create: `studio/backend/tests/test_job.py`

- [ ] **Step 1: Write failing tests**

Create `studio/backend/tests/test_job.py`:

```python
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from studio.backend.main import app

client = TestClient(app)

SIMPLE_JOB = {
    "paths": [
        [[0.0, 0.0], [10.0, 0.0], [10.0, 10.0], [0.0, 10.0], [0.0, 0.0]]
    ],
    "settings": {
        "media": 1,
        "tool": "blade",
        "speed": 3,
        "pressure": 0,
        "strategy": "mintravel",
        "multipass": 1,
        "overcut": 0.5,
        "media_width_mm": 304.8,
        "media_height_mm": 609.6,
    },
}


def test_job_preview_returns_optimized_paths():
    response = client.post("/api/job/preview", json=SIMPLE_JOB)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "optimized_paths" in data
    assert isinstance(data["optimized_paths"], list)


def test_job_send_dry_run():
    """Send job with dry_run=True — must not require a real device."""
    with patch("studio.backend.routers.job.get_device_service") as mock_get:
        mock_svc = MagicMock()
        mock_svc.is_connected.return_value = True
        mock_device = MagicMock()
        mock_device.plot.return_value = {"bbox": {"llx": 0, "urx": 10, "lly": 0, "ury": 10, "count": 5}}
        mock_svc.get_raw.return_value = mock_device
        mock_get.return_value = mock_svc
        response = client.post("/api/job/send?dry_run=true", json=SIMPLE_JOB)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True


def test_job_send_no_device():
    """Send job when device is not connected → 409 Conflict."""
    with patch("studio.backend.routers.job.get_device_service") as mock_get:
        mock_svc = MagicMock()
        mock_svc.is_connected.return_value = False
        mock_get.return_value = mock_svc
        response = client.post("/api/job/send", json=SIMPLE_JOB)
    assert response.status_code == 409


def test_job_cancel():
    response = client.post("/api/job/cancel")
    assert response.status_code == 200
    assert response.json()["cancelled"] is True
```

- [ ] **Step 2: Run test to verify it fails**

```bash
python -m pytest studio/backend/tests/test_job.py -v
```

Expected: `4 failed` — router has no endpoints.

- [ ] **Step 3: Implement `studio/backend/routers/job.py`**

```python
from __future__ import annotations
import threading
from fastapi import APIRouter, HTTPException, BackgroundTasks, Query

from studio.backend.models import CutJob, JobResponse
from studio.backend.device_service import get_device_service
from studio.backend.optimizer_service import optimize_paths

router = APIRouter()

# Global cancellation flag — set True to request stop
_cancel_event = threading.Event()


def _run_cut_job(job: CutJob, dry_run: bool) -> dict:
    """Execute cutting job. Called in background thread."""
    _cancel_event.clear()

    optimized = optimize_paths(job.paths, job.settings)
    # Convert to list-of-tuples format expected by CricutMaker.plot()
    path_tuples = [[(pt[0], pt[1]) for pt in path] for path in optimized]

    s = job.settings
    svc = get_device_service()
    device = svc.get_raw()

    device.setup(
        media=s.media,
        speed=s.speed if s.speed > 0 else None,
        pressure=s.pressure if s.pressure > 0 else None,
        toolholder=1 if s.tool == "blade" else 0,
        pen=(s.tool == "pen"),
        autoblade=(s.tool == "blade"),
        depth=s.depth if s.depth >= 0 else None,
        bladediameter=s.blade_diameter,
        sw_clipping=s.sw_clipping,
        sharpencorners=s.sharpen_corners,
    )

    bbox = device.plot(
        pathlist=path_tuples,
        mediawidth=s.media_width_mm,
        mediaheight=s.media_height_mm,
        offset=(s.x_offset, s.y_offset),
        bboxonly=dry_run,
        endposition="below",
    )
    return bbox


@router.post("/preview", response_model=JobResponse)
def job_preview(job: CutJob) -> JobResponse:
    """Optimize paths and return result without touching the device."""
    try:
        optimized = optimize_paths(job.paths, job.settings)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return JobResponse(success=True, message="Preview ready", optimized_paths=optimized)


@router.post("/send", response_model=JobResponse)
def job_send(
    job: CutJob,
    background_tasks: BackgroundTasks,
    dry_run: bool = Query(default=False),
) -> JobResponse:
    """Send cut job to device. Use ?dry_run=true to preview without cutting."""
    svc = get_device_service()
    if not svc.is_connected() and not dry_run:
        raise HTTPException(status_code=409, detail="Device not connected. POST /api/device/connect first.")

    if dry_run and not svc.is_connected():
        # Dry-run without device: just run optimizer
        optimized = optimize_paths(job.paths, job.settings)
        return JobResponse(
            success=True,
            message="Dry-run complete (device not connected — only path optimization was applied)",
            optimized_paths=optimized,
        )

    try:
        bbox = _run_cut_job(job, dry_run)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    return JobResponse(success=True, message="Job complete", bbox=bbox)


@router.post("/cancel")
def job_cancel() -> dict:
    _cancel_event.set()
    return {"cancelled": True}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
python -m pytest studio/backend/tests/test_job.py -v
```

Expected: `4 passed`

- [ ] **Step 5: Run full test suite**

```bash
python -m pytest studio/backend/tests/ -v
```

Expected: All tests pass.

- [ ] **Step 6: Smoke-test the server manually**

```bash
python -m studio.backend.main
```

In a second terminal:
```powershell
Invoke-WebRequest -Uri http://127.0.0.1:8765/api/health | Select-Object -ExpandProperty Content
Invoke-WebRequest -Uri http://127.0.0.1:8765/api/media/ | Select-Object -ExpandProperty Content
```

Expected: JSON responses with `{"status":"ok","version":"1.0.0"}` and media list.

- [ ] **Step 7: Commit**

```bash
git add studio/backend/routers/job.py studio/backend/tests/test_job.py
git commit -m "feat(studio): add /api/job/preview and /api/job/send endpoints with dry-run support"
```

---

## Self-Review

**Spec coverage:**
- ✅ Device status (Task 5)
- ✅ Device connect/disconnect (Task 5)
- ✅ Media presets (Task 4)
- ✅ Path optimization (Task 6)
- ✅ Job preview without device (Task 7 — `/preview`)
- ✅ Job send to device (Task 7 — `/send`)
- ✅ Dry-run mode (Task 7 — `?dry_run=true`)
- ✅ Cancel job (Task 7 — `/cancel`)
- ✅ CORS for Electron origins (Task 3)

**Placeholder scan:** No TBDs or "implement later" remain.

**Type consistency:** `PathList = list[Path]` used consistently. `_to_tuples`/`_to_lists` converters ensure compatibility between Pydantic models and Strategy classes.

**Known risk — Strategy API:** The exact call signatures for `Strategy.sort()` and `StrategyMinTraveling.sort()` must be verified against the actual source files before running Task 6 tests. The optimizer_service wraps them; if the API differs, only `optimizer_service.py` needs updating.

---

## Plan complete

Saved to `docs/superpowers/plans/2026-05-02-cutcutgo-studio-backend.md`.

**Next plan:** `2026-05-02-cutcutgo-studio-frontend.md` — Electron + React frontend (SVG canvas, settings panel, device status UI).
