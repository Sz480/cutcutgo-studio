from __future__ import annotations
import sys
import time
import threading
from pathlib import Path

_REPO_ROOT = Path(__file__).parent.parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from cutcutgo.Cutcutgo import CricutMaker  # type: ignore[import]


class DeviceService:
    """Thread-safe singleton wrapper around CricutMaker.

    Notes on CricutMaker API:
    - __init__ raises ValueError if no device is found (not RuntimeError)
    - status() returns 'ready' | 'moving' | 'unloaded'
    - get_version() returns the firmware version string
    - There is no close() method; the serial port is self._device.dev (a Serial object)
    - The port name is captured from the Serial object after connection
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._device: CricutMaker | None = None
        self.port: str | None = None
        self._pos_x: float = 0.0
        self._pos_y: float = 0.0
        self._tool_state: str = "up"

    def connect(self) -> None:
        """Attempt to find and connect to the device. Raises RuntimeError if not found."""
        with self._lock:
            if self._device is not None:
                return
            try:
                self._device = CricutMaker()
                # CricutMaker stores the Serial object as self.dev; extract port name from it
                dev = getattr(self._device, "dev", None)
                self.port = getattr(dev, "port", None) if dev is not None else None
            except (ValueError, Exception) as exc:
                self._device = None
                self.port = None
                raise RuntimeError(f"No CutCutGo device found: {exc}") from exc

    def disconnect(self) -> None:
        with self._lock:
            if self._device is not None:
                try:
                    dev = getattr(self._device, "dev", None)
                    if dev is not None:
                        dev.close()
                except Exception:
                    pass
                self._device = None
                self.port = None
            self._pos_x = 0.0
            self._pos_y = 0.0
            self._tool_state = "up"

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

    def jog(self, dx_mm: float, dy_mm: float) -> None:
        """Move by relative offset; clamps to non-negative positions. Always raises tool."""
        with self._lock:
            if self._device is None:
                raise RuntimeError("Device not connected")
            new_x = max(0.0, self._pos_x + dx_mm)
            new_y = max(0.0, self._pos_y + dy_mm)
            cmds = self._device.move_mm_cmd(new_y, new_x)   # note: (mmy, mmx) order
            self._device.send_receive_command(cmds)
            self._pos_x = new_x
            self._pos_y = new_y
            self._tool_state = "up"

    def home(self) -> None:
        """Raise tool, run homing cycle ($H), wait for completion, reset position."""
        with self._lock:
            if self._device is None:
                raise RuntimeError("Device not connected")
            d = self._device
            d.send_receive_command([b"G01Z-%fF10" % (d.pressure - d.clearance)])
            d.tool_up = True
            d.send_receive_command([b"$H"])
            self._wait_for_grbl_idle(d, timeout=30.0)
            self._pos_x = 0.0
            self._pos_y = 0.0
            self._tool_state = "up"

    def _wait_for_grbl_idle(self, d: "CricutMaker", timeout: float = 30.0) -> None:
        """Poll GRBL with '?' until it reports Idle or timeout expires."""
        deadline = time.time() + timeout
        while time.time() < deadline:
            time.sleep(0.3)
            try:
                d.dev.write(b"?")
                prev_timeout = d.dev.timeout
                d.dev.timeout = 1
                resp = d.dev.readline()
                d.dev.timeout = prev_timeout
                if b"Idle" in resp:
                    return
            except Exception:
                break

    def set_tool(self, action: str) -> None:
        """Lower or raise the active tool carriage.

        T1 = pen carriage. T2 = blade carriage.
        IMPORTANT: T2 auto-lowers the blade internally; sending an additional
        G01Z after T2 exceeds the soft limit and crashes GRBL. Do NOT add G01Z
        after T2. T1 only switches the carriage; an explicit G01Z is needed.
        Always raise the current tool before switching carriages.
        """
        with self._lock:
            if self._device is None:
                raise RuntimeError("Device not connected")
            d = self._device
            if action == "up":
                d.send_receive_command([b"G01Z-%fF10" % (d.pressure - d.clearance)])
                d.tool_up = True
            elif action == "pen":
                if not d.tool_up:
                    # Safety: raise active tool before switching carriage
                    d.send_receive_command([b"G01Z-%fF10" % (d.pressure - d.clearance)])
                    d.tool_up = True
                d.send_receive_command([b"T1"])
                d.send_receive_command([b"G01Z-%fF10" % d.pressure])
                d.tool_up = False
            elif action == "blade":
                if not d.tool_up:
                    # Safety: raise active tool before switching carriage
                    d.send_receive_command([b"G01Z-%fF10" % (d.pressure - d.clearance)])
                    d.tool_up = True
                # T2 auto-lowers blade to cutting depth — no additional G01Z
                d.send_receive_command([b"T2"])
                d.tool_up = False
            else:
                raise ValueError(f"Unknown action: {action!r}")
            self._tool_state = action

    def reset_position(self) -> None:
        """Reset tracked (x, y) to (0, 0) without moving the device."""
        with self._lock:
            self._pos_x = 0.0
            self._pos_y = 0.0

    def get_position(self) -> dict:
        return {"x_mm": self._pos_x, "y_mm": self._pos_y, "tool_state": self._tool_state}

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
