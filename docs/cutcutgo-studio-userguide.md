# CutCutGo Studio — User Guide

CutCutGo Studio is a standalone desktop application for sending cut and draw jobs to a **Cricut Maker Gen 1** running the **CutCutGo firmware** (v1.0, Build 972f570). It replaces the Inkscape extension workflow with a self-contained app that requires no Inkscape installation.

---

## Requirements

- Cricut Maker Gen 1 with CutCutGo firmware flashed
- USB cable connected to PC
- Windows 10/11 (macOS support planned)
- No Inkscape required

---

## Starting the App

Launch **CutCutGo Studio**. The app starts a small Python backend automatically in the background — this takes a few seconds on first launch. You will see the main window with:

- **Toolbar** across the top (Open SVG, Preview Cut, Cut Now)
- **Canvas** in the center (shows your design)
- **Sidebar** on the right (Device Status + Cut Settings)

---

## Step 1 — Connect the Device

Before you can cut, you must connect to the machine from within the app. The operating system detecting the USB port is not enough.

1. Plug in the Cricut via USB. The OS will assign a COM port (e.g. COM3).
2. In the **right sidebar**, find the **Device Status** panel at the top.
3. Click the blue **Connect** button.
4. The status dot will turn **green** and show `ready · COM3` when the connection is established.

**Status dot colours:**

| Colour | Meaning |
|--------|---------|
| Green | Ready — machine idle, safe to cut |
| Yellow | Moving — cut or move in progress |
| Orange | Unloaded — no mat detected |
| Red | Error |
| Grey | Not connected |

If connection fails, check that no other program (e.g. the Inkscape extension, a serial monitor) is using the same COM port.

---

## Step 2 — Load an SVG Design

Click **Open SVG…** in the toolbar and select your file.

The design will appear on the canvas. The canvas shows a white area representing the media mat; your paths are overlaid in colour.

### SVG Compatibility

The app reads standard SVG shape elements: `path`, `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`. All path commands (M L H V C S Q T A Z) are supported.

**If the design loads but "Preview Cut" stays grey**, the SVG contains no supported shape elements. Common causes:

- The file uses `<use>` elements that reference shapes in `<defs>` (common in web-exported SVGs and some design tools).
- The file contains only `<text>` elements (text is not cut directly — convert to paths first).
- The file is an Inkscape SVG with proprietary extensions that hide the real paths.

**Fix:** In Inkscape, go to **File → Save a Copy → Plain SVG** (not "Inkscape SVG"). If your design has text, select it and do **Path → Object to Path** before saving.

---

## Step 3 — Configure Cut Settings

In the right sidebar below the Device Status, the **Cut Settings** panel lets you tune the job.

| Setting | Description |
|---------|-------------|
| **Media** | Material preset (Laser Copy Paper, Cardstock, etc.). Sets default pressure and blade clearance. |
| **Tool** | Blade (right holder) or Pen (left holder). |
| **Speed** | 0 = media default. Range 1–10. Lower is slower and more precise. |
| **Pressure** | 0 = media default. Range 1–18. Higher cuts deeper. |
| **Multipass** | How many times to repeat each cut path. Useful for thick materials. Range 1–8. |
| **Strategy** | Path optimisation algorithm (see below). |
| **X / Y Offset mm** | Shift the entire job on the mat. Positive X moves right; positive Y moves down. |
| **Software Clipping** | Clips paths to the mat boundaries. Keep enabled unless you know your design fits entirely within the mat. |

### Cut Strategies

| Strategy | When to use |
|----------|-------------|
| Min Travel | Default. Nearest-neighbour: minimises blade travel between cuts. |
| Min Travel Full | Like Min Travel but also reverses path direction if it reduces travel. |
| Mat Free | Optimised for mat-less cutting; cuts from bottom to top so material doesn't shift. |
| Z-Order | Cuts in the exact draw order from the SVG. Use when layer order matters. |

### Media Presets

The Media dropdown is populated from the backend. Default preset 1 is **Laser Copy Paper** — a safe starting point. Choosing a preset sets the recommended default pressure and blade clearance; you can still override Speed and Pressure manually.

---

## Step 4 — Preview Cut

Click **Preview Cut** to send the paths to the optimiser and see the planned cut order. The canvas will update to show the optimised path sequence with numbered start points.

Preview does **not** move the machine. It is a dry run to check path order and count before committing to a cut.

**Preview Cut requires a loaded design but does not require the device to be connected.**

---

## Step 5 — Cut Now

Click **Cut Now** to send the job to the machine.

Requirements before Cut Now becomes active:
- A design must be loaded (SVG parsed successfully, at least one path found)
- The device must be connected (green dot)
- No job currently running

The toolbar button changes to **Cutting…** during the job and a **Cancel** button appears. When finished, the toolbar shows **Done**.

If an error occurs, the toolbar shows **Error — check console**. Open the developer console (if running in dev mode) or the app log for details.

---

## Cancelling a Job

Click **Cancel** while a cut or preview is running to abort immediately. The machine will stop mid-cut. You may need to manually move the blade head back to the home position.

---

## Common Problems

### Both "Preview Cut" and "Cut Now" are greyed out

The SVG was loaded but zero cuttable paths were found. See [SVG Compatibility](#svg-compatibility) above. Save the file as Plain SVG from Inkscape with all text converted to paths.

### "Cut Now" is greyed out but "Preview Cut" works

The device is not connected. Click **Connect** in the Device Status panel.

### Connect fails immediately

Another program is holding the serial port open. Close Inkscape, serial monitors, or any other software that accesses COM3. Then try Connect again.

### Design appears on canvas but is very small or in the wrong position

The SVG has no `viewBox` or the `width`/`height` attributes are in unexpected units. The canvas preview and coordinates sent to the machine may be off. Open the SVG in Inkscape, set the document width and height explicitly in mm under **File → Document Properties**, then save as Plain SVG.

### Machine cuts in the wrong position

Use the **X Offset** and **Y Offset** fields to shift the cut area. Positive X shifts right, positive Y shifts down. Units are millimetres.

---

## Mat and Media Setup

The default mat size is **304.8 × 609.6 mm** (12 × 24 in). Place your material in the upper-left corner of the mat, aligned with the registration marks. Load the mat into the machine as you would normally for CutCutGo.

The canvas in the app represents this mat. Your design is positioned relative to the mat origin (top-left corner). Use X/Y offsets to move the design away from the edge if needed.

---

## Blade and Pen Tips

- **Blade depth**: The app sends a depth command based on the media preset. Start with depth -1 (media default) and adjust if the material is not cut through.
- **Pen/marker**: Switch the Tool setting to "Pen" before loading a design to use the left holder. Pressure still applies — set it low (2–4) so the pen doesn't tear paper.
- **Multipass for thick materials**: Set Multipass to 2–3 and reduce speed to 2–3 for cardstock, foam, or leather.

---

## Troubleshooting Checklist

1. USB cable is firmly connected at both ends
2. Cricut is powered on and shows its startup state
3. CutCutGo firmware is flashed (not original Cricut firmware)
4. No other software is using the COM port
5. App backend has had a few seconds to start (wait for sidebar to populate)
6. Device Status shows **Connect** button (grey dot = not yet connected)
7. SVG saved as Plain SVG with all text converted to paths
8. At least one path shows on the canvas before attempting to cut
