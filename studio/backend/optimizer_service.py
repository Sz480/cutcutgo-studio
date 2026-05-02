from __future__ import annotations
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).parent.parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

# StrategyMinTraveling exposes a module-level sort() function (no class).
import cutcutgo.StrategyMinTraveling as _smt  # type: ignore[import]

# Strategy.py contains class MatFree with an apply() method.
from cutcutgo.Strategy import MatFree  # type: ignore[import]

from studio.backend.models import CutSettings, PathList


def _to_tuples(paths: PathList) -> list[list[tuple[float, float]]]:
    """Convert [[x, y], ...] lists to [(x, y), ...] tuples for Strategy modules."""
    return [[(float(pt[0]), float(pt[1])) for pt in path] for path in paths]


def _to_lists(paths: list[list[tuple[float, float]]]) -> PathList:
    """Convert [(x, y), ...] tuples back to [[x, y], ...] lists."""
    return [[[pt[0], pt[1]] for pt in path] for path in paths]


def _xy_paths_to_tuples(paths) -> list[list[tuple[float, float]]]:
    """Convert XY_a object paths (returned by MatFree.apply()) to plain tuples.

    MatFree.apply() returns lists of XY_a objects which have .x and .y attributes.
    """
    result = []
    for path in paths:
        new_path = []
        for pt in path:
            # XY_a objects support [0] and [1] indexing as well as .x/.y
            new_path.append((float(pt[0]), float(pt[1])))
        result.append(new_path)
    return result


def _fuse_paths(paths: list[list[tuple[float, float]]]) -> list[list[tuple[float, float]]]:
    """Merge consecutive paths that share an endpoint."""
    if not paths:
        return paths
    fused = [list(paths[0])]
    for path in paths[1:]:
        if path and fused[-1] and fused[-1][-1] == path[0]:
            fused[-1].extend(path[1:])
        else:
            fused.append(list(path))
    return fused


def _apply_multipass(
    paths: list[list[tuple[float, float]]],
    multipass: int,
    reverse_toggle: bool,
) -> list[list[tuple[float, float]]]:
    """Repeat paths for multipass cutting, optionally reversing on odd passes."""
    result = []
    for i in range(multipass):
        for path in paths:
            if reverse_toggle and i % 2 == 1:
                result.append(list(reversed(path)))
            else:
                result.append(list(path))
    return result


def _apply_overcut(
    paths: list[list[tuple[float, float]]],
    overcut_mm: float,
) -> list[list[tuple[float, float]]]:
    """Extend closed paths by overcut_mm past the start point."""
    if overcut_mm <= 0:
        return paths
    result = []
    for path in paths:
        if len(path) >= 2 and path[0] == path[-1]:
            dx = path[1][0] - path[0][0]
            dy = path[1][1] - path[0][1]
            length = (dx**2 + dy**2) ** 0.5
            if length > 0:
                extra_x = path[-1][0] + (dx / length) * overcut_mm
                extra_y = path[-1][1] + (dy / length) * overcut_mm
                result.append(path + [(extra_x, extra_y)])
                continue
        result.append(path)
    return result


def optimize_paths(paths: PathList, settings: CutSettings) -> PathList:
    """Sort and optimise cut paths according to CutSettings.

    Strategies:
      - ``mintravel`` / ``mintravelfwd`` / ``mintravelfull``:
        Use StrategyMinTraveling.sort() (nearest-neighbour greedy).
        ``mintravelfwd`` disables path reversal; ``mintravelfull`` is an alias
        that also allows reversal (same as default).
      - ``matfree``: Use MatFree.apply() for mat-free monotone cutting.
      - ``zorder``: Keep original path order unchanged.
    """
    work = _to_tuples(paths)
    strategy = settings.strategy.lower()

    if strategy in ("mintravel", "mintravelfull", "mintravelfwd"):
        # reversible=False means paths are never reversed (forward-only)
        reversible = strategy != "mintravelfwd"
        work = _smt.sort(work, entrycircular=False, reversible=reversible)

    elif strategy == "matfree":
        # MatFree.apply() accepts a list of paths with (x, y) tuples,
        # and returns lists of XY_a objects — convert back to plain tuples.
        mf = MatFree(preset="nop")   # "nop" skips expensive slicing for now
        xy_output = mf.apply(work)
        work = _xy_paths_to_tuples(xy_output)

    # "zorder" — keep original order, no transformation needed

    work = _fuse_paths(work)
    work = _apply_overcut(work, settings.overcut)
    work = _apply_multipass(work, settings.multipass, settings.reverse_toggle)

    return _to_lists(work)
