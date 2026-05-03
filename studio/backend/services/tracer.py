from __future__ import annotations
import io
import re
import xml.etree.ElementTree as ET

from PIL import Image
import vtracer

from studio.backend.models import TraceMode, TraceParams, ColorLayer, TraceResult

_SVG_NS = 'http://www.w3.org/2000/svg'
_MAX_DIM = 2000  # max pixel dimension before resize


def trace(image_bytes: bytes, params: TraceParams) -> TraceResult:
    img = Image.open(io.BytesIO(image_bytes))
    if img.mode in ('RGBA', 'LA', 'PA') or (img.mode == 'P' and 'transparency' in img.info):
        bg = Image.new('RGB', img.size, (255, 255, 255))
        bg.paste(img.convert('RGBA'), mask=img.convert('RGBA').split()[3])
        img = bg
    else:
        img = img.convert('RGB')

    # Resize to max _MAX_DIM on longest side
    w, h = img.size
    if max(w, h) > _MAX_DIM:
        ratio = _MAX_DIM / max(w, h)
        img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)
        w, h = img.size

    scale_x = params.media_width_mm / w
    scale_y = scale_x  # proportional

    if params.mode == TraceMode.silhouette:
        gray = img.convert('L')
        bw = gray.point(lambda p: 255 if p > params.threshold else 0).convert('RGB')
        png_bytes = _to_png_bytes(bw)
        colormode = 'binary'
    else:
        png_bytes = _to_png_bytes(img)
        colormode = 'color'

    try:
        svg_str = vtracer.convert_raw_image_to_svg(
            png_bytes,
            colormode=colormode,
            filter_speckle=max(1, int(params.smoothness * 4)),
            color_precision=params.num_colors,
            mode='spline',
            hierarchical='stacked',
        )
        all_paths, color_layers = _parse_svg(svg_str, scale_x, scale_y)
    except Exception:
        return TraceResult(paths=[], layers=[])

    return TraceResult(
        paths=all_paths,
        layers=color_layers if params.mode == TraceMode.color else [],
    )


