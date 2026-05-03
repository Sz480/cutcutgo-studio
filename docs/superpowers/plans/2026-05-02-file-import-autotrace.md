# File Import & Auto-Vectorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add PNG/JPG auto-tracing and robust SVG import to CutCutGo Studio so no external tools are needed.

**Architecture:** A new Python `tracer` service uses `vtracer` + `Pillow` to convert raster images to PathList via a `POST /api/import/trace` endpoint. The frontend shows an ImportPanel modal for raster files with live debounced preview. The existing SVG parser is extended to resolve `<use>` elements and warn on `<text>`.

**Tech Stack:** Python vtracer, Pillow, FastAPI multipart upload, React modal, TypeScript, axios FormData.

---

## File Map

| Action | Path |
|--------|------|
| Modify | `studio/backend/requirements.txt` |
| Modify | `studio/backend/models.py` |
| Create | `studio/backend/services/__init__.py` |
| Create | `studio/backend/services/tracer.py` |
| Create | `studio/backend/routers/import_file.py` |
| Modify | `studio/backend/main.py` |
| Create | `studio/backend/tests/test_tracer.py` |
| Create | `studio/backend/tests/test_import.py` |
| Modify | `studio/frontend/src/renderer/types.ts` |
| Modify | `studio/frontend/src/renderer/api/client.ts` |
| Modify | `studio/frontend/src/renderer/svg/parser.ts` |
| Create | `studio/frontend/src/renderer/hooks/useImport.ts` |
| Create | `studio/frontend/src/renderer/components/ImportPanel.tsx` |
| Modify | `studio/frontend/src/renderer/App.tsx` |
| Modify | `studio/frontend/src/renderer/components/Toolbar.tsx` |

---

## Task 1: Install Python Dependencies

**Files:**
- Modify: `studio/backend/requirements.txt`

- [ ] **Step 1: Add dependencies to requirements.txt**

Replace the contents of `studio/backend/requirements.txt` with:

```
fastapi==0.110.3
uvicorn[standard]==0.29.0
pydantic==2.7.1
pyserial==3.5
pytest==8.2.0
httpx==0.27.0
pytest-asyncio==0.23.6
vtracer>=0.6.0
Pillow>=10.0.0
```

- [ ] **Step 2: Install the new packages**

```bash
cd studio/backend
pip install vtracer "Pillow>=10.0.0"
```

Expected: both install without errors.

- [ ] **Step 3: Verify vtracer is importable**

```bash
python -c "import vtracer; print('vtracer ok')"
```

Expected: `vtracer ok`

- [ ] **Step 4: Commit**

```bash
git add studio/backend/requirements.txt
git commit -m "chore(backend): add vtracer and Pillow dependencies"
```

---

## Task 2: Add Backend Models

**Files:**
- Modify: `studio/backend/models.py`

- [ ] **Step 1: Write the failing test**

Create `studio/backend/tests/test_models_trace.py`:

```python
from studio.backend.models import TraceMode, TraceParams, ColorLayer, TraceResult

def test_trace_params_defaults():
    p = TraceParams()
    assert p.mode == TraceMode.silhouette
    assert p.threshold == 128
    assert p.num_colors == 4
    assert p.smoothness == 1.0
    assert p.media_width_mm == 304.8

def test_trace_result_empty_layers():
    r = TraceResult(paths=[[[0.0, 0.0], [10.0, 0.0]]])
    assert r.layers == []

def test_color_layer():
    layer = ColorLayer(color="#ff0000", paths=[[[0.0, 0.0], [5.0, 5.0]]])
    assert layer.color == "#ff0000"
    assert len(layer.paths) == 1
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd studio/backend
pytest tests/test_models_trace.py -v
```

Expected: `ImportError` — `TraceMode` not defined yet.

- [ ] **Step 3: Add models to `studio/backend/models.py`**

Add after the existing imports and before `CutSettings`:

```python
from enum import Enum

class TraceMode(str, Enum):
    silhouette = "silhouette"
    color      = "color"

class TraceParams(BaseModel):
    mode:           TraceMode = TraceMode.silhouette
    threshold:      int   = Field(default=128, ge=0, le=255)
    num_colors:     int   = Field(default=4, ge=2, le=8)
    smoothness:     float = Field(default=1.0, ge=0.0, le=10.0)
    media_width_mm: float = Field(default=304.8, gt=0)

class ColorLayer(BaseModel):
    color: str
    paths: PathList

class TraceResult(BaseModel):
    paths:  PathList
    layers: list[ColorLayer] = []
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest tests/test_models_trace.py -v
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add studio/backend/models.py studio/backend/tests/test_models_trace.py
git commit -m "feat(backend): add TraceMode, TraceParams, ColorLayer, TraceResult models"
```

---

## Task 3: Implement Tracer Service

**Files:**
- Create: `studio/backend/services/__init__.py`
- Create: `studio/backend/services/tracer.py`
- Create: `studio/backend/tests/test_tracer.py`

- [ ] **Step 1: Write the failing tests**

Create `studio/backend/tests/test_tracer.py`:

