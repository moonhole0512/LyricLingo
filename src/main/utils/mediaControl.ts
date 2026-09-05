import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import readline from 'readline'

export type MediaAction = 'playpause' | 'next' | 'prev'

const actionCodes: Record<MediaAction, number> = {
  playpause: 14,
  next: 11,
  prev: 12
}

export function mediaActionCode(action: MediaAction): number {
  return actionCodes[action]
}

export function mediaWorkerResult(line: string): MediaControlResult {
  return line.trim() === 'OK'
    ? { ok: true, reason: 'sent' }
    : { ok: false, reason: 'no-target' }
}

const workerScript = `
Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Diagnostics;
using System.Runtime.InteropServices;
public class LyricLingoMediaControl {
    [DllImport("user32.dll")]
    public static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
    public delegate bool EnumThreadDelegate(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern bool EnumThreadWindows(int dwThreadId, EnumThreadDelegate lpfn, IntPtr lParam);
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

    public static bool SendMediaCommand(int command) {
        Process[] procs = Process.GetProcessesByName("AppleMusic");
        if (procs.Length == 0) return false;
        bool sent = false;
        foreach (Process p in procs) {
            if (sent) break;
            foreach (ProcessThread t in p.Threads) {
                if (sent) break;
                EnumThreadWindows(t.Id, (hWnd, lParam) => {
                    StringBuilder className = new StringBuilder(256);
                    GetClassName(hWnd, className, 256);
                    if (className.ToString() == "WinUIDesktopWin32WindowClass") {
                        SendMessage(hWnd, 0x0319, hWnd, (IntPtr)(command * 65536));
                        sent = true;
                        return false;
                    }
                    return true;
                }, IntPtr.Zero);
            }
        }
        return sent;
    }
}
"@
Write-Output "READY"
while ($line = [Console]::ReadLine()) {
    if ($line -eq 'exit') { break }
    $ok = [LyricLingoMediaControl]::SendMediaCommand($line)
    if ($ok) { Write-Output "OK" } else { Write-Output "NO_TARGET" }
}
`

export interface MediaControlResult {
  ok: boolean
  reason: 'sent' | 'no-target' | 'timeout' | 'worker-error'
}

export class MediaControlWorker {
  private process: ChildProcessWithoutNullStreams | null = null
  private reader: readline.Interface | null = null
  private readyPromise: Promise<void> | null = null
  private responseWaiter: ((line: string) => void) | null = null
  private queue: Promise<unknown> = Promise.resolve()

  send(action: MediaAction): Promise<MediaControlResult> {
    const task = this.queue.then(() => this.sendNow(action))
    this.queue = task.catch(() => undefined)
    return task
  }

  warmup(): Promise<void> {
    return this.ensureWorker()
  }

  private ensureWorker(): Promise<void> {
    if (this.readyPromise) return this.readyPromise

    this.readyPromise = new Promise((resolve, reject) => {
      const child = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', '-'], {
        windowsHide: true,
        stdio: 'pipe'
      })
      this.process = child
      this.reader = readline.createInterface({ input: child.stdout })
      const timeout = setTimeout(() => reject(new Error('Media control worker timeout')), 15000)

      this.reader.on('line', line => {
        const value = line.trim()
        if (value === 'READY') {
          clearTimeout(timeout)
          resolve()
          return
        }
        this.responseWaiter?.(value)
        this.responseWaiter = null
      })
      child.on('error', error => {
        clearTimeout(timeout)
        this.resetWorker()
        reject(error)
      })
      child.on('exit', () => {
        this.resetWorker()
      })
      child.stdin.write(workerScript + '\n')
    })
    return this.readyPromise
  }

  private async sendNow(action: MediaAction): Promise<MediaControlResult> {
    try {
      await this.ensureWorker()
      if (!this.process) throw new Error('Media control worker is unavailable')
      const response = new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.responseWaiter = null
          reject(new Error('Media control command timeout'))
        }, 5000)
        this.responseWaiter = line => {
          clearTimeout(timeout)
          resolve(line)
        }
      })
      this.process.stdin.write(`${actionCodes[action]}\n`)
      const result = await response
      return mediaWorkerResult(result)
    } catch (error) {
      this.resetWorker()
      return {
        ok: false,
        reason: String(error).includes('timeout') ? 'timeout' : 'worker-error'
      }
    }
  }

  dispose(): void {
    try { this.process?.stdin.write('exit\n') } catch { /* process already closed */ }
    this.reader?.close()
    this.resetWorker()
  }

  private resetWorker(): void {
    this.reader?.close()
    this.reader = null
    this.process = null
    this.readyPromise = null
    this.responseWaiter = null
  }
}
