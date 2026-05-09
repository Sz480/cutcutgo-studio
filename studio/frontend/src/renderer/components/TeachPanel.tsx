import { useRef, useState } from 'react'
import { STEP_SIZES } from '../hooks/useTeachPanel'
import type { TeachPanelState, StepSize } from '../hooks/useTeachPanel'

interface Props {
  state: TeachPanelState
  deviceConnected: boolean
  jobBusy: boolean
  onClose: () => void
}

export function TeachPanel({ state, deviceConnected, jobBusy, onClose }: Props) {
  const { position, stepMm, busy, setStepMm, jog, home, setTool, resetXY } = state
  const disabled = !deviceConnected || jobBusy || busy

  // Panel drag
  const [panelPos, setPanelPos] = useState({ x: window.innerWidth - 260, y: 80 })
  const dragOrigin = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null)

  const handleTitleDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragOrigin.current = { px: e.clientX, py: e.clientY, ox: panelPos.x, oy: panelPos.y }
  }
  const handleTitleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragOrigin.current) return
    setPanelPos({
      x: dragOrigin.current.ox + e.clientX - dragOrigin.current.px,
      y: dragOrigin.current.oy + e.clientY - dragOrigin.current.py,
    })
  }
  const endDrag = () => { dragOrigin.current = null }

  const toolLabel =
    position.tool_state === 'up' ? '▲ UP'
    : position.tool_state === 'pen' ? '✒ PEN'
    : '🔪 BLD'
  const toolColor =
    position.tool_state === 'up' ? 'text-green-400'
    : position.tool_state === 'pen' ? 'text-purple-400'
    : 'text-red-400'

  return (
    <div
      style={{ position: 'fixed', left: panelPos.x, top: panelPos.y, zIndex: 1000, width: 220 }}
      className="bg-slate-800 border-2 border-blue-500 rounded-xl shadow-2xl text-slate-200 text-xs select-none"
    >
      {/* Title / drag handle */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-slate-900 rounded-t-xl border-b border-slate-700 cursor-grab active:cursor-grabbing"
        onPointerDown={handleTitleDown}
        onPointerMove={handleTitleMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <span className="text-blue-400 font-bold text-sm">⚙ Manual Mode</span>
        <button
          onClick={onClose}
          onPointerDown={e => e.stopPropagation()}
          className="text-slate-500 hover:text-slate-300 px-1 leading-none"
        >✕</button>
      </div>

      <div className="p-3 space-y-3">
        {/* Position display */}
        <div className="flex gap-2">
          {(['X', 'Y'] as const).map((axis) => (
            <div key={axis} className="flex-1 bg-slate-900 border border-slate-700 rounded p-2 text-center">
              <div className="text-slate-500 text-[9px] mb-0.5">{axis}</div>
              <div className="text-sky-400 font-bold text-sm">
                {(axis === 'X' ? position.x_mm : position.y_mm).toFixed(1)}
                <span className="text-slate-500 text-[9px] ml-0.5">mm</span>
              </div>
            </div>
          ))}
          <div className="flex-1 bg-slate-900 border border-slate-700 rounded p-2 text-center">
            <div className="text-slate-500 text-[9px] mb-0.5">Tool</div>
            <div className={`font-bold text-[10px] ${toolColor}`}>{toolLabel}</div>
          </div>
        </div>

        {/* Step size toggles */}
        <div>
          <div className="text-slate-500 text-[9px] uppercase tracking-wider mb-1">Schrittweite (mm)</div>
          <div className="flex gap-1">
            {STEP_SIZES.map((s) => (
              <button
                key={s}
                onClick={() => setStepMm(s as StepSize)}
                className={`flex-1 py-1 rounded text-center transition-colors ${
                  stepMm === s
                    ? 'bg-blue-700 border border-blue-400 text-blue-100 font-bold'
                    : 'bg-slate-900 border border-slate-700 hover:border-slate-500'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* D-Pad */}
        <div className="grid grid-cols-3 gap-1 w-[102px] mx-auto">
          <span />
          <JogBtn label="▲" onClick={() => jog(0, -stepMm)} disabled={disabled} />
          <span />
          <JogBtn label="◀" onClick={() => jog(-stepMm, 0)} disabled={disabled} />
          <button
            onClick={home}
            disabled={disabled}
            className="bg-green-950 border border-green-800 rounded py-1.5 text-center text-green-400 text-sm hover:bg-green-900 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            🏠
          </button>
          <JogBtn label="▶" onClick={() => jog(stepMm, 0)} disabled={disabled} />
          <span />
          <JogBtn label="▼" onClick={() => jog(0, stepMm)} disabled={disabled} />
          <span />
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-1">
          <ActionBtn label="⬆ Tool Up"  onClick={() => setTool('up')}    disabled={disabled} cls="border-blue-900   bg-blue-950   text-blue-300" />
          <ActionBtn label="✒ Pen ↓"    onClick={() => setTool('pen')}   disabled={disabled} cls="border-purple-900 bg-purple-950 text-purple-300" />
          <ActionBtn label="🔪 Blade ↓" onClick={() => setTool('blade')} disabled={disabled} cls="border-red-900    bg-red-950    text-red-300" />
          <ActionBtn label="↺ Reset XY" onClick={resetXY}                disabled={busy}     cls="border-slate-700 bg-slate-900  text-slate-400" />
        </div>

      </div>
    </div>
  )
}

function JogBtn({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="bg-slate-900 border border-blue-800 rounded py-1.5 text-center text-blue-300 text-sm hover:bg-blue-950 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {label}
    </button>
  )
}

function ActionBtn({ label, onClick, disabled, cls }: { label: string; onClick: () => void; disabled: boolean; cls: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`border rounded py-1.5 text-center hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed ${cls}`}
    >
      {label}
    </button>
  )
}
