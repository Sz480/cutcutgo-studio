import { useState, useCallback, useEffect } from 'react'
import { DEFAULT_SETTINGS } from './types'
import type { CutSettings, PathList, MediaPreset } from './types'
import { api } from './api/client'
import { parseSvgToMmPaths } from './svg/parser'
import { useDevice } from './hooks/useDevice'
import { useJob } from './hooks/useJob'
import { useImport } from './hooks/useImport'
import { Toolbar } from './components/Toolbar'
import { Canvas } from './components/Canvas'
import { SettingsPanel } from './components/SettingsPanel'
import { ScalePanel } from './components/ScalePanel'
import { DeviceStatus } from './components/DeviceStatus'
import { ImportPanel } from './components/ImportPanel'
import { TeachPanel } from './components/TeachPanel'
import { useTeachPanel } from './hooks/useTeachPanel'

export default function App() {
  const [settings, setSettings] = useState<CutSettings>(DEFAULT_SETTINGS)
  const [mediaPresets, setMediaPresets] = useState<MediaPreset[]>([])
  const [svgContent, setSvgContent] = useState<string | null>(null)
  const [parsedPaths, setParsedPaths] = useState<PathList | null>(null)
  const [svgWarning, setSvgWarning] = useState<string | null>(null)
  const [svgNormOffset, setSvgNormOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [scale, setScale] = useState<number>(1.0)
  const [showImportPanel, setShowImportPanel] = useState(false)

  const { status: deviceStatus, loading: deviceLoading, error: deviceError, connect, disconnect } = useDevice()
  const { state: jobState, previewPaths, error: jobError, preview, send, cancel, reset } = useJob()
  const importHook = useImport()
  const [showTeachPanel, setShowTeachPanel] = useState(false)
  const teachPanelState = useTeachPanel(deviceStatus.connected)

  useEffect(() => {
    return window.electron.ipcRenderer.on('teach-panel:toggle', () => {
      setShowTeachPanel(s => !s)
    })
  }, [])

  useEffect(() => {
    api.listMedia().then(setMediaPresets).catch(() => {})
  }, [])

  const handleOpenFile = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.svg,.png,.jpg,.jpeg'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      const ext = file.name.split('.').pop()?.toLowerCase()

      if (ext === 'svg') {
        let text = await file.text()
        setSvgWarning(null)
        let appHandledTextWarning = false

        if (/<text[\s>]/i.test(text)) {
          const result = await window.electron.ipcRenderer.invoke(
            'svg:flattenText', text,
          ) as { ok: boolean; svg?: string }
          if (result.ok && result.svg) {
            text = result.svg
            // Only suppress text warning if Inkscape actually removed all text nodes
            if (!/<text[\s>]/i.test(text)) {
              appHandledTextWarning = true
            }
          } else {
            setSvgWarning(
              'Hinweis: Text-Elemente wurden übersprungen — zum Schneiden bitte in Inkscape zu Pfaden konvertieren (Pfad → Objekt in Pfad umwandeln).',
            )
            appHandledTextWarning = true
          }
        }

        setSvgContent(text)
        const paths = parseSvgToMmPaths(
          text,
          0.05,
          (msg) => setSvgWarning(msg),
          appHandledTextWarning,
        )
        setParsedPaths(paths)
        setScale(1.0)
        reset()
      } else if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') {
        importHook.setFile(file)
        importHook.setParams({ ...importHook.params, media_width_mm: settings.media_width_mm })
        setShowImportPanel(true)
      }
    }
    input.click()
  }, [reset, importHook.setFile, importHook.setParams, importHook.params.media_width_mm, settings.media_width_mm])

  const handleImportAccept = useCallback((enabledColors?: Set<string>) => {
    const paths = importHook.accept(enabledColors)
    if (paths && paths.length > 0) {
      setParsedPaths(paths)
      setSvgContent(null)
      setScale(1.0)
      reset()
    }
    setShowImportPanel(false)
    importHook.reset()
  }, [importHook.accept, importHook.reset, reset])

  const handleImportCancel = useCallback(() => {
    setShowImportPanel(false)
    importHook.reset()
  }, [importHook.reset])

  const handlePreview = useCallback(() => {
    if (!parsedPaths) return
    const scaled = parsedPaths.map(p => p.map(([x, y]) => [x * scale, y * scale] as [number, number]))
    preview({ paths: scaled, settings })
  }, [parsedPaths, settings, scale, preview])

  const handleSend = useCallback(() => {
    if (!parsedPaths) return
    const scaled = parsedPaths.map(p => p.map(([x, y]) => [x * scale, y * scale] as [number, number]))
    send({ paths: scaled, settings })
  }, [parsedPaths, settings, scale, send])

  const handleOffsetChange = useCallback((x: number, y: number) => {
    setSettings(s => ({ ...s, x_offset: Math.round(x * 10) / 10, y_offset: Math.round(y * 10) / 10 }))
  }, [])

  const handleScaleChange = useCallback((s: number) => {
    setScale(Math.max(0.1, Math.min(5.0, Math.round(s * 100) / 100)))
  }, [])

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white">
      <Toolbar
        onOpenFile={handleOpenFile}
        onPreview={handlePreview}
        onSend={handleSend}
        onCancel={cancel}
        jobState={jobState}
        hasDesign={parsedPaths !== null && parsedPaths.length > 0}
        deviceConnected={deviceStatus.connected}
      />

      {svgWarning && (
        <div className="flex items-center gap-2 px-4 py-1 bg-yellow-900/60 text-yellow-300 text-xs border-b border-yellow-700">
          <span className="flex-1">{svgWarning}</span>
          <button
            onClick={() => setSvgWarning(null)}
            className="ml-2 text-yellow-400 hover:text-yellow-200 leading-none"
            aria-label="Meldung schließen"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <Canvas
          svgContent={svgContent}
          previewPaths={previewPaths}
          parsedPaths={parsedPaths}
          scale={scale}
          onScaleChange={handleScaleChange}
          mediaWidthMm={settings.media_width_mm}
          mediaHeightMm={settings.media_height_mm}
          xOffsetMm={settings.x_offset}
          yOffsetMm={settings.y_offset}
          svgNormOffsetX={svgNormOffset.x}
          svgNormOffsetY={svgNormOffset.y}
          onOffsetChange={handleOffsetChange}
        />

        <div className="w-64 flex-shrink-0 flex flex-col gap-2 p-2 bg-gray-900 overflow-y-auto">
          <DeviceStatus
            status={deviceStatus}
            loading={deviceLoading}
            error={deviceError}
            onConnect={connect}
            onDisconnect={disconnect}
          />
          {jobError && (
            <div className="text-red-400 text-xs p-2 rounded bg-gray-800">{jobError}</div>
          )}
          <SettingsPanel
            settings={settings}
            mediaPresets={mediaPresets}
            onChange={setSettings}
          />
          <ScalePanel
            scale={scale}
            originalWidthMm={parsedPaths ? Math.max(...parsedPaths.flatMap(p => p.map(pt => pt[0]))) : 0}
            originalHeightMm={parsedPaths ? Math.max(...parsedPaths.flatMap(p => p.map(pt => pt[1]))) : 0}
            mediaWidthMm={settings.media_width_mm}
            onChange={handleScaleChange}
          />
        </div>
      </div>

      {showImportPanel && importHook.file && (
        <ImportPanel
          file={importHook.file}
          params={importHook.params}
          onParamsChange={importHook.setParams}
          result={importHook.traceResult}
          loading={importHook.traceLoading}
          error={importHook.traceError}
          onAccept={handleImportAccept}
          onCancel={handleImportCancel}
        />
      )}

      {showTeachPanel && (
        <TeachPanel
          state={teachPanelState}
          deviceConnected={deviceStatus.connected}
          jobBusy={jobState === 'previewing' || jobState === 'sending'}
          onClose={() => setShowTeachPanel(false)}
        />
      )}
    </div>
  )
}
