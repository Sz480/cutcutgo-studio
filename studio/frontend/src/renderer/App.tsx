import { useState, useCallback, useEffect } from 'react'
import { DEFAULT_SETTINGS } from './types'
import type { CutSettings, PathList, MediaPreset } from './types'
import { api } from './api/client'
import { parseSvgToMmPaths } from './svg/parser'
import { useDevice } from './hooks/useDevice'
import { useJob } from './hooks/useJob'
import { Toolbar } from './components/Toolbar'
import { Canvas } from './components/Canvas'
import { SettingsPanel } from './components/SettingsPanel'
import { DeviceStatus } from './components/DeviceStatus'

export default function App() {
  const [settings, setSettings] = useState<CutSettings>(DEFAULT_SETTINGS)
  const [mediaPresets, setMediaPresets] = useState<MediaPreset[]>([])
  const [svgContent, setSvgContent] = useState<string | null>(null)
  const [parsedPaths, setParsedPaths] = useState<PathList | null>(null)

  const { status: deviceStatus, loading: deviceLoading, error: deviceError, connect, disconnect } = useDevice()
  const { state: jobState, previewPaths, error: jobError, preview, send, cancel, reset } = useJob()

  useEffect(() => {
    api.listMedia().then(setMediaPresets).catch(() => {})
  }, [])

  const handleOpenFile = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.svg'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      const text = await file.text()
      setSvgContent(text)
      const paths = parseSvgToMmPaths(text)
      setParsedPaths(paths)
      reset()
    }
    input.click()
  }, [reset])

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
    </div>
  )
}
