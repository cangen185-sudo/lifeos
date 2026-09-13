import {
  BarChart3,
  Compass,
  Download,
  ScrollText,
  SunMedium,
  Upload,
} from 'lucide-react'
import { useCallback, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Dialog } from '../components/ui/Dialog'
import { Button, cx } from '../components/ui/primitives'
import { downloadBackup, exportBackup, importBackup } from '../db/backup'

const nav = [
  { to: '/', label: '今日', hint: 'Today', icon: SunMedium, end: true },
  { to: '/direction', label: '方向', hint: 'Direction', icon: Compass },
  { to: '/review', label: '复盘', hint: 'Review', icon: ScrollText },
  { to: '/analytics', label: '分析', hint: 'Analytics', icon: BarChart3 },
]

type Notice = { title: string; body: string } | null

export function AppShell() {
  const location = useLocation()
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [notice, setNotice] = useState<Notice>(null)

  function isCurrent(to: string, end?: boolean) {
    if (end) return location.pathname === '/' || location.pathname === ''
    return location.pathname === to || location.pathname.startsWith(`${to}/`)
  }

  async function onExport() {
    const payload = await exportBackup()
    downloadBackup(payload)
  }

  const closeImport = useCallback(() => setPendingFile(null), [])
  const closeNotice = useCallback(() => setNotice(null), [])

  async function confirmImport() {
    if (!pendingFile) return
    try {
      await importBackup(await pendingFile.text())
      setPendingFile(null)
      setNotice({ title: '已导入', body: '本机数据已替换为备份文件中的内容。' })
    } catch (error) {
      setPendingFile(null)
      setNotice({
        title: '导入失败',
        body: error instanceof Error ? error.message : '文件无法识别。',
      })
    }
  }

  return (
    <div className="min-h-svh md:grid md:grid-cols-[13.5rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="hidden border-r border-line md:sticky md:top-0 md:flex md:h-svh md:flex-col md:px-6 md:py-8">
        <Wordmark />
        <nav className="mt-12 flex flex-1 flex-col gap-0.5" aria-label="主导航">
          {nav.map((item, index) => {
            const active = isCurrent(item.to, item.end)
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                aria-current={active ? 'page' : undefined}
                style={{ ['--i' as string]: index }}
                className={cx(
                  'group rise relative flex min-h-11 items-center gap-3 rounded-md pl-4 pr-2 text-[15px] transition-colors duration-200',
                  active ? 'text-ink' : 'text-mute hover:text-ink',
                )}
              >
                <span
                  aria-hidden
                  className={cx(
                    'absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full transition-[background-color,height] duration-300',
                    active ? 'bg-copper' : 'bg-transparent group-hover:bg-line-strong',
                  )}
                />
                <item.icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
                <span className={active ? 'font-medium' : ''}>{item.label}</span>
                <span className="ml-auto font-mono text-[10px] tracking-[0.18em] text-faint">
                  {item.hint}
                </span>
              </NavLink>
            )
          })}
        </nav>
        <div className="mt-8 border-t border-line pt-5">
          <BackupButtons onExport={onExport} onPick={setPendingFile} />
          <p className="mt-4 font-mono text-[10px] tracking-[0.18em] text-faint">
            本机数据 · V0.1
          </p>
        </div>
      </aside>

      <div className="flex min-h-svh flex-col">
        <header className="flex items-center justify-between px-5 pb-2 pt-[max(env(safe-area-inset-top),1.25rem)] md:hidden">
          <Wordmark compact />
          <BackupButtons onExport={onExport} onPick={setPendingFile} compact />
        </header>

        <main className="mx-auto w-full max-w-[72rem] flex-1 px-5 pb-32 pt-4 md:px-10 md:pb-16 md:pt-12 xl:px-14">
          <Outlet />
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bone/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
        aria-label="底部导航"
      >
        <ul className="grid grid-cols-4">
          {nav.map((item) => {
            const active = isCurrent(item.to, item.end)
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'relative flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] transition-colors duration-200',
                    active ? 'text-ink' : 'text-mute',
                  )}
                >
                  <span
                    aria-hidden
                    className={cx(
                      'absolute top-0 h-0.5 w-8 rounded-full transition-colors duration-300',
                      active ? 'bg-copper' : 'bg-transparent',
                    )}
                  />
                  <item.icon className="size-5" strokeWidth={active ? 2 : 1.6} aria-hidden />
                  {item.label}
                </NavLink>
              </li>
            )
          })}
        </ul>
      </nav>

      <Dialog
        open={pendingFile !== null}
        onClose={closeImport}
        kicker="Import"
        title="用备份覆盖本机数据？"
        mode="center"
      >
        <p className="text-sm leading-7 text-mute">
          将导入 <span className="font-mono text-ink">{pendingFile?.name}</span>
          。这台设备上的现有任务、方向与记录会被替换，且无法撤销。建议先导出一份当前数据。
        </p>
        <div className="mt-6 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={closeImport}>
            取消
          </Button>
          <Button variant="solid" className="flex-1" onClick={() => void confirmImport()}>
            覆盖并导入
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={notice !== null}
        onClose={closeNotice}
        title={notice?.title ?? ''}
        mode="center"
      >
        <p className="text-sm leading-7 text-mute">{notice?.body}</p>
        <div className="mt-6">
          <Button variant="solid" className="w-full" onClick={closeNotice}>
            知道了
          </Button>
        </div>
      </Dialog>
    </div>
  )
}

function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div>
      <p
        className={cx(
          'font-display leading-none tracking-tight text-ink',
          compact ? 'text-[1.35rem]' : 'text-[1.9rem]',
        )}
      >
        Life<span className="text-copper">OS</span>
      </p>
      {!compact && (
        <>
          <p className="mt-2.5 font-mono text-[10px] tracking-[0.26em] text-faint">
            PERSONAL EXECUTION SYSTEM
          </p>
          <p className="mt-5 max-w-[12rem] text-[13px] leading-6 text-mute">
            清醒时写下的决定，
            <br />
            软弱时仍然作数。
          </p>
        </>
      )}
    </div>
  )
}

function BackupButtons({
  onExport,
  onPick,
  compact = false,
}: {
  onExport: () => void
  onPick: (file: File) => void
  compact?: boolean
}) {
  const cls = compact
    ? 'grid size-10 place-items-center rounded-md text-mute transition-colors hover:bg-paper hover:text-ink'
    : 'inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md border border-line text-[13px] text-mute transition-colors duration-200 hover:border-ink hover:text-ink'
  return (
    <div className={cx('flex', compact ? 'gap-1' : 'gap-2')}>
      <button type="button" className={cls} onClick={() => void onExport()} title="导出 JSON">
        <Download className="size-4" strokeWidth={1.75} aria-hidden />
        {compact ? <span className="sr-only">导出</span> : '导出'}
      </button>
      <label className={cx(cls, 'cursor-pointer')} title="导入 JSON">
        <Upload className="size-4" strokeWidth={1.75} aria-hidden />
        {compact ? <span className="sr-only">导入</span> : '导入'}
        <input
          type="file"
          accept="application/json"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) onPick(file)
            event.target.value = ''
          }}
        />
      </label>
    </div>
  )
}
