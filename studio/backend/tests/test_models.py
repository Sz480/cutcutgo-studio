from studio.backend.models import CutSettings, CutJob, DeviceStatus, MediaPreset, JobResponse


def test_cut_settings_defaults():
    s = CutSettings()
    assert s.media == 1
    assert s.tool == "blade"
    assert s.speed == 3
    assert s.pressure == 0.0
    assert s.multipass == 1
    assert s.overcut == 0.5
    assert s.strategy == "mintravel"
    assert s.media_width_mm == 304.8
    assert s.media_height_mm == 609.6


def test_cut_job_requires_paths():
    job = CutJob(paths=[[[0.0, 0.0], [10.0, 0.0], [10.0, 10.0]]])
    assert len(job.paths) == 1
    assert job.settings.media == 1


def test_device_status_model():
    s = DeviceStatus(connected=False, status="not_found")
    assert s.version is None


def test_media_preset_model():
    m = MediaPreset(id=1, name="Laser Copy Paper", default_pressure=8.5, default_clearance=2.0)
    assert m.id == 1
