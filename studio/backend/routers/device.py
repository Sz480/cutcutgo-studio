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
