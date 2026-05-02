from __future__ import annotations
import threading
from fastapi import APIRouter, HTTPException, Query

from studio.backend.models import CutJob, JobResponse
from studio.backend.device_service import get_device_service
from studio.backend.optimizer_service import optimize_paths

router = APIRouter()

_cancel_event = threading.Event()


def _run_cut_job(job: CutJob, dry_run: bool) -> dict:
    _cancel_event.clear()
    optimized = optimize_paths(job.paths, job.settings)
    path_tuples = [[(pt[0], pt[1]) for pt in path] for path in optimized]

    # Check cancellation before touching the device
    if _cancel_event.is_set():
        raise RuntimeError("Job cancelled before device communication started")

    s = job.settings
    svc = get_device_service()
    device = svc.get_raw()

    # setup() confirmed parameters from CricutMaker.setup() signature:
    # media, speed, pressure, toolholder, pen, autoblade, depth,
    # bladediameter, sw_clipping, sharpencorners
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

    # plot() confirmed parameters from CricutMaker.plot() signature:
    # pathlist, mediawidth, mediaheight, offset, bboxonly, endposition
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
    try:
        optimized = optimize_paths(job.paths, job.settings)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return JobResponse(success=True, message="Preview ready", optimized_paths=optimized)


@router.post("/send", response_model=JobResponse)
def job_send(
    job: CutJob,
    dry_run: bool = Query(default=False),
) -> JobResponse:
    svc = get_device_service()
    if not svc.is_connected() and not dry_run:
        raise HTTPException(
            status_code=409,
            detail="Device not connected. POST /api/device/connect first.",
        )

    if dry_run and not svc.is_connected():
        optimized = optimize_paths(job.paths, job.settings)
        return JobResponse(
            success=True,
            message="Dry-run complete (device not connected — only path optimization applied)",
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
