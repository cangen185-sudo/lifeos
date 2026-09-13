import { NavLink, Outlet } from 'react-router-dom'
import { downloadBackup, exportBackup, importBackup } from '../db/backup'

const nav = [
  { to: '/', label: 'Today', end: true },
  { to: '/direction', label: 'Direction' },
  { to: '/review', label: 'Review' },
  { to: '/analytics', label: 'Analytics' },
]

export function AppShell() {
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
    <div className="mx-auto flex min-h-svh max-w-xl flex-col px-4 pb-24 pt-6 md:max-w-3xl md:pb-8 md:pt-8">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] tracking-[0.18em] text-stone-500 uppercase">
            LifeOS
          </p>
          <h1 className="mt-1 text-xl font-medium tracking-tight">
            个人执行系统
          </h1>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            className="rounded-md border border-stone-300 bg-white px-2.5 py-1 text-stone-700"
            onClick={() => void onExport()}
          >
            导出
          </button>
          <label className="rounded-md border border-stone-300 bg-white px-2.5 py-1 text-stone-700">
            导入
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                void onImport(file)
                event.target.value = ''
              }}
            />
          </label>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-stone-200 bg-[#f4f1ea]/95 backdrop-blur md:static md:mt-10 md:border-0 md:bg-transparent md:backdrop-blur-none">
        <ul className="mx-auto flex max-w-xl justify-around py-2 text-sm md:max-w-3xl md:justify-start md:gap-6 md:px-0">
          {nav.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `px-2 py-1 ${isActive ? 'text-stone-900' : 'text-stone-500'}`
                }
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
