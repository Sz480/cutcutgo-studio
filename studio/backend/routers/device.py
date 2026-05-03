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