```python
import io
import pytest
from PIL import Image, ImageDraw
from studio.backend.models import TraceParams, TraceMode, TraceResult
from studio.backend.services.tracer import trace


def _make_png(width=100, height=100, bg=(255, 255, 255), rect=None):
    """Create an in-memory PNG. If rect given, draw a filled black rectangle."""
    img = Image.new('RGB', (width, height), bg)
    if rect:
        draw = ImageDraw.Draw(img)
        draw.rectangle(rect, fill=(0, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return buf.getvalue()


def test_trace_white_image_silhouette_returns_result():
    """All-white image in silhouette mode: vtracer may return empty or minimal paths."""
    png = _make_png()
    result = trace(png, TraceParams(mode=TraceMode.silhouette))
    assert isinstance(result, TraceResult)
    assert isinstance(result.paths, list)
    assert result.layers == []  # silhouette mode → no layers


def test_trace_rect_silhouette_returns_paths():
    """Black rectangle on white: silhouette mode should return at least one path."""
    png = _make_png(rect=[20, 20, 80, 80])
    result = trace(png, TraceParams(mode=TraceMode.silhouette, smoothness=1.0))
    assert isinstance(result, TraceResult)
    assert len(result.paths) >= 1
    for path in result.paths:
        assert len(path) >= 2
        for pt in path:
            assert len(pt) == 2  # [x_mm, y_mm]


def test_trace_rect_color_returns_layers():
    """Color mode should populate layers list."""
    png = _make_png(rect=[20, 20, 80, 80])
    result = trace(png, TraceParams(mode=TraceMode.color, num_colors=2))
    assert isinstance(result, TraceResult)
    assert len(result.layers) >= 1
    for layer in result.layers:
        assert layer.color.startswith('#')
        assert len(layer.paths) >= 1


def test_trace_paths_within_media_bounds():
    """All path coordinates must fit within media_width_mm (proportional scaling)."""
    png = _make_png(width=200, height=100, rect=[10, 10, 190, 90])
    params = TraceParams(mode=TraceMode.silhouette, media_width_mm=100.0)
    result = trace(png, params)
    for path in result.paths:
        for x, y in path:
            assert x <= params.media_width_mm + 1.0  # 1mm tolerance
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_tracer.py -v
```

Expected: `ImportError` or `ModuleNotFoundError` — `studio.backend.services.tracer` not found.

- [ ] **Step 3: Create `studio/backend/services/__init__.py`**

```python
```

(empty file)

- [ ] **Step 4: Create `studio/backend/services/tracer.py`**

