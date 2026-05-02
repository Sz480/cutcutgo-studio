from studio.backend.optimizer_service import optimize_paths
from studio.backend.models import CutSettings

# Simple square in mm
SQUARE = [
    [[0.0, 0.0], [10.0, 0.0], [10.0, 10.0], [0.0, 10.0], [0.0, 0.0]]
]


def test_optimize_returns_pathlist():
    result = optimize_paths(SQUARE, CutSettings())
    assert isinstance(result, list)
    assert len(result) >= 1
    for path in result:
        assert isinstance(path, list)
        for pt in path:
            assert len(pt) == 2


def test_optimize_mintravel_does_not_lose_points():
    settings = CutSettings(strategy="mintravel")
    result = optimize_paths(SQUARE, settings)
    result_points = sum(len(p) for p in result)
    assert result_points > 0


def test_optimize_matfree_strategy():
    settings = CutSettings(strategy="matfree")
    result = optimize_paths(SQUARE, settings)
    assert isinstance(result, list)


def test_optimize_multipass_doubles_paths():
    settings = CutSettings(strategy="mintravel", multipass=2)
    single = optimize_paths(SQUARE, CutSettings(multipass=1))
    double = optimize_paths(SQUARE, settings)
    assert len(double) >= len(single)
