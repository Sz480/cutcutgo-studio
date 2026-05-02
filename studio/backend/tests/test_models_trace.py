from studio.backend.models import TraceMode, TraceParams, ColorLayer, TraceResult

def test_trace_params_defaults():
    p = TraceParams()
    assert p.mode == TraceMode.silhouette
    assert p.threshold == 128
    assert p.num_colors == 4
    assert p.smoothness == 1.0
    assert p.media_width_mm == 304.8

def test_trace_result_empty_layers():
    r = TraceResult(paths=[[[0.0, 0.0], [10.0, 0.0]]])
    assert r.layers == []

def test_color_layer():
    layer = ColorLayer(color="#ff0000", paths=[[[0.0, 0.0], [5.0, 5.0]]])
    assert layer.color == "#ff0000"
    assert len(layer.paths) == 1
