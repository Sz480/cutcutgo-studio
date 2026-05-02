from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from studio.backend.main import app

client = TestClient(app)


def test_device_status_no_device():
    """When device service is not connected, status returns not_found."""
    with patch("studio.backend.routers.device.get_device_service") as mock_get:
        svc = MagicMock()
        svc.is_connected.return_value = False
        mock_get.return_value = svc
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
