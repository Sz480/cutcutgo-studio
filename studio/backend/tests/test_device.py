import threading
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from studio.backend.main import app
from studio.backend.device_service import DeviceService

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


# ── DeviceService unit tests ──────────────────────────────────────────────────

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
    svc = _make_svc()           # tool_up=True (already up)
    svc._device.tool_up = True
    svc.set_tool("pen")
    assert svc._tool_state == "pen"
    assert svc._device.tool_up is False
    calls = svc._device.send_receive_command.call_args_list
    assert calls[0][0][0] == [b"T1"]
    assert calls[1][0][0] == [b"G01Z-8.500000F10"]


def test_set_tool_pen_from_down_pre_raises_first():
    """Pen when tool is down: raise first, then T1, then lower pen."""
    svc = _make_svc(tool_state="blade")
    svc._device.tool_up = False
    svc.set_tool("pen")
    calls = svc._device.send_receive_command.call_args_list
    assert len(calls) == 3
    assert calls[0][0][0] == [b"G01Z-7.500000F10"]  # pre-raise
    assert calls[1][0][0] == [b"T1"]                 # select pen carriage
    assert calls[2][0][0] == [b"G01Z-8.500000F10"]  # lower pen
    assert svc._device.tool_up is False
    assert svc._tool_state == "pen"


def test_set_tool_blade_from_up_sends_T2_only():
    """Blade when tool is up: T2 alone (firmware auto-lowers; extra G01Z crashes GRBL)."""
    svc = _make_svc(tool_state="up")
    svc._device.tool_up = True
    svc.set_tool("blade")
    calls = svc._device.send_receive_command.call_args_list
    assert len(calls) == 1
    assert calls[0][0][0] == [b"T2"]
    assert svc._tool_state == "blade"
    assert svc._device.tool_up is False


def test_set_tool_blade_from_down_pre_raises_first():
    """Blade when tool is down: raise first, then T2 only — no G01Z after T2."""
    svc = _make_svc(tool_state="pen")
    svc._device.tool_up = False
    svc.set_tool("blade")
    calls = svc._device.send_receive_command.call_args_list
    assert len(calls) == 2
    assert calls[0][0][0] == [b"G01Z-7.500000F10"]  # pre-raise
    assert calls[1][0][0] == [b"T2"]                 # select blade — NO G01Z after this
    assert svc._device.tool_up is False
    assert svc._tool_state == "blade"


def test_set_tool_up_sends_clearance_move():
    """Tool Up raises the active carriage to travel height."""
    svc = _make_svc(tool_state="pen")
    svc._device.tool_up = False
    svc.set_tool("up")
    calls = svc._device.send_receive_command.call_args_list
    assert len(calls) == 1
    assert calls[0][0][0] == [b"G01Z-7.500000F10"]
    assert svc._tool_state == "up"
    assert svc._device.tool_up is True


def test_reset_position():
    svc = _make_svc(pos_x=15.0, pos_y=25.0)
    svc.reset_position()
    assert svc._pos_x == 0.0
    assert svc._pos_y == 0.0


# ── Endpoint tests ────────────────────────────────────────────────────────────

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


def test_reset_position_endpoint():
    with patch("studio.backend.routers.device.get_device_service") as mock_get:
        svc = MagicMock()
        svc.get_position.return_value = {"x_mm": 0.0, "y_mm": 0.0, "tool_state": "up"}
        mock_get.return_value = svc
        response = client.post("/api/device/reset-position")
    assert response.status_code == 200
    svc.reset_position.assert_called_once()
