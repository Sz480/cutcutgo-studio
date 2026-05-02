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
    """Send job with dry_run=True — when device not connected, should still work via optimizer only."""
    with patch("studio.backend.routers.job.get_device_service") as mock_get:
        mock_svc = MagicMock()
        mock_svc.is_connected.return_value = False
        mock_get.return_value = mock_svc
        response = client.post("/api/job/send?dry_run=true", json=SIMPLE_JOB)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True


def test_job_send_no_device():
    """Send job when device is not connected (not dry_run) → 409 Conflict."""
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
