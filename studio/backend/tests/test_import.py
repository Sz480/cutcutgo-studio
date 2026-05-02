import io
import json
from PIL import Image, ImageDraw
from fastapi.testclient import TestClient
from studio.backend.main import app

client = TestClient(app)


def _png_bytes(rect=None):
    img = Image.new('RGB', (100, 100), (255, 255, 255))
    if rect:
        ImageDraw.Draw(img).rectangle(rect, fill=(0, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return buf.getvalue()


def test_trace_silhouette_returns_200():
    params = {"mode": "silhouette", "threshold": 128, "num_colors": 4,
              "smoothness": 1.0, "media_width_mm": 100.0}
    response = client.post(
        "/api/import/trace",
        data={"params": json.dumps(params)},
        files={"file": ("test.png", _png_bytes(rect=[20, 20, 80, 80]), "image/png")},
    )
    assert response.status_code == 200
    data = response.json()
    assert "paths" in data
    assert "layers" in data
    assert isinstance(data["paths"], list)


def test_trace_color_returns_layers():
    params = {"mode": "color", "threshold": 128, "num_colors": 2,
              "smoothness": 1.0, "media_width_mm": 100.0}
    response = client.post(
        "/api/import/trace",
        data={"params": json.dumps(params)},
        files={"file": ("test.png", _png_bytes(rect=[20, 20, 80, 80]), "image/png")},
    )
    assert response.status_code == 200
    data = response.json()
    assert "layers" in data


def test_trace_invalid_file_type_returns_422():
    params = {"mode": "silhouette", "threshold": 128, "num_colors": 4,
              "smoothness": 1.0, "media_width_mm": 100.0}
    response = client.post(
        "/api/import/trace",
        data={"params": json.dumps(params)},
        files={"file": ("test.txt", b"not an image", "text/plain")},
    )
    assert response.status_code == 422


def test_trace_oversized_file_returns_413():
    big_data = b"x" * (21 * 1024 * 1024)  # 21 MB
    params = {"mode": "silhouette", "threshold": 128, "num_colors": 4,
              "smoothness": 1.0, "media_width_mm": 100.0}
    response = client.post(
        "/api/import/trace",
        data={"params": json.dumps(params)},
        files={"file": ("big.png", big_data, "image/png")},
    )
    assert response.status_code == 413
