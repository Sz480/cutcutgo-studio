# Repository Reorganization — Development Focus

**Date:** 2026-05-02
**Goal:** Separate Inkscape extension files from CutCutGo-Studio files while keeping the shared `cutcutgo/` core at the repo root. Zero changes to Studio or cutcutgo logic.

## Architecture

Two applications share one core library:

```
inkscape-cutcutgo-sz/
  cutcutgo/                          # Shared core (CricutMaker driver, geometry, strategies)
  studio/                            # CutCutGo-Studio (Electron+React+FastAPI) — UNCHANGED
  Inkscape-Extension/                # Inkscape extension (inkex-based GUI)
    sendto_cricut.py / .inx
    Makefile / setup.py / install_osx.py / requirements.txt
    distribute/ / misc/ / po/
  examples/ / doc/ / assets/         # Shared reference files — UNCHANGED
  README.md / USERGUIDE.md / LICENSE # Project docs — UNCHANGED
```

Both consumers import `cutcutgo` from the repo root. The extension adds `..` to `sys.path` (same pattern Studio's backend already uses with `sys.path.insert(0, repo_root)`).

## File Moves

All source goes into `Inkscape-Extension/`:

| Source | Destination |
|---|---|
| `sendto_cricut.py` | `Inkscape-Extension/sendto_cricut.py` |
| `sendto_cricut.inx` | `Inkscape-Extension/sendto_cricut.inx` |
| `Makefile` | `Inkscape-Extension/Makefile` |
| `setup.py` | `Inkscape-Extension/setup.py` |
| `install_osx.py` | `Inkscape-Extension/install_osx.py` |
| `requirements.txt` | `Inkscape-Extension/requirements.txt` |
| `distribute/` | `Inkscape-Extension/distribute/` |
| `misc/` | `Inkscape-Extension/misc/` |
| `po/` | `Inkscape-Extension/po/` |

Stays at root (untouched): `cutcutgo/`, `studio/`, `examples/`, `doc/`, `docs/`, `assets/`, `README.md`, `USERGUIDE.md`, `LICENSE`, `.github/`, `.claude/`, `.vscode/`, `.gitignore`.

## Path Updates (3 files, minimal edits)

### `Inkscape-Extension/sendto_cricut.py:16`
Add parent dir to sys.path so `import cutcutgo` still resolves:
```python
sys.path.append(os.path.dirname(os.path.abspath(sys.argv[0])))
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(sys.argv[0])), '..'))  # NEW
```

### `Inkscape-Extension/setup.py`
- Add `sys.path.insert(0, '..')` before importing `sendto_cricut`
- Update README path: `path.join(this_directory, '..', 'README.md')`
- Add `package_dir={'cutcutgo': '../cutcutgo'}` to setup() call

### `Inkscape-Extension/Makefile`
- `install` / `install-local`: `cp -r cutcutgo` → `cp -r ../cutcutgo`
- `tar_dist_classic` `ALL` variable: update paths for items that moved (`../README.md`, `../examples`, `../cutcutgo`)

## Verification

After moves and edits:
1. `studio/backend` tests pass: `cd studio/backend && python -m pytest` (no changes needed)
2. `studio/frontend` tests pass: `cd studio/frontend && npm test` (no changes needed)
3. Extension import check: `cd Inkscape-Extension && python -c "import cutcutgo; print('ok')"` — verifies sys.path change works
4. Git status confirms no files were lost or duplicated
