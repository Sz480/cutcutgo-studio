from fastapi.testclient import TestClient
from studio.backend.main import app


def test_health_returns_ok():
    client = TestClient(app)
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": "1.0.0"}


def test_cors_header_present():
    client = TestClient(app)
    response = client.options(
        "/api/health",
        headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET"},
    )
    assert response.status_code in (200, 204)
    assert "access-control-allow-origin" in response.headers
