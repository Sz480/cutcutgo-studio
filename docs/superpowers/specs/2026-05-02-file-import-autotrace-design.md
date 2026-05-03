# Design Spec: Universal File Import with Auto-Vectorization

**Date:** 2026-05-02
**Status:** Approved
**Scope:** CutCutGo Studio — Schritt 1 der eigenständigen Standalone-Lösung

---

## Problem

CutCutGo Studio akzeptiert derzeit nur SVG-Dateien und setzt voraus, dass der User Text bereits in Pfade konvertiert hat sowie keine `<use>`-Elemente verwendet. Das macht externe Tools (Inkscape) erforderlich und widerspricht dem Ziel einer vollständigen Standalone-Lösung vergleichbar mit Cricut Design Space.

---

## Ziel

Der User kann **PNG, JPG und SVG** direkt in CutCutGo Studio laden. Die App konvertiert Rasterbilder automatisch zu schneidbaren Pfaden (Auto-Tracing) mit einer interaktiven Vorschau. SVG-Dateien werden intern normalisiert — kein Inkscape nötig.

---

## Unterstützte Dateiformate (Schritt 1)

| Format | Behandlung |
|--------|-----------|
| `.svg` | Frontend-Parser, erweitert um `<use>`-Auflösung und Transform-Akkumulation. `<text>` → Toast-Warnung. |
| `.png` | Backend Auto-Tracing via `vtracer`. Vorschau-Modal mit Parametereinstellung. |
| `.jpg` / `.jpeg` | Identisch wie PNG. |

---

## Architektur

### Datenfluss — PNG/JPG

```
User öffnet PNG/JPG
  → App.tsx erkennt Dateitype
  → ImportPanel öffnet sich (Modal)
      → User stellt Tracing-Parameter ein
      → debounced POST /api/import/trace (300ms)
          → backend/services/tracer.py
              → Pillow: Resize auf max. 2000px, optional Vorverarbeitung
              → vtracer.convert_raw_image_to_svg()
              → SVG-Output parsen → PathList (mm-Koordinaten)
          → TraceResult zurück an Frontend
      → Vorschau: Pfade als SVG-Overlay über Originalbild
      → User wählt Farblagen (Farb-Modus) oder bestätigt Silhouette
  → "Übernehmen" → PathList in App-State
  → Canvas, Preview Cut, Cut Now (bestehender Flow)
```

### Datenfluss — SVG

```
User öffnet SVG
  → App.tsx erkennt .svg
  → Erweiterter parseSvgToMmPaths()
      → <use> href auflösen (inline DOM-Expansion)
      → <g transform> Matrix akkumulieren
      → <text> → console.warn + Toast-Warnung
      → PathList
  → direkt in Canvas (kein Modal)
```

---

## Backend

### Neue Abhängigkeiten

```
vtracer>=0.6.0    # Raster → Vektor (Rust-basiert, pip install vtracer)
Pillow>=10.0.0    # Bildvorverarbeitung
```

### Neue Modelle (`studio/backend/models.py`)

```python
class TraceMode(str, Enum):
    silhouette = "silhouette"
    color      = "color"

class TraceParams(BaseModel):
    mode:       TraceMode = TraceMode.silhouette
    threshold:  int   = 128   # 0–255, Silhouette-Modus
    num_colors: int   = 4     # 2–8, Farb-Modus
    smoothness: float = 1.0   # vtracer filter_speckle

class ColorLayer(BaseModel):
    color: str
    paths: PathList

class TraceResult(BaseModel):
    paths:  PathList
    layers: list[ColorLayer] = []
```

### Neuer Service (`studio/backend/services/tracer.py`)

```python
def trace(image_bytes: bytes, params: TraceParams) -> TraceResult:
    # 1. Pillow: Bild laden, auf max. 2000px (längste Seite) skalieren
    # 2. Als PNG-Bytes serialisieren (vtracer erwartet PNG/BMP)
    # 3. vtracer.convert_raw_image_to_svg(
    #        img_bytes,
    #        colormode="binary" | "color",
    #        filter_speckle=params.smoothness,
    #        color_precision=params.num_colors,
    #    )
    # 4. SVG-String parsen → PathList extrahieren (re-use parseSvgPath-Logik)
    # 5. mm-Koordinaten: Traced SVG hat viewBox in Pixel-Einheiten.
    #    Skalierung: Pfade werden proportional auf media_width_mm eingepasst
    #    (längste Seite = Mattenbreite, zentriert). So passt jedes Bild
    #    ohne Überlauf auf die Matte. User kann danach per X/Y-Offset
    #    und den bestehenden Cut-Settings feinpositionieren.
    # 6. Bei color-Modus: Farb-Gruppen aus SVG <path fill="..."> extrahieren
    # 7. TraceResult zurückgeben
```

### Neuer Router (`studio/backend/routers/import_file.py`)

```
POST /api/import/trace
  Content-Type: multipart/form-data
  Felder:
    file:   UploadFile  (PNG/JPG, max. 20MB)
    params: str         (JSON-kodiertes TraceParams-Objekt)
  Response: TraceResult

Fehlerbehandlung:
  422  Ungültiges Dateiformat (nicht PNG/JPG)
  413  Datei > 20MB
  500  vtracer-Fehler (mit verständlicher Meldung)
```

