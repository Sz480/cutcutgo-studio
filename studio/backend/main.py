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
    yield
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
