import { ChildProcess, spawn } from 'child_process'
import { join } from 'path'

const BACKEND_PORT = 8765
const STARTUP_TIMEOUT_MS = 15_000

let proc: ChildProcess | null = null

function repoRoot(): string {
  // Compiled output: studio/frontend/out/main → 4 levels up to repo root
  return join(__dirname, '..', '..', '..', '..')
}

export async function startPythonBackend(): Promise<void> {
  const root = repoRoot()

  proc = spawn('python', ['-m', 'studio.backend.main'], {
    cwd: root,
    env: { ...process.env, PYTHONPATH: root },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  proc.stdout?.on('data', (d: Buffer) =>
    console.log('[backend]', d.toString().trim())
  )
  proc.stderr?.on('data', (d: Buffer) =>
    console.error('[backend:err]', d.toString().trim())
  )
  proc.on('exit', code =>
    console.log(`[backend] exited with code ${code}`)
  )

  // Poll until backend responds to /api/health
  const start = Date.now()
  while (Date.now() - start < STARTUP_TIMEOUT_MS) {
    try {
      const res = await fetch(`http://127.0.0.1:${BACKEND_PORT}/api/health`)
      if (res.ok) return
    } catch {
      // not ready yet
    }
    await new Promise(r => setTimeout(r, 300))
  }
  throw new Error(`Python backend did not start within ${STARTUP_TIMEOUT_MS}ms`)
}

export function stopPythonBackend(): void {
  if (proc) {
    proc.kill()
    proc = null
  }
}