---

## Frontend

### App.tsx — Dateitype-Erkennung

```typescript
// handleOpenFile unterscheidet nach Dateiendung:
//   .svg           → parseSvgToMmPaths() (erweitert)
//   .png/.jpg/.jpeg → setImportFile(file) → ImportPanel öffnet sich
```

Toolbar-Button "Open SVG…" wird zu **"Datei öffnen…"**, akzeptiert `.svg,.png,.jpg,.jpeg`.

### ImportPanel (`studio/frontend/src/renderer/components/ImportPanel.tsx`)

Modal-Layout (zweispaltig):

```
┌─────────────────────────────────────────────────────────┐
│  Bild importieren                                    [×] │
├────────────────────┬────────────────────────────────────┤
│  EINSTELLUNGEN     │  VORSCHAU                          │
│                    │                                    │
│  Modus             │  [Originalbild + Pfade als         │
│  ○ Silhouette      │   farbige SVG-Overlays]            │
│  ● Farbtrennung    │                                    │
│                    │  Farb-Lagen (Farb-Modus):          │
│  Schwellenwert 128 │  ☑ ██ #1a1a1a  (312 Pfade)        │
│  [Slider 0–255]    │  ☑ ██ #ff3300  (87 Pfade)         │
│                    │  ☐ ██ #ffd700  (23 Pfade)         │
│  Anzahl Farben  4  │                                    │
│  [Slider 2–8]      │                                    │
│                    │                                    │
│  Glättung      1.0 │                                    │
│  [Slider]          │                                    │
│                    │                                    │
│  [Abbrechen]       │              [Übernehmen →]        │
└────────────────────┴────────────────────────────────────┘
```

Verhalten:
- Parameteränderung → 300ms debounce → POST /api/import/trace → Vorschau aktualisiert
- Farb-Modus: Checkboxen pro Layer (deaktivierte Layer werden nicht übernommen)
- "Übernehmen": aktive PathLists zusammenführen → App-State setzen → Modal schließen
- "Abbrechen": Modal schließen, kein State-Change

### useImport Hook (`studio/frontend/src/renderer/hooks/useImport.ts`)

```typescript
// State: file, params, result (TraceResult | null), loading, error
// Effekt: debounce 300ms auf params-Änderungen → api.traceImage()
// Gibt zurück: params, setParams, result, loading, error, accept(layerMask)
```

### API Client (`studio/frontend/src/renderer/api/client.ts`)

```typescript
traceImage(file: File, params: TraceParams): Promise<TraceResult>
// multipart/form-data: file als Blob, params als JSON-String
```

### SVG-Parser Erweiterungen (`studio/frontend/src/renderer/svg/parser.ts`)

| Problem | Lösung |
|---------|--------|
| `<use href="#id">` → leer | `getElementById(href)` im geparsten DOM, Element inline tracen mit akkumuliertem Transform |
| `<text>` → leer, kein Hinweis | Toast-Warnung ausgeben: *"Text-Elemente werden nicht unterstützt"* |
| Verschachtelte `<g transform>` | Transform-Matrix von Root bis Element akkumulieren vor Koordinaten-Konvertierung |

Toast-Ausgabe: neuer optionaler Callback-Parameter `onWarning?: (msg: string) => void` in `parseSvgToMmPaths()`.

---

## Geänderte Dateien

| Datei | Änderung |
|-------|---------|
| `studio/backend/models.py` | `TraceMode`, `TraceParams`, `ColorLayer`, `TraceResult` hinzufügen |
| `studio/backend/main.py` | Import-Router registrieren |
| `studio/backend/services/__init__.py` | neu (leer) |
| `studio/backend/services/tracer.py` | neu — Tracing-Logik |
| `studio/backend/routers/import_file.py` | neu — `/api/import/trace` Endpoint |
| `studio/frontend/src/renderer/svg/parser.ts` | `<use>`, Transform-Akkumulation, `onWarning`-Callback |
| `studio/frontend/src/renderer/api/client.ts` | `traceImage()` hinzufügen |
| `studio/frontend/src/renderer/types.ts` | `TraceParams`, `ColorLayer`, `TraceResult` hinzufügen |
| `studio/frontend/src/renderer/App.tsx` | Dateitype-Erkennung, ImportPanel einbinden |
| `studio/frontend/src/renderer/components/Toolbar.tsx` | Button-Label + accept-Attribute |
| `studio/frontend/src/renderer/components/ImportPanel.tsx` | neu — Modal |
| `studio/frontend/src/renderer/hooks/useImport.ts` | neu — Tracing-State |

---

## Nicht im Scope (Schritt 1)

- `<text>` → Pfad-Konvertierung (benötigt Font-Rendering)
- DXF / PDF Import
- Skalierungs-/Rotations-Handles im Canvas
- Mehrere Designs gleichzeitig auf dem Canvas
- Farbiges Schneiden (Farb-Lagen als separate Jobs senden)
