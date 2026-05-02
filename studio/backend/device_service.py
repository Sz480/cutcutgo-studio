class DeviceService:
    def disconnect(self): pass

_instance = None

def get_device_service():
    global _instance
    if _instance is None:
        _instance = DeviceService()
    return _instance
