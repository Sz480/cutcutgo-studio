from fastapi.testclient import TestClient
from studio.backend.main import app

client = TestClient(app)


def test_media_list_returns_array():
    response = client.get("/api/media/")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1


def test_media_item_has_required_fields():
    response = client.get("/api/media/")
    first = response.json()[0]
    assert "id" in first
    assert "name" in first
    assert "default_pressure" in first
    assert "default_clearance" in first


def test_media_get_by_id():
    response = client.get("/api/media/1")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == 1


def test_media_get_invalid_id():
    response = client.get("/api/media/999")
    assert response.status_code == 404
