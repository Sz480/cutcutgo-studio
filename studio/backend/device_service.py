from __future__ import annotations
import sys
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
                    # CricutMaker has no close(); close the underlying Serial device
                    dev = getattr(self._device, "dev", None)
                    if dev is not None:
                        dev.close()
                except Exception:
                    pass
                self._device = None
                self.port = None

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
