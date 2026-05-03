from __future__ import annotations
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field

# Coordinate types (all values in millimetres)
Point = list[float]   # [x_mm, y_mm]
Path = list[Point]    # ordered sequence of points forming one stroke
PathList = list[Path] # collection of strokes


class TraceMode(str, Enum):
    silhouette = "silhouette"
    color      = "color"


class TraceParams(BaseModel):
    mode:           TraceMode = TraceMode.silhouette
    threshold:      int   = Field(default=128, ge=0, le=255)
    num_colors:     int   = Field(default=4, ge=2, le=8)
    smoothness:     float = Field(default=1.0, ge=0.0, le=10.0)
    media_width_mm: float = Field(default=304.8, gt=0)


class ColorLayer(BaseModel):
    color: str
    paths: PathList


class TraceResult(BaseModel):
    paths:  PathList
    layers: list[ColorLayer] = []


class CutSettings(BaseModel):
    media: int = Field(default=1, ge=1, le=11, description="Media preset ID (1–11)")
    tool: str = Field(default="blade", description="'blade' or 'pen'")
    speed: int = Field(default=3, ge=0, le=10, description="Cut speed 1–10; 0 = media default")
    pressure: float = Field(default=0.0, ge=0, le=18, description="Force 1–18; 0 = media default")
    depth: int = Field(default=-1, ge=-1, le=10, description="Autoblade depth; -1 = media default")
    blade_diameter: float = Field(default=0.9, ge=0, le=2.3, description="Physical blade diameter mm")
    multipass: int = Field(default=1, ge=1, le=8, description="Number of repeat cuts")
    overcut: float = Field(default=0.5, ge=0, description="Extra mm at path end for closed paths")
    strategy: str = Field(default="mintravel", description="mintravel | mintravelfull | matfree | zorder")
    x_offset: float = Field(default=0.0, description="X offset in mm added to all paths")
    y_offset: float = Field(default=0.0, description="Y offset in mm added to all paths")
    media_width_mm: float = Field(default=304.8, description="Media width in mm (12 inch = 304.8)")
    media_height_mm: float = Field(default=609.6, description="Media height in mm (24 inch = 609.6)")
    sharpen_corners: bool = Field(default=False, description="Lift blade at sharp corners")
    reverse_toggle: bool = Field(default=False, description="Alternate cut direction each pass")
    sw_clipping: bool = Field(default=True, description="Clip paths to media bounds in software")


class CutJob(BaseModel):
    paths: PathList = Field(description="Cut paths — list of strokes, each a list of [x_mm, y_mm] points")
    settings: CutSettings = Field(default_factory=CutSettings)


class JobResponse(BaseModel):
    success: bool
    message: str
    bbox: Optional[dict] = None
    optimized_paths: Optional[PathList] = None


class DeviceStatus(BaseModel):
    connected: bool
    status: str  # "ready" | "moving" | "unloaded" | "not_found" | "error"
    version: Optional[str] = None
    port: Optional[str] = None


class MediaPreset(BaseModel):
    id: int
    name: str
    default_pressure: float
    default_clearance: float


class JogRequest(BaseModel):
    dx_mm: float
    dy_mm: float


class ToolRequest(BaseModel):
    action: str  # "up" | "pen" | "blade"


class PositionResponse(BaseModel):
    x_mm: float
    y_mm: float
    tool_state: str  # "up" | "pen" | "blade"