```python
from __future__ import annotations
import io
import re
import xml.etree.ElementTree as ET

from PIL import Image
import vtracer

from studio.backend.models import TraceMode, TraceParams, ColorLayer, TraceResult

_SVG_NS = 'http://www.w3.org/2000/svg'
_MAX_DIM = 2000  # max pixel dimension before resize


def trace(image_bytes: bytes, params: TraceParams) -> TraceResult:
    img = Image.open(io.BytesIO(image_bytes)).convert('RGB')

    # Resize to max _MAX_DIM on longest side
    w, h = img.size
    if max(w, h) > _MAX_DIM:
        ratio = _MAX_DIM / max(w, h)
        img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)
        w, h = img.size

    scale_x = params.media_width_mm / w
    scale_y = scale_x  # proportional

    if params.mode == TraceMode.silhouette:
        gray = img.convert('L')
        bw = gray.point(lambda p: 255 if p > params.threshold else 0).convert('RGB')
        png_bytes = _to_png_bytes(bw)
        colormode = 'binary'
    else:
        png_bytes = _to_png_bytes(img)
        colormode = 'color'

    svg_str = vtracer.convert_raw_image_to_svg(
        png_bytes,
        colormode=colormode,
        filter_speckle=max(1, int(params.smoothness * 4)),
        color_precision=params.num_colors,
        mode='spline',
        hierarchical='stacked',
    )

    all_paths, color_layers = _parse_svg(svg_str, scale_x, scale_y)

    return TraceResult(
        paths=all_paths,
        layers=color_layers if params.mode == TraceMode.color else [],
    )


def _to_png_bytes(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return buf.getvalue()


def _parse_svg(svg_str: str, sx: float, sy: float) -> tuple[list, list]:
    root = ET.fromstring(svg_str)
    all_paths: list = []
    layers: dict[str, list] = {}

    for el in root.iter(f'{{{_SVG_NS}}}path'):
        d = el.get('d', '')
        fill = el.get('fill', '#000000')
        pts = _sample_path(d, sx, sy)
        if len(pts) >= 2:
            all_paths.append(pts)
            layers.setdefault(fill, []).append(pts)

    color_layers = [ColorLayer(color=c, paths=p) for c, p in layers.items()]
    return all_paths, color_layers


def _sample_path(d: str, sx: float, sy: float, smoothness: float = 0.05) -> list:
    cmds = _parse_commands(d)
    pts: list = []
    cx = cy = sx_start = sy_start = 0.0
    last_cp2x = last_cp2y = None

    for cmd in cmds:
        t = cmd['type']
        if t == 'M':
            cx, cy = cmd['x'], cmd['y']
            sx_start, sy_start = cx, cy
            pts.append([cx * sx, cy * sy])
            last_cp2x = last_cp2y = None
        elif t == 'L':
            cx, cy = cmd['x'], cmd['y']
            pts.append([cx * sx, cy * sy])
            last_cp2x = last_cp2y = None
        elif t == 'C':
            sub = _subdivide(cx, cy, cmd['x1'], cmd['y1'], cmd['x2'], cmd['y2'],
                             cmd['x'], cmd['y'], smoothness)
            pts.extend([[px * sx, py * sy] for px, py in sub])
            last_cp2x, last_cp2y = cmd['x2'], cmd['y2']
            cx, cy = cmd['x'], cmd['y']
        elif t == 'S':
            x1 = 2*cx - last_cp2x if last_cp2x is not None else cx
            y1 = 2*cy - last_cp2y if last_cp2y is not None else cy
            sub = _subdivide(cx, cy, x1, y1, cmd['x2'], cmd['y2'],
                             cmd['x'], cmd['y'], smoothness)
            pts.extend([[px * sx, py * sy] for px, py in sub])
            last_cp2x, last_cp2y = cmd['x2'], cmd['y2']
            cx, cy = cmd['x'], cmd['y']
        elif t == 'Z':
            pts.append([sx_start * sx, sy_start * sy])
            last_cp2x = last_cp2y = None
    return pts


_RE_CMD = re.compile(r'([MLCSZmlcsz])([^MLCSZmlcsz]*)')
_RE_NUM = re.compile(r'-?[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?')


def _parse_commands(d: str) -> list:
    cmds = []
    lx = ly = 0.0
    lcp2x = lcp2y = None

    for m in _RE_CMD.finditer(d):
        letter = m.group(1)
        typ = letter.upper()
        rel = letter != typ
        nums = [float(n) for n in _RE_NUM.findall(m.group(2))]
        ox = lx if rel else 0.0
        oy = ly if rel else 0.0

        if typ not in ('C', 'S'):
            lcp2x = lcp2y = None

        if typ == 'M':
            for i in range(0, len(nums), 2):
                x, y = nums[i] + ox, nums[i+1] + oy
                cmds.append({'type': 'M' if i == 0 else 'L', 'x': x, 'y': y})
                lx, ly = x, y
        elif typ == 'L':
            for i in range(0, len(nums), 2):
                x, y = nums[i] + ox, nums[i+1] + oy
                cmds.append({'type': 'L', 'x': x, 'y': y})
                lx, ly = x, y
        elif typ == 'C':
            for i in range(0, len(nums), 6):
                x1, y1 = nums[i]+ox, nums[i+1]+oy
                x2, y2 = nums[i+2]+ox, nums[i+3]+oy
                x, y   = nums[i+4]+ox, nums[i+5]+oy
                cmds.append({'type': 'C', 'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2, 'x': x, 'y': y})
                lcp2x, lcp2y = x2, y2
                lx, ly = x, y
        elif typ == 'S':
            for i in range(0, len(nums), 4):
                x2, y2 = nums[i]+ox, nums[i+1]+oy
                x, y   = nums[i+2]+ox, nums[i+3]+oy
                cmds.append({'type': 'S', 'x2': x2, 'y2': y2, 'x': x, 'y': y})
                lcp2x, lcp2y = x2, y2
                lx, ly = x, y
        elif typ == 'Z':
            cmds.append({'type': 'Z'})

    return cmds


def _subdivide(x0, y0, x1, y1, x2, y2, x3, y3, eps):
    dx, dy = x3 - x0, y3 - y0
    d1 = abs((x1 - x3) * dy - (y1 - y3) * dx)
    d2 = abs((x2 - x3) * dy - (y2 - y3) * dx)
    if (d1 + d2) ** 2 <= eps * (dx*dx + dy*dy):
        return [(x3, y3)]
    mx01, my01 = (x0+x1)/2, (y0+y1)/2
    mx12, my12 = (x1+x2)/2, (y1+y2)/2
    mx23, my23 = (x2+x3)/2, (y2+y3)/2
    mx012, my012 = (mx01+mx12)/2, (my01+my12)/2
    mx123, my123 = (mx12+mx23)/2, (my12+my23)/2
    mx,  my  = (mx012+mx123)/2, (my012+my123)/2
    return (
        _subdivide(x0, y0, mx01, my01, mx012, my012, mx, my, eps) +
        _subdivide(mx, my, mx123, my123, mx23, my23, x3, y3, eps)
    )
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pytest tests/test_tracer.py -v
```

Expected: 4 tests PASS. If `test_trace_white_image_silhouette_returns_result` fails because vtracer raises on a blank binary image, wrap the vtracer call in a try/except and return `TraceResult(paths=[], layers=[])`.

- [ ] **Step 6: Commit**

```bash
git add studio/backend/services/ studio/backend/tests/test_tracer.py
git commit -m "feat(backend): implement tracer service with vtracer + Pillow"
```

---

## Task 4: Implement Import Router

**Files:**
- Create: `studio/backend/routers/import_file.py`
- Create: `studio/backend/tests/test_import.py`

- [ ] **Step 1: Write the failing tests**

Create `studio/backend/tests/test_import.py`:

