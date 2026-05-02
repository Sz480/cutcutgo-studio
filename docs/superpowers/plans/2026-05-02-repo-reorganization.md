# Repo Reorganization — Development Focus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate Inkscape extension files into `Inkscape-Extension/` while keeping `cutcutgo/` and `studio/` untouched at root.

**Architecture:** File moves via `git mv` (preserves history), then 3 small path edits so the extension can still import `cutcutgo` from its new location one directory up. Studio and shared core receive zero changes.

**Tech Stack:** Bash, git, Python path management

---

### Task 1: Create directory and move files

**Files:**
- Create: `Inkscape-Extension/` (directory)
- Move: 9 files/directories from root into `Inkscape-Extension/`

- [ ] **Step 1: Create the directory and move all extension files**

```bash
cd "C:\Git\inkscape-cutcutgo-sz"
mkdir Inkscape-Extension
git mv sendto_cricut.py Inkscape-Extension/
git mv sendto_cricut.inx Inkscape-Extension/
git mv Makefile Inkscape-Extension/
git mv setup.py Inkscape-Extension/
git mv install_osx.py Inkscape-Extension/
git mv requirements.txt Inkscape-Extension/
git mv distribute Inkscape-Extension/
git mv misc Inkscape-Extension/
git mv po Inkscape-Extension/
```

- [ ] **Step 2: Verify git status shows staged moves, no deletions**

Run: `git status`
Expected: 9 files/directories shown as `renamed:` (staged), zero `deleted:`, zero untracked in root

---

### Task 2: Update sendto_cricut.py sys.path

**Files:**
- Modify: `Inkscape-Extension/sendto_cricut.py:16-17`

- [ ] **Step 1: Add parent directory to sys.path**

Edit `Inkscape-Extension/sendto_cricut.py` — insert one line after line 16:

```python
# we sys.path.append() the directory where this script lives.
sys.path.append(os.path.dirname(os.path.abspath(sys.argv[0])))
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(sys.argv[0])), '..'))

sys_platform = sys.platform.lower()
```

- [ ] **Step 2: Verify the extension can import cutcutgo**

Run: `cd Inkscape-Extension && python -c "import sys; sys.path.append('..'); import cutcutgo; print('cutcutgo imported OK')"`
Expected: Prints "cutcutgo imported OK" with no ImportError

---

### Task 3: Update Makefile paths

**Files:**
- Modify: `Inkscape-Extension/Makefile` lines 6, 47, 56

- [ ] **Step 1: Update the ALL variable (line 6)**

Edit line 6:
```makefile
# Before:
ALL=README.md *.png *.sh *.rules *.py *.inx examples misc cutcutgo locale
# After:
ALL=../README.md *.png *.sh *.rules *.py *.inx ../examples misc ../cutcutgo locale
```

- [ ] **Step 2: Update install target cutcutgo path (line 47)**

Edit line 47:
```makefile
# Before:
	cp -r cutcutgo $(DEST)
# After:
	cp -r ../cutcutgo $(DEST)
```

- [ ] **Step 3: Update install-local target cutcutgo path (line 56)**

Edit line 56:
```makefile
# Before:
	cp -r cutcutgo $(DESTLOCAL)
# After:
	cp -r ../cutcutgo $(DESTLOCAL)
```

---

### Task 4: Update setup.py paths

**Files:**
- Modify: `Inkscape-Extension/setup.py`

- [ ] **Step 1: Add parent directory to sys.path and update import**

Edit the top of `Inkscape-Extension/setup.py` — add `sys.path.insert(0, '..')` before the import:

```python
#!/usr/bin/env python
from os import path
import re
import sys

from distutils.core import setup
sys.path.insert(0, '..')
from sendto_cricut import __author__, __version__

# read the contents of your README file
this_directory = path.abspath(path.dirname(__file__))
with open(path.join(this_directory, '..', 'README.md'), encoding='utf-8') as f:
    long_description = f.read()
```

- [ ] **Step 2: Update setup() call to find cutcutgo package one directory up**

Add `package_dir` parameter to the `setup()` call. Change:
```python
setup(name='inkscape-cutcutgo',
      ...
      packages=['cutcutgo'],
      ...
)
```
To:
```python
setup(name='inkscape-cutcutgo',
      ...
      packages=['cutcutgo'],
      package_dir={'cutcutgo': '../cutcutgo'},
      ...
)
```

- [ ] **Step 3: Verify setup.py runs without import errors**

Run: `cd Inkscape-Extension && python setup.py --version`
Expected: Prints version number (e.g., `1.0`) with no traceback

---

### Task 5: Verify Studio is unaffected

- [ ] **Step 1: Run Studio backend tests**

Run: `cd studio/backend && python -m pytest -v`
Expected: All tests pass (should be ~14 tests in test_health, test_models, test_device, test_media, test_job, test_optimizer)

- [ ] **Step 2: Run Studio frontend tests**

Run: `cd studio/frontend && npm test -- --run`
Expected: All tests pass (client.test.ts + svg_parser.test.ts)

- [ ] **Step 3: Verify Studio backend starts**

Run: `cd studio/backend && timeout 5 python -m uvicorn main:app --host 127.0.0.1 --port 8765 2>&1 || true`
Expected: Output shows "Uvicorn running on http://127.0.0.1:8765"

---

### Task 6: Final verification and commit

- [ ] **Step 1: Full git status review**

Run: `git status`
Expected:
- 9 `renamed:` entries (staged moves from Task 1)
- 2-3 `modified:` entries (`sendto_cricut.py`, `setup.py`, `Makefile`)
- No untracked files outside `.claude/` and `docs/`

- [ ] **Step 2: Git diff review**

Run: `git diff --stat`
Expected: Only the 3 edited files show changes, no unexpected modifications

- [ ] **Step 3: Commit**

```bash
git add Inkscape-Extension/
git add -u
git commit -m "$(cat <<'EOF'
refactor: consolidate Inkscape extension files into Inkscape-Extension/

Move extension-specific files (sendto_cricut.py/.inx, Makefile, setup.py,
install_osx.py, requirements.txt, distribute/, misc/, po/) into a dedicated
Inkscape-Extension/ directory. Update sys.path and Makefile references so
the extension can still import the shared cutcutgo/ package from root.

cutcutgo/ and studio/ are untouched — zero changes to the standalone app.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```
