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
import { DeviceStatus } from './components/DeviceStatus'
import { ImportPanel } from './components/ImportPanel'

export default function App() {
  const [settings, setSettings] = useState<CutSettings>(DEFAULT_SETTINGS)
  const [mediaPresets, setMediaPresets] = useState<MediaPreset[]>([])
  const [svgContent, setSvgContent] = useState<string | null>(null)
  const [parsedPaths, setParsedPaths] = useState<PathList | null>(null)
  const [svgWarning, setSvgWarning] = useState<string | null>(null)
  const [showImportPanel, setShowImportPanel] = useState(false)

  const { status: deviceStatus, loading: deviceLoading, error: deviceError, connect, disconnect } = useDevice()
  const { state: jobState, previewPaths, error: jobError, preview, send, cancel, reset } = useJob()
  const importHook = useImport()

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
        let inkscapeHandledText = false

        if (/<text[\s>]/i.test(text)) {
          const result = await window.electron.ipcRenderer.invoke(
            'svg:flattenText', text,
          ) as { ok: boolean; svg?: string }
          if (result.ok && result.svg) {
            text = result.svg
            inkscapeHandledText = true
          } else {
            setSvgWarning(
              'Hinweis: Text-Elemente wurden übersprungen — zum Schneiden bitte in Inkscape zu Pfaden konvertieren (Pfad → Objekt in Pfad umwandeln).',
            )
          }
        }

        setSvgContent(text)
        const paths = parseSvgToMmPaths(
          text,
          0.05,
          inkscapeHandledText ? undefined : (msg) => setSvgWarning(msg),
        )
        setParsedPaths(paths)
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
    preview({ paths: parsedPaths, settings })
  }, [parsedPaths, settings, preview])

  const handleSend = useCallback(() => {
    if (!parsedPaths) return
    send({ paths: parsedPaths, settings })
  }, [parsedPaths, settings, send])

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
          mediaWidthMm={settings.media_width_mm}
          mediaHeightMm={settings.media_height_mm}
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
    </div>
  )
}
