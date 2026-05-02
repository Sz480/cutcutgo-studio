from __future__ import annotations
import json

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

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
