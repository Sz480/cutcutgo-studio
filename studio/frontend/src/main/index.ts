import { app, BrowserWindow, shell, ipcMain, Menu } from 'electron'
import { join } from 'path'
import { execFile } from 'child_process'
import { writeFileSync, readFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { startPythonBackend, stopPythonBackend } from './python_manager'

const INKSCAPE_CANDIDATES = [
  'inkscape',
  'C:\\Program Files\\Inkscape\\bin\\inkscape.exe',
  'C:\\Program Files (x86)\\Inkscape\\bin\\inkscape.exe',
  '/usr/bin/inkscape',
  '/usr/local/bin/inkscape',
  '/Applications/Inkscape.app/Contents/MacOS/inkscape',
]

function tryFlattenWithInkscape(svgContent: string, candidate: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const ts = Date.now()
    const tmpIn = join(tmpdir(), `ccg-${ts}-in.svg`)
    const tmpOut = join(tmpdir(), `ccg-${ts}-out.svg`)
    writeFileSync(tmpIn, svgContent, 'utf8')
    execFile(
      candidate,
      ['--actions=select-all;object-to-path', `--export-filename=${tmpOut}`, tmpIn],
      { timeout: 10000 },
      (err) => {
        try { unlinkSync(tmpIn) } catch { /* ignore */ }
        if (err) {
          try { unlinkSync(tmpOut) } catch { /* ignore */ }
          return reject(err)
        }
        try {
          const result = readFileSync(tmpOut, 'utf8')
          unlinkSync(tmpOut)
          resolve(result)
        } catch (e) {
          reject(e)
        }
      },
    )
  })
}

ipcMain.handle('svg:flattenText', async (_event, svgContent: string) => {
  for (const candidate of INKSCAPE_CANDIDATES) {
    try {
      const svg = await tryFlattenWithInkscape(svgContent, candidate)
      return { ok: true, svg }
    } catch {
      // try next candidate
    }
  }
  return { ok: false }
})

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'CutCutGo Studio',
    backgroundColor: '#0a0a14',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
    },
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.cutcutgo.studio')
  app.on('browser-window-created', (_, w) => optimizer.watchWindowShortcuts(w))

  try {
    await startPythonBackend()
    console.log('[main] Python backend started successfully')
  } catch (e) {
    console.error('[main] Failed to start Python backend:', e)
    // Continue anyway — renderer will show "Backend not reachable"
  }

  createWindow()

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' },
      {
        label: 'Extras',
        submenu: [
          {
            label: 'Teach Panel',
            accelerator: 'CmdOrCtrl+Shift+T',
            click: () => mainWindow?.webContents.send('teach-panel:toggle'),
          },
        ],
      },
      { role: 'helpMenu' },
    ])
  )

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopPythonBackend()
  if (process.platform !== 'darwin') app.quit()
})