def _to_png_bytes(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return buf.getvalue()


def _parse_svg(svg_str: str, sx: float, sy: float) -> tuple[list, list]:
    root = ET.fromstring(svg_str)
    all_paths: list = []
    layers: dict[str, list] = {}

    # Try namespaced search first, fall back to non-namespaced
    path_elements = list(root.iter(f'{{{_SVG_NS}}}path'))
    if not path_elements:
        path_elements = list(root.iter('path'))

    for el in path_elements:
        d = el.get('d', '')
        fill = el.get('fill', '#000000')
        pts = _sample_path(d, sx, sy)
        if len(pts) >= 2:
            all_paths.append(pts)
            layers.setdefault(fill, []).append(pts)

    color_layers = [ColorLayer(color=c, paths=p) for c, p in layers.items()]
    return all_paths, color_layers


def _sample_path(d: str, sx: float, sy: float, smoothness: float = 0.05) -> list:
    cmds = _parse_commands(d)
    pts: list = []
    cx = cy = sx_start = sy_start = 0.0
    last_cp2x = last_cp2y = None

    for cmd in cmds:
        t = cmd['type']
        if t == 'M':
            cx, cy = cmd['x'], cmd['y']
            sx_start, sy_start = cx, cy
            pts.append([cx * sx, cy * sy])
            last_cp2x = last_cp2y = None
        elif t == 'L':
            cx, cy = cmd['x'], cmd['y']
            pts.append([cx * sx, cy * sy])
            last_cp2x = last_cp2y = None
        elif t == 'C':
            sub = _subdivide(cx, cy, cmd['x1'], cmd['y1'], cmd['x2'], cmd['y2'],
                             cmd['x'], cmd['y'], smoothness)
            pts.extend([[px * sx, py * sy] for px, py in sub])
            last_cp2x, last_cp2y = cmd['x2'], cmd['y2']
            cx, cy = cmd['x'], cmd['y']
        elif t == 'S':
            x1 = 2*cx - last_cp2x if last_cp2x is not None else cx
            y1 = 2*cy - last_cp2y if last_cp2y is not None else cy
            sub = _subdivide(cx, cy, x1, y1, cmd['x2'], cmd['y2'],
                             cmd['x'], cmd['y'], smoothness)
            pts.extend([[px * sx, py * sy] for px, py in sub])
            last_cp2x, last_cp2y = cmd['x2'], cmd['y2']
            cx, cy = cmd['x'], cmd['y']
        elif t == 'Z':
            pts.append([sx_start * sx, sy_start * sy])
            last_cp2x = last_cp2y = None
    return pts


_RE_CMD = re.compile(r'([MLCSZmlcsz])([^MLCSZmlcsz]*)')
_RE_NUM = re.compile(r'-?[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?')


def _parse_commands(d: str) -> list:
    cmds = []
    lx = ly = 0.0

    for m in _RE_CMD.finditer(d):
        letter = m.group(1)
        typ = letter.upper()
        rel = letter != typ
        nums = [float(n) for n in _RE_NUM.findall(m.group(2))]
        ox = lx if rel else 0.0
        oy = ly if rel else 0.0

        if typ == 'M':
            for i in range(0, len(nums), 2):
                ox_i = lx if rel else 0.0
                oy_i = ly if rel else 0.0
                x, y = nums[i] + ox_i, nums[i+1] + oy_i
                cmds.append({'type': 'M' if i == 0 else 'L', 'x': x, 'y': y})
                lx, ly = x, y
        elif typ == 'L':
            for i in range(0, len(nums), 2):
                x, y = nums[i] + ox, nums[i+1] + oy
                cmds.append({'type': 'L', 'x': x, 'y': y})
                lx, ly = x, y
        elif typ == 'C':
            for i in range(0, len(nums), 6):
                x1, y1 = nums[i]+ox, nums[i+1]+oy
                x2, y2 = nums[i+2]+ox, nums[i+3]+oy
                x, y   = nums[i+4]+ox, nums[i+5]+oy
                cmds.append({'type': 'C', 'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2, 'x': x, 'y': y})
                lx, ly = x, y
        elif typ == 'S':
            for i in range(0, len(nums), 4):
                x2, y2 = nums[i]+ox, nums[i+1]+oy
                x, y   = nums[i+2]+ox, nums[i+3]+oy
                cmds.append({'type': 'S', 'x2': x2, 'y2': y2, 'x': x, 'y': y})
                lx, ly = x, y
        elif typ == 'Z':
            cmds.append({'type': 'Z'})

    return cmds


def _subdivide(x0, y0, x1, y1, x2, y2, x3, y3, eps, depth=0):
    if depth >= 32:
        return [(x3, y3)]
    dx, dy = x3 - x0, y3 - y0
    d1 = abs((x1 - x3) * dy - (y1 - y3) * dx)
    d2 = abs((x2 - x3) * dy - (y2 - y3) * dx)
    if (d1 + d2) ** 2 <= eps * (dx*dx + dy*dy):
        return [(x3, y3)]
    mx01, my01 = (x0+x1)/2, (y0+y1)/2
    mx12, my12 = (x1+x2)/2, (y1+y2)/2
    mx23, my23 = (x2+x3)/2, (y2+y3)/2
    mx012, my012 = (mx01+mx12)/2, (my01+my12)/2
    mx123, my123 = (mx12+mx23)/2, (my12+my23)/2
    mx,  my  = (mx012+mx123)/2, (my012+my123)/2
    return (
        _subdivide(x0, y0, mx01, my01, mx012, my012, mx, my, eps, depth+1) +
        _subdivide(mx, my, mx123, my123, mx23, my23, x3, y3, eps, depth+1)
    )
