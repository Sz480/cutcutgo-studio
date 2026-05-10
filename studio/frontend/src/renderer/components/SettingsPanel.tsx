import type { CutSettings, MediaPreset } from '../types'
import { MAT_SIZES } from '../types'

interface Props {
  settings: CutSettings
  mediaPresets: MediaPreset[]
  onChange: (s: CutSettings) => void
}

export function SettingsPanel({ settings, mediaPresets, onChange }: Props) {
  const set = <K extends keyof CutSettings>(key: K, value: CutSettings[K]) =>
    onChange({ ...settings, [key]: value })

  const selectedMatIdx = MAT_SIZES.findIndex(
    m => m.widthMm === settings.media_width_mm && m.heightMm === settings.media_height_mm,
  )
  const isCustomSize = selectedMatIdx < 0

  return (
    <aside className="w-full flex flex-col gap-3 text-sm text-white">
      <h2 className="font-semibold text-base">Cut Settings</h2>

      <label className="flex flex-col gap-1">
        <span>Mattengröße</span>
        <select
          className="bg-gray-700 rounded px-2 py-1"
          value={isCustomSize ? '' : selectedMatIdx}
          onChange={e => {
            if (e.target.value === '') return
            const m = MAT_SIZES[Number(e.target.value)]
            onChange({ ...settings, media_width_mm: m.widthMm, media_height_mm: m.heightMm })
          }}
        >
          {isCustomSize && (
            <option value="" disabled>
              Benutzerdefiniert ({settings.media_width_mm}×{settings.media_height_mm} mm)
            </option>
          )}
          {MAT_SIZES.map((m, i) => (
            <option key={m.label} value={i}>{m.label}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span>Media</span>
        <select
          className="bg-gray-700 rounded px-2 py-1"
          value={settings.media}
          onChange={e => set('media', Number(e.target.value))}
        >
          {mediaPresets.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
          {mediaPresets.length === 0 && <option value={1}>Laser Copy Paper</option>}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span>Tool</span>
        <select
          className="bg-gray-700 rounded px-2 py-1"
          value={settings.tool}
          onChange={e => {
            const tool = e.target.value as 'blade' | 'pen'
            onChange({ ...settings, tool, x_offset: 0, y_offset: 0 })
          }}
        >
          <option value="blade">Blade (right holder)</option>
          <option value="pen">Pen (left holder)</option>
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span>Speed: {settings.speed === 0 ? 'auto' : settings.speed}</span>
        <input
          type="range" min={0} max={10} step={1}
          value={settings.speed}
          onChange={e => set('speed', Number(e.target.value))}
          className="accent-blue-500"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span>Pressure: {settings.pressure === 0 ? 'auto' : settings.pressure}</span>
        <input
          type="range" min={0} max={18} step={0.5}
          value={settings.pressure}
          onChange={e => set('pressure', Number(e.target.value))}
          className="accent-blue-500"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span>Multipass</span>
        <input
          type="number" min={1} max={8}
          value={settings.multipass}
          onChange={e => set('multipass', Number(e.target.value))}
          className="bg-gray-700 rounded px-2 py-1 w-16"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span>Strategy</span>
        <select
          className="bg-gray-700 rounded px-2 py-1"
          value={settings.strategy}
          onChange={e => set('strategy', e.target.value as CutSettings['strategy'])}
        >
          <option value="mintravel">Min Travel</option>
          <option value="mintravelfull">Min Travel Full</option>
          <option value="matfree">Mat Free</option>
          <option value="zorder">Z-Order (as drawn)</option>
        </select>
      </label>

      <div className="flex gap-2">
        <label className="flex flex-col gap-1 flex-1">
          <span>X offset mm</span>
          <input
            type="number" step={0.5}
            value={settings.x_offset}
            onChange={e => set('x_offset', Number(e.target.value))}
            className="bg-gray-700 rounded px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1 flex-1">
          <span>Y offset mm</span>
          <input
            type="number" step={0.5}
            value={settings.y_offset}
            onChange={e => set('y_offset', Number(e.target.value))}
            className="bg-gray-700 rounded px-2 py-1"
          />
        </label>
      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={settings.sw_clipping}
          onChange={e => set('sw_clipping', e.target.checked)}
          className="accent-blue-500"
        />
        Software clipping
      </label>
    </aside>
  )
}