```python
import io
import json
from PIL import Image, ImageDraw
from fastapi.testclient import TestClient
from studio.backend.main import app

client = TestClient(app)


def _png_bytes(rect=None):
    img = Image.new('RGB', (100, 100), (255, 255, 255))
    if rect:
        ImageDraw.Draw(img).rectangle(rect, fill=(0, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return buf.getvalue()


def test_trace_silhouette_returns_200():
    params = {"mode": "silhouette", "threshold": 128, "num_colors": 4,
              "smoothness": 1.0, "media_width_mm": 100.0}
    response = client.post(
        "/api/import/trace",
        data={"params": json.dumps(params)},
        files={"file": ("test.png", _png_bytes(rect=[20, 20, 80, 80]), "image/png")},
    )
    assert response.status_code == 200
    data = response.json()
    assert "paths" in data
    assert "layers" in data
    assert isinstance(data["paths"], list)


def test_trace_color_returns_layers():
    params = {"mode": "color", "threshold": 128, "num_colors": 2,
              "smoothness": 1.0, "media_width_mm": 100.0}
    response = client.post(
        "/api/import/trace",
        data={"params": json.dumps(params)},
        files={"file": ("test.png", _png_bytes(rect=[20, 20, 80, 80]), "image/png")},
    )
    assert response.status_code == 200
    data = response.json()
    assert "layers" in data


def test_trace_invalid_file_type_returns_422():
    params = {"mode": "silhouette", "threshold": 128, "num_colors": 4,
              "smoothness": 1.0, "media_width_mm": 100.0}
    response = client.post(
        "/api/import/trace",
        data={"params": json.dumps(params)},
        files={"file": ("test.txt", b"not an image", "text/plain")},
    )
    assert response.status_code == 422


def test_trace_oversized_file_returns_413():
    big_data = b"x" * (21 * 1024 * 1024)  # 21 MB
    params = {"mode": "silhouette", "threshold": 128, "num_colors": 4,
              "smoothness": 1.0, "media_width_mm": 100.0}
    response = client.post(
        "/api/import/trace",
        data={"params": json.dumps(params)},
        files={"file": ("big.png", big_data, "image/png")},
    )
    assert response.status_code == 413
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_import.py -v
```

Expected: 404 errors — route not registered yet.

- [ ] **Step 3: Create `studio/backend/routers/import_file.py`**

```python
from __future__ import annotations
import json

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from studio.backend.models import TraceParams, TraceResult
from studio.backend.services.tracer import trace

router = APIRouter()

_ALLOWED_CONTENT_TYPES = {"image/png", "image/jpeg", "image/jpg"}
_MAX_BYTES = 20 * 1024 * 1024  # 20 MB


@router.post("/trace", response_model=TraceResult)
async def trace_image(
    file: UploadFile = File(...),
    params: str = Form(...),
) -> TraceResult:
    if file.content_type not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=422, detail=f"Unsupported file type: {file.content_type}")

    image_bytes = await file.read()
    if len(image_bytes) > _MAX_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 20 MB limit")

    try:
        trace_params = TraceParams.model_validate(json.loads(params))
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Invalid params: {e}")

    try:
        return trace(image_bytes, trace_params)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Tracing failed: {e}")
```

- [ ] **Step 4: Run tests to verify they fail with 404 (router not registered yet)**

```bash
pytest tests/test_import.py -v
```

Expected: still 404 — we register the router in Task 5.

- [ ] **Step 5: Commit**

```bash
git add studio/backend/routers/import_file.py studio/backend/tests/test_import.py
git commit -m "feat(backend): add import router with /api/import/trace endpoint"
```

---

## Task 5: Register Import Router

**Files:**
- Modify: `studio/backend/main.py`

- [ ] **Step 1: Add the import router to `studio/backend/main.py`**

Change line 14 from:
```python
from studio.backend.routers import device, media, job
```
to:
```python
from studio.backend.routers import device, media, job, import_file
```

Add after line 38 (`app.include_router(job.router, ...)`):
```python
app.include_router(import_file.router, prefix="/api/import", tags=["import"])
```

- [ ] **Step 2: Run all backend tests to verify nothing is broken**

```bash
pytest studio/backend/tests/ -v
```

Expected: all tests PASS, including the 4 new import tests.

- [ ] **Step 3: Commit**

```bash
git add studio/backend/main.py
git commit -m "feat(backend): register import router at /api/import"
```

---

## Task 6: Add Frontend Types

**Files:**
- Modify: `studio/frontend/src/renderer/types.ts`

- [ ] **Step 1: Add trace types to `studio/frontend/src/renderer/types.ts`**

Append to the end of the file:

```typescript
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

export const DEFAULT_TRACE_PARAMS: TraceParams = {
  mode: 'silhouette',
  threshold: 128,
  num_colors: 4,
  smoothness: 1.0,
  media_width_mm: 304.8,
}
```

- [ ] **Step 2: Run frontend type check**

```bash
cd studio/frontend
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add studio/frontend/src/renderer/types.ts
git commit -m "feat(frontend): add TraceParams, ColorLayer, TraceResult types"
```

---

## Task 7: Extend API Client

