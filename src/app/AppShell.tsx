import {
  BarChart3,
  Compass,
  Download,
  ScrollText,
  SunMedium,
  Upload,
} from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { downloadBackup, exportBackup, importBackup } from '../db/backup'

const nav = [
  { to: '/', label: '今日', hint: 'Today', icon: SunMedium, end: true },
  { to: '/direction', label: '方向', hint: 'Direction', icon: Compass },
  { to: '/review', label: '复盘', hint: 'Review', icon: ScrollText },
  { to: '/analytics', label: '分析', hint: 'Analytics', icon: BarChart3 },
]

export function AppShell() {
  const location = useLocation()

  function isCurrent(to: string, end?: boolean) {
    if (end) return location.pathname === '/' || location.pathname === ''
    return location.pathname === to || location.pathname.startsWith(`${to}/`)
  }
  async function onExport() {
    const payload = await exportBackup()
    downloadBackup(payload)
  }

  async function onImport(file: File | undefined) {
    if (!file) return
    const confirmed = window.confirm('导入会覆盖当前本机数据，确定继续？')
    if (!confirmed) return
    try {
      await importBackup(await file.text())
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '导入失败')
    }
  }

  return (
    <div className="min-h-svh md:grid md:grid-cols-[15.5rem_minmax(0,1fr)]">
      <aside className="hidden border-r border-line bg-snow md:flex md:flex-col md:px-6 md:py-8">
        <p className="font-mono text-[11px] tracking-[0.28em] text-brass">
          LIFEOS
        </p>
        <p className="mt-3 font-display text-2xl leading-none text-ink">
          值班日志
        </p>
        <p className="mt-3 max-w-[12rem] text-sm leading-6 text-mute">
          清醒时写下的决定，软弱时仍在。
        </p>
        <nav className="mt-10 flex flex-1 flex-col gap-1" aria-label="主导航">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              aria-current={isCurrent(item.to, item.end) ? 'page' : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors duration-200 ${
                isCurrent(item.to, item.end)
                  ? 'bg-ink text-snow'
                  : 'text-mute hover:bg-paper hover:text-ink'
              }`}
            >
              <item.icon className="size-4 shrink-0" aria-hidden />
              <span>{item.label}</span>
              <span className="ml-auto font-mono text-[10px] uppercase tracking-wider opacity-60">
                {item.hint}
              </span>
            </NavLink>
          ))}
        </nav>
        <BackupButtons onExport={onExport} onImport={onImport} />
      </aside>

      <div className="flex min-h-svh flex-col">
        <header className="flex items-center justify-between px-5 pt-6 md:hidden">
          <div>
            <p className="font-mono text-[10px] tracking-[0.28em] text-brass">
              LIFEOS
            </p>
            <p className="font-display text-xl leading-none">值班日志</p>
          </div>
          <BackupButtons onExport={onExport} onImport={onImport} compact />
        </header>

        <main className="mx-auto w-full max-w-2xl flex-1 px-5 pb-28 pt-6 md:px-10 md:pb-12 md:pt-12">
          <Outlet />
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-snow/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        aria-label="底部导航"
      >
        <ul className="grid grid-cols-4">
          {nav.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                aria-current={isCurrent(item.to, item.end) ? 'page' : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] transition-colors duration-200 ${
                  isCurrent(item.to, item.end) ? 'text-ink' : 'text-mute'
                }`}
              >
                <item.icon
                  className={`size-5 ${isCurrent(item.to, item.end) ? 'text-brass' : ''}`}
                  aria-hidden
                />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}

function BackupButtons({
  onExport,
  onImport,
  compact = false,
}: {
  onExport: () => void
  onImport: (file: File | undefined) => void
  compact?: boolean
}) {
  const btn =
    'inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg border border-line bg-snow px-3 text-xs text-ink transition-colors duration-200 hover:border-ink'
  return (
    <div className={`flex gap-2 ${compact ? '' : 'mt-8'}`}>
      <button type="button" className={btn} onClick={() => void onExport()}>
        <Download className="size-3.5" aria-hidden />
        {compact ? <span className="sr-only">导出</span> : '导出'}
      </button>
      <label className={`${btn} cursor-pointer`}>
        <Upload className="size-3.5" aria-hidden />
        {compact ? <span className="sr-only">导入</span> : '导入'}
        <input
          type="file"
          accept="application/json"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0]
            void onImport(file)
            event.target.value = ''
          }}
        />
      </label>
    </div>
  )
}
