import io
import pytest
from PIL import Image, ImageDraw
from studio.backend.models import TraceParams, TraceMode, TraceResult
from studio.backend.services.tracer import trace


def _make_png(width=100, height=100, bg=(255, 255, 255), rect=None):
    """Create an in-memory PNG. If rect given, draw a filled black rectangle."""
    img = Image.new('RGB', (width, height), bg)
    if rect:
        draw = ImageDraw.Draw(img)
        draw.rectangle(rect, fill=(0, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return buf.getvalue()


def test_trace_white_image_silhouette_returns_result():
    """All-white image in silhouette mode: vtracer may return empty or minimal paths."""
    png = _make_png()
    result = trace(png, TraceParams(mode=TraceMode.silhouette))
    assert isinstance(result, TraceResult)
    assert isinstance(result.paths, list)
    assert result.layers == []  # silhouette mode → no layers


def test_trace_rect_silhouette_returns_paths():
    """Black rectangle on white: silhouette mode should return at least one path."""
    png = _make_png(rect=[20, 20, 80, 80])
    result = trace(png, TraceParams(mode=TraceMode.silhouette, smoothness=1.0))
    assert isinstance(result, TraceResult)
    assert len(result.paths) >= 1
    for path in result.paths:
        assert len(path) >= 2
        for pt in path:
            assert len(pt) == 2  # [x_mm, y_mm]


def test_trace_rect_color_returns_layers():
    """Color mode should populate layers list."""
    png = _make_png(rect=[20, 20, 80, 80])
    result = trace(png, TraceParams(mode=TraceMode.color, num_colors=2))
    assert isinstance(result, TraceResult)
    assert len(result.layers) >= 1
    for layer in result.layers:
        assert layer.color.startswith('#')
        assert len(layer.paths) >= 1


def test_trace_paths_within_media_bounds():
    """All path coordinates must fit within media_width_mm (proportional scaling)."""
    png = _make_png(width=200, height=100, rect=[10, 10, 190, 90])
    params = TraceParams(mode=TraceMode.silhouette, media_width_mm=100.0)
    result = trace(png, params)
    for path in result.paths:
        for x, y in path:
            assert x <= params.media_width_mm + 1.0  # 1mm tolerance