**Files:**
- Modify: `studio/frontend/src/renderer/api/client.ts`
- Modify: `studio/frontend/tests/client.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `studio/frontend/tests/client.test.ts`:

```typescript
import type { TraceParams } from '../src/renderer/types'

describe('api.traceImage', () => {
  beforeEach(() => vi.resetAllMocks())

  it('posts multipart/form-data to /api/import/trace', async () => {
    mockedAxios.post = vi.fn().mockResolvedValue({
      data: { paths: [[[0, 0], [10, 10]]], layers: [] }
    })
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'test.png', { type: 'image/png' })
    const params: TraceParams = {
      mode: 'silhouette', threshold: 128, num_colors: 4, smoothness: 1.0, media_width_mm: 304.8
    }
    const result = await api.traceImage(file, params)
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'http://127.0.0.1:8765/api/import/trace',
      expect.any(FormData),
      expect.objectContaining({ headers: expect.objectContaining({ 'Content-Type': 'multipart/form-data' }) })
    )
    expect(result.paths).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd studio/frontend
npm test -- tests/client.test.ts
```

Expected: `TypeError` — `api.traceImage is not a function`.

- [ ] **Step 3: Add `traceImage` to `studio/frontend/src/renderer/api/client.ts`**

Add the import at the top:
```typescript
import type {
  CutJob, DeviceStatus, JobResponse, MediaPreset, TraceParams, TraceResult
} from '../types'
```

Add the method inside the `api` object, after `cancelJob`:
```typescript
  async traceImage(file: File, params: TraceParams): Promise<TraceResult> {
    const form = new FormData()
    form.append('file', file)
    form.append('params', JSON.stringify(params))
    const res = await axios.post(`${BASE}/api/import/trace`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return res.data
  },
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/client.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add studio/frontend/src/renderer/api/client.ts studio/frontend/tests/client.test.ts
git commit -m "feat(frontend): add api.traceImage for multipart image upload"
```

---

## Task 8: Improve SVG Parser

**Files:**
- Modify: `studio/frontend/src/renderer/svg/parser.ts`

Handle `<use>` references and add an optional warning callback for unsupported `<text>` elements.

- [ ] **Step 1: Write the failing tests**

Add to `studio/frontend/tests/svg_parser.test.ts`:

```typescript
describe('parseSvgToMmPaths — <use> support', () => {
  it('resolves <use href="#id"> and returns paths from the referenced element', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" viewBox="0 0 100 100">
      <defs>
        <rect id="box" x="10" y="10" width="20" height="20"/>
      </defs>
      <use href="#box"/>
    </svg>`
    const paths = parseSvgToMmPaths(svg)
    expect(paths.length).toBeGreaterThan(0)
  })

  it('resolves <use xlink:href="#id"> (legacy)', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100mm" viewBox="0 0 100 100">
      <defs>
        <circle id="dot" cx="50" cy="50" r="10"/>
      </defs>
      <use xlink:href="#dot"/>
    </svg>`
    const paths = parseSvgToMmPaths(svg)
    expect(paths.length).toBeGreaterThan(0)
  })

  it('calls onWarning when <text> is present', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" viewBox="0 0 100 100">
      <text x="10" y="20">Hello</text>
    </svg>`
    const warnings: string[] = []
    parseSvgToMmPaths(svg, 0.05, (msg) => warnings.push(msg))
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings[0]).toContain('text')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/svg_parser.test.ts
```

Expected: the two `<use>` tests return empty paths (fail), the `onWarning` test fails with wrong signature.

- [ ] **Step 3: Update `parseSvgToMmPaths` signature and add `<use>` + `<text>` handling**

In `studio/frontend/src/renderer/svg/parser.ts`, change the function signature:

```typescript
export function parseSvgToMmPaths(
  svgString: string,
  smoothness = 0.05,
  onWarning?: (msg: string) => void,
): PathList {
```

After the existing `shapes.forEach(...)` block (around line 29), add:

```typescript
  // Warn on <text> elements
  const textEls = doc.querySelectorAll('text')
  if (textEls.length > 0 && onWarning) {
    onWarning(`Text-Elemente werden nicht unterstützt — bitte in Inkscape zu Pfaden konvertieren (Pfad → Objekt in Pfad umwandeln).`)
  }

  // Resolve <use> elements
  const useEls = doc.querySelectorAll('use')
  useEls.forEach((useEl) => {
    const href = (
      useEl.getAttribute('href') ||
      useEl.getAttribute('xlink:href') ||
      ''
    ).trim()
    if (!href.startsWith('#')) return
    const refEl = doc.getElementById(href.slice(1))
    if (!refEl) return

    const cloned = refEl.cloneNode(true) as SVGElement
    const ux = parseFloat(useEl.getAttribute('x') || '0')
    const uy = parseFloat(useEl.getAttribute('y') || '0')

    const pathData = elementToPathData(cloned)
    if (!pathData) return
    // offsetX - ux so that (x + ux - offsetX) * mmPerUnit gives correct mm position
    const points = samplePathData(pathData, mmPerUnit, offsetX - ux, offsetY - uy, smoothness)
    if (points.length >= 2) result.push(points)
  })
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/svg_parser.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Run full frontend test suite to check for regressions**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add studio/frontend/src/renderer/svg/parser.ts studio/frontend/tests/svg_parser.test.ts
git commit -m "feat(frontend): SVG parser handles <use> references and warns on <text>"
```

---

## Task 9: Implement useImport Hook

**Files:**
- Create: `studio/frontend/src/renderer/hooks/useImport.ts`

- [ ] **Step 1: Write the failing test**

Create `studio/frontend/tests/useImport.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useImport } from '../src/renderer/hooks/useImport'
import { api } from '../src/renderer/api/client'

vi.mock('../src/renderer/api/client')

const MOCK_RESULT = {
  paths: [[[0, 0], [10, 10]]],
  layers: [],
}

describe('useImport', () => {
  beforeEach(() => vi.clearAllMocks())

  it('starts with no result and not loading', () => {
    const { result } = renderHook(() => useImport())
    expect(result.current.traceResult).toBeNull()
    expect(result.current.traceLoading).toBe(false)
  })

  it('accept() with no result returns null', () => {
    const { result } = renderHook(() => useImport())
    expect(result.current.accept()).toBeNull()
  })

  it('accept() returns all paths in silhouette mode', () => {
    const { result } = renderHook(() => useImport())
    act(() => {
      // Simulate having a trace result
      result.current._setResultForTest(MOCK_RESULT)
    })
    const paths = result.current.accept()
    expect(paths).toEqual(MOCK_RESULT.paths)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/useImport.test.ts
```

Expected: `Cannot find module` — hook not created yet.

- [ ] **Step 3: Create `studio/frontend/src/renderer/hooks/useImport.ts`**

```typescript
import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import type { TraceParams, TraceResult, PathList } from '../types'
import { DEFAULT_TRACE_PARAMS } from '../types'

export function useImport() {
  const [file, setFile] = useState<File | null>(null)
  const [params, setParams] = useState<TraceParams>(DEFAULT_TRACE_PARAMS)
  const [traceResult, setTraceResult] = useState<TraceResult | null>(null)
  const [traceLoading, setTraceLoading] = useState(false)
  const [traceError, setTraceError] = useState<string | null>(null)

  const paramsKey = JSON.stringify(params)

  useEffect(() => {
    if (!file) return
    const timer = setTimeout(async () => {
      setTraceLoading(true)
      setTraceError(null)
      try {
        const result = await api.traceImage(file, params)
        setTraceResult(result)
      } catch (e: any) {
        setTraceError(e?.response?.data?.detail ?? 'Tracing fehlgeschlagen')
      } finally {
        setTraceLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [file, paramsKey]) // paramsKey is a stable string

  const accept = useCallback(
    (enabledColors?: Set<string>): PathList | null => {
      if (!traceResult) return null
      if (params.mode === 'silhouette' || !enabledColors) {
        return traceResult.paths
      }
      return traceResult.layers
        .filter(l => enabledColors.has(l.color))
        .flatMap(l => l.paths)
    },
    [traceResult, params.mode],
  )

  const reset = useCallback(() => {
    setFile(null)
    setTraceResult(null)
    setTraceError(null)
  }, [])

  return {
    file,
    setFile,
    params,
    setParams,
    traceResult,
    traceLoading,
    traceError,
    accept,
    reset,
    // test-only escape hatch
    _setResultForTest: setTraceResult,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/useImport.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add studio/frontend/src/renderer/hooks/useImport.ts studio/frontend/tests/useImport.test.ts
git commit -m "feat(frontend): add useImport hook with debounced tracing and accept()"
```

---

## Task 10: Implement ImportPanel Component

**Files:**
- Create: `studio/frontend/src/renderer/components/ImportPanel.tsx`

- [ ] **Step 1: Create `studio/frontend/src/renderer/components/ImportPanel.tsx`**

```tsx
import { useState, useMemo } from 'react'
import type { TraceParams, TraceResult, PathList, ColorLayer } from '../types'

interface Props {
  file: File
  params: TraceParams
  onParamsChange: (p: TraceParams) => void
  result: TraceResult | null
  loading: boolean
  error: string | null
  onAccept: (enabledColors?: Set<string>) => void
  onCancel: () => void
}

export function ImportPanel({
  file, params, onParamsChange, result, loading, error, onAccept, onCancel,
}: Props) {
  const imageUrl = useMemo(() => URL.createObjectURL(file), [file])
  const [enabledColors, setEnabledColors] = useState<Set<string>>(new Set())

  // Sync enabled colours when layers change
  useMemo(() => {
    if (result?.layers) {
      setEnabledColors(new Set(result.layers.map(l => l.color)))
    }
  }, [result?.layers?.length])

  const toggleColor = (color: string) => {
    setEnabledColors(prev => {
      const next = new Set(prev)
      next.has(color) ? next.delete(color) : next.add(color)
      return next
    })
  }

  const bbox = useMemo(() => {
    if (!result || result.paths.length === 0) return { maxX: 1, maxY: 1 }
    let maxX = 0, maxY = 0
    for (const path of result.paths) {
      for (const [x, y] of path) {
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
    return { maxX, maxY }
  }, [result])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-[800px] max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h2 className="text-white font-semibold">Bild importieren — {file.name}</h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">

          {/* Left: Settings */}
          <div className="w-56 flex-shrink-0 flex flex-col gap-4 p-4 border-r border-gray-700 overflow-y-auto text-sm text-white">

            <div>
              <p className="text-gray-400 uppercase text-xs mb-2">Modus</p>
              {(['silhouette', 'color'] as const).map(m => (
                <label key={m} className="flex items-center gap-2 mb-1 cursor-pointer">
                  <input
                    type="radio"
                    name="mode"
                    checked={params.mode === m}
                    onChange={() => onParamsChange({ ...params, mode: m })}
                    className="accent-blue-500"
                  />
                  {m === 'silhouette' ? 'Silhouette' : 'Farbtrennung'}
                </label>
              ))}
            </div>

            {params.mode === 'silhouette' && (
              <label className="flex flex-col gap-1">
                <span>Schwellenwert: {params.threshold}</span>
                <input
                  type="range" min={0} max={255} step={1}
                  value={params.threshold}
                  onChange={e => onParamsChange({ ...params, threshold: Number(e.target.value) })}
                  className="accent-blue-500"
                />
              </label>
            )}

            {params.mode === 'color' && (
              <label className="flex flex-col gap-1">
                <span>Anzahl Farben: {params.num_colors}</span>
                <input
                  type="range" min={2} max={8} step={1}
                  value={params.num_colors}
                  onChange={e => onParamsChange({ ...params, num_colors: Number(e.target.value) })}
                  className="accent-blue-500"
                />
              </label>
            )}

            <label className="flex flex-col gap-1">
              <span>Glättung: {params.smoothness.toFixed(1)}</span>
              <input
                type="range" min={0} max={5} step={0.5}
                value={params.smoothness}
                onChange={e => onParamsChange({ ...params, smoothness: Number(e.target.value) })}
                className="accent-blue-500"
              />
            </label>

            {/* Color layer list (color mode only) */}
            {params.mode === 'color' && result && result.layers.length > 0 && (
              <div>
                <p className="text-gray-400 uppercase text-xs mb-2">Farblagen</p>
                {result.layers.map(layer => (
                  <label key={layer.color} className="flex items-center gap-2 mb-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enabledColors.has(layer.color)}
                      onChange={() => toggleColor(layer.color)}
                      className="accent-blue-500"
                    />
                    <span
                      className="w-4 h-4 rounded-sm border border-gray-600 flex-shrink-0"
                      style={{ backgroundColor: layer.color }}
                    />
                    <span className="text-xs text-gray-300 truncate">
                      {layer.color} ({layer.paths.length})
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Right: Preview */}
          <div className="flex-1 flex items-center justify-center p-4 overflow-hidden bg-gray-950">
            <div className="relative max-w-full max-h-full" style={{ aspectRatio: `${bbox.maxX} / ${bbox.maxY}` }}>
              <img
                src={imageUrl}
                alt="Original"
                className="w-full h-full object-contain opacity-40"
              />
              {result && result.paths.length > 0 && (
                <svg
                  viewBox={`0 0 ${bbox.maxX} ${bbox.maxY}`}
                  className="absolute inset-0 w-full h-full"
                  style={{ pointerEvents: 'none' }}
                >
                  {params.mode === 'silhouette'
                    ? result.paths.map((path, i) => (
                        <polyline
                          key={i}
                          points={path.map(([x, y]) => `${x},${y}`).join(' ')}
                          fill="none"
                          stroke="#22d3ee"
                          strokeWidth={bbox.maxX * 0.003}
                        />
                      ))
                    : result.layers
                        .filter(l => enabledColors.has(l.color))
                        .map(layer =>
                          layer.paths.map((path, i) => (
                            <polyline
                              key={`${layer.color}-${i}`}
                              points={path.map(([x, y]) => `${x},${y}`).join(' ')}
                              fill="none"
                              stroke={layer.color}
                              strokeWidth={bbox.maxX * 0.003}
                            />
                          ))
                        )
                  }
                </svg>
              )}
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <span className="text-white text-sm">Tracen…</span>
                </div>
              )}
              {!loading && result && result.paths.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-yellow-400 text-sm">Keine Pfade gefunden — Schwellenwert anpassen</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-700">
          {error && <span className="text-red-400 text-xs">{error}</span>}
          {!error && <span />}
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-white text-sm"
            >
              Abbrechen
            </button>
            <button
              onClick={() => onAccept(params.mode === 'color' ? enabledColors : undefined)}
              disabled={!result || result.paths.length === 0 || loading}
              className="px-4 py-1.5 rounded bg-green-600 hover:bg-green-500 text-white text-sm disabled:opacity-40"
            >
              Übernehmen →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run type check**

```bash
cd studio/frontend
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add studio/frontend/src/renderer/components/ImportPanel.tsx
git commit -m "feat(frontend): add ImportPanel modal with image preview and trace controls"
```

---

## Task 11: Wire Up App.tsx

**Files:**
- Modify: `studio/frontend/src/renderer/App.tsx`

- [ ] **Step 1: Update `studio/frontend/src/renderer/App.tsx`**

Replace the full content of `App.tsx` with:

```tsx
import { useState, useCallback, useEffect } from 'react'
import { DEFAULT_SETTINGS } from './types'
import type { CutSettings, PathList, MediaPreset } from './types'
import { api } from './api/client'
import { parseSvgToMmPaths } from './svg/parser'
import { useDevice } from './hooks/useDevice'
import { useJob } from './hooks/useJob'
import { useImport } from './hooks/useImport'
import { Toolbar } from './components/Toolbar'
import { Canvas } from './components/Canvas'
import { SettingsPanel } from './components/SettingsPanel'
import { DeviceStatus } from './components/DeviceStatus'
import { ImportPanel } from './components/ImportPanel'

export default function App() {
  const [settings, setSettings] = useState<CutSettings>(DEFAULT_SETTINGS)
  const [mediaPresets, setMediaPresets] = useState<MediaPreset[]>([])
  const [svgContent, setSvgContent] = useState<string | null>(null)
  const [parsedPaths, setParsedPaths] = useState<PathList | null>(null)
  const [svgWarning, setSvgWarning] = useState<string | null>(null)
  const [showImportPanel, setShowImportPanel] = useState(false)

  const { status: deviceStatus, loading: deviceLoading, error: deviceError, connect, disconnect } = useDevice()
  const { state: jobState, previewPaths, error: jobError, preview, send, cancel, reset } = useJob()
  const importHook = useImport()

  useEffect(() => {
    api.listMedia().then(setMediaPresets).catch(() => {})
  }, [])

  const handleOpenFile = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.svg,.png,.jpg,.jpeg'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      const ext = file.name.split('.').pop()?.toLowerCase()

      if (ext === 'svg') {
        const text = await file.text()
        setSvgContent(text)
        setSvgWarning(null)
        const paths = parseSvgToMmPaths(text, 0.05, (msg) => setSvgWarning(msg))
        setParsedPaths(paths)
        reset()
      } else if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') {
        importHook.setFile(file)
        importHook.setParams({ ...importHook.params, media_width_mm: settings.media_width_mm })
        setShowImportPanel(true)
      }
    }
    input.click()
  }, [reset, importHook, settings.media_width_mm])

  const handleImportAccept = useCallback((enabledColors?: Set<string>) => {
    const paths = importHook.accept(enabledColors)
    if (paths) {
      setParsedPaths(paths)
      setSvgContent(null)
      reset()
    }
    setShowImportPanel(false)
    importHook.reset()
  }, [importHook, reset])

  const handleImportCancel = useCallback(() => {
    setShowImportPanel(false)
    importHook.reset()
  }, [importHook])

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

      {svgWarning && (
        <div className="px-4 py-1 bg-yellow-900/60 text-yellow-300 text-xs border-b border-yellow-700">
          {svgWarning}
        </div>
      )}

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

      {showImportPanel && importHook.file && (
        <ImportPanel
          file={importHook.file}
          params={importHook.params}
          onParamsChange={importHook.setParams}
          result={importHook.traceResult}
          loading={importHook.traceLoading}
          error={importHook.traceError}
          onAccept={handleImportAccept}
          onCancel={handleImportCancel}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run type check**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add studio/frontend/src/renderer/App.tsx
git commit -m "feat(frontend): wire up file type detection and ImportPanel in App"
```

---

## Task 12: Update Toolbar

**Files:**
- Modify: `studio/frontend/src/renderer/components/Toolbar.tsx`

- [ ] **Step 1: Update button label in `studio/frontend/src/renderer/components/Toolbar.tsx`**

Change the "Open SVG…" button label to "Datei öffnen…":

```tsx
      <button
        onClick={onOpenFile}
        className="px-3 py-1 rounded bg-gray-600 hover:bg-gray-500 text-white text-sm"
      >
        Datei öffnen…
      </button>
```

- [ ] **Step 2: Run full test suite**

```bash
cd studio/frontend && npm test
cd ../backend && pytest tests/ -v
```

Expected: all tests PASS on both sides.

- [ ] **Step 3: Commit**

```bash
git add studio/frontend/src/renderer/components/Toolbar.tsx
git commit -m "feat(frontend): rename 'Open SVG' to 'Datei öffnen' for multi-format support"
```

---

## Verification: End-to-End Test

After all tasks are complete:

- [ ] Start the backend: `cd studio/backend && python main.py`
- [ ] Start the frontend: `cd studio/frontend && npm run dev`
- [ ] Open the app — toolbar shows "Datei öffnen…"
- [ ] Load a PNG → ImportPanel opens, tracing starts automatically after 300ms
- [ ] Adjust threshold slider → preview updates within ~300ms
- [ ] Switch to "Farbtrennung" → color layers appear with checkboxes
- [ ] Toggle layers off/on → path overlay updates
- [ ] Click "Übernehmen" → paths appear on Canvas, "Preview Cut" becomes active
- [ ] Load an SVG with `<use>` elements → paths appear on Canvas (no empty result)
- [ ] Load an SVG with `<text>` → yellow warning bar appears at top
- [ ] Click "Connect" in sidebar → status turns green
- [ ] "Cut Now" becomes active → click to start a dry-run cut
