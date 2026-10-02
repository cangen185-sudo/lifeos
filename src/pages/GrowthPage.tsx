import { CalendarDays, Check, Clock3, FileText, RefreshCw } from 'lucide-react'
import { useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { Button, Input, Select } from '../components/ui/primitives'
import { downloadJson, growthRequest, useGrowth } from '../application/growthClient'
import { getLocalFileStatus, subscribeLocalFileStatus } from '../db/localFileSync'
import { shiftDate } from '../domain/clock'
import type { GrowthReport } from '../domain/growth'
import { useLocalDate } from '../hooks/useLocalDate'

export function GrowthPage() {
  const { state, error, busy, action, refresh } = useGrowth()
  const today = useLocalDate()
  const [to, setTo] = useState(() => shiftDate(today, -1))
  const [days, setDays] = useState(7)
  const [selected, setSelected] = useState('')
  const [time, setTime] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const local = useSyncExternalStore(subscribeLocalFileStatus, getLocalFileStatus)
  const report = state?.reports.find(r => r.id === selected) ?? state?.reports[0]
  const ready = state && local.mode === 'file' && local.state === 'saved'
  async function run() {
    await action(async () => {
      const next = await growthRequest<GrowthReport>('/run', { to, days })
      setSelected(next.id)
    })
  }
  const scheduleTime = time ?? state?.schedule.time ?? '21:30'
  return <div className="growth-workspace">
    <header className="growth-header">
      <div><h1>成长复盘</h1><p>从记录中发现下一步。</p></div>
      <div className="growth-toolbar">
        <label><span className="sr-only">结束日期</span><Input type="date" value={to} max={today} onChange={e => setTo(e.target.value)} /></label>
        <label><span className="sr-only">复盘周期</span><Select value={days} onChange={e => setDays(Number(e.target.value))}><option value={1}>一天</option><option value={7}>七天</option><option value={30}>三十天</option></Select></label>
        <Button variant="solid" disabled={!ready || busy} onClick={() => void run()}><RefreshCw size={16} />{busy ? '处理中…' : '生成复盘'}</Button>
      </div>
    </header>
    {error && <p role="alert" className="growth-alert">{error}<button className="ml-3 underline" onClick={() => void action(async () => { await refresh() })}>重试</button></p>}
    {!ready && state && <p className="growth-notice">等待本地文件保存完成后，即可生成复盘。{local.message}</p>}
    <div className="growth-metrics">
      <Metric icon={<CalendarDays />} label="已记录天数" value={report ? `${report.metrics.recordedDays} / ${report.days}` : '—'} />
      <Metric icon={<Check />} label="已确认 MUST" value={report ? `${report.metrics.completedByEnd} / ${report.metrics.confirmedMusts}` : '—'} detail="截至区间末完成 / 确认项数" />
      <Metric icon={<Clock3 />} label="已记录投入" value={report ? `${report.metrics.recordedMinutes} 分钟` : '— 分钟'} />
    </div>
    <div className="growth-grid">
      <section className="growth-panel">
        <div className="growth-section-head"><h2>观察与建议</h2><Link to="/metrics">查看详细统计</Link></div>
        {report ? <>
          <p className="growth-caption">{report.from} — {report.to} · 程序分析 · {report.timeZone}</p>
          <p className="growth-caption">快照保存于 {new Date(report.sourceSavedAt).toLocaleString()} · 生成于 {new Date(report.generatedAt).toLocaleString()}</p>
          {report.findings.length === 0 ? <div className="growth-empty"><FileText /><h3>{report.metrics.recordedDays ? '本期未触发检查规则' : '本期记录不足'}</h3><p>{report.metrics.recordedDays ? '当前规则检查容量、重复延期和日结缺口。' : '先记录行动，程序会基于事实提供建议。'}</p><Link to="/">回到今日</Link></div> :
            report.findings.map(finding => {
              const feedback = state?.feedback.find(f => f.reportId === report.id && f.findingId === finding.id)
              const noteKey = `${report.id}:${finding.id}`
              return <article className="growth-finding" key={finding.id}>
                <h3>{finding.title}</h3><p><strong>事实</strong> {finding.fact}</p><p><strong>建议</strong> {finding.suggestion}</p>
                <details><summary>查看 {finding.evidenceIds.length} 条依据</summary><ul>{finding.evidenceIds.map(id => {
                  const e = report.evidence.find(e => e.id === id)
                  return <li key={id}>{e?.label} {e && (e.kind === 'external' ? <Link to="/connections">查看外部快照</Link> : <Link to={`/review?date=${e.date}`}>查看当日记录</Link>)}</li>
                })}</ul></details>
                <label className="growth-note">反馈或调整说明<Input value={notes[noteKey] ?? feedback?.note ?? ''} maxLength={2000} onChange={e => setNotes(n => ({ ...n, [noteKey]: e.target.value }))} placeholder="可以纠正判断，也可以写下你的调整" /></label>
                <div className="growth-actions">{(['accepted', 'dismissed', 'done'] as const).map((status, index) => <Button key={status} size="sm" disabled={busy} aria-pressed={feedback?.status === status} variant={feedback?.status === status ? 'solid' : 'ghost'} onClick={() => void action(async () => {
                  await growthRequest('/feedback', { revision: state!.revision, reportId: report.id, findingId: finding.id, status, note: notes[noteKey] ?? feedback?.note ?? '' })
                })}>{['采纳', '暂不采纳', '我已实践'][index]}</Button>)}</div>
                {feedback && <p className="growth-caption">反馈已保存 · {new Date(feedback.updatedAt).toLocaleString()} · 仅记录你的选择，不自动修改任务</p>}
              </article>
            })}
          <details className="growth-boundary"><summary>数据范围与计算口径</summary><ul>{report.limitations.map(line => <li key={line}>{line}</li>)}</ul></details>
          <div className="growth-actions"><Button size="sm" onClick={() => void action(async () => { downloadJson(await growthRequest(`/handoff/${report.id}`), `lifeos-agent-handoff-${report.to}.json`) })}>导出 Agent 交接包</Button><Link to="/connections">导入 Agent 解读</Link></div>
          {state?.agentResults.filter(a => a.reportId === report.id).map(a => <section className="growth-finding" key={a.id}><h3>Agent 解读 · {a.author}</h3><p className="growth-caption">外部提交的解读，需你核对；不会自动执行。</p>{a.observations.map((o, i) => <div key={i}><p>{o.text}</p><details><summary>依据</summary>{o.evidenceIds.map(id => <p key={id}>{report.evidence.find(e => e.id === id)?.label}</p>)}</details></div>)}{a.questions.map((q, i) => <p key={i}>待确认：{q}</p>)}</section>)}
        </> : <div className="growth-empty"><FileText /><h3>生成第一份复盘</h3><p>基于已保存的任务、计划与执行记录。</p><Button variant="solid" disabled={!ready || busy} onClick={() => void run()}>生成复盘</Button></div>}
      </section>
      <aside className="growth-panel growth-rail">
        <h2>运行状态</h2>
        <dl><div><dt>程序分析</dt><dd className={state ? 'text-moss' : ''}>{state ? '可用' : '正在连接'}</dd></div><div><dt>Agent 解读</dt><dd>{state?.agentResults.length ? '已有回传' : '等待交接'}</dd></div><div><dt>Notion</dt><dd>{state?.imports.some(i => i.source === 'notion') ? '已导入快照' : '未连接'}</dd></div><div><dt>Google 日历</dt><dd>{state?.imports.some(i => i.source === 'google-calendar') ? '已导入快照' : '未连接'}</dd></div></dl>
        <div className="growth-schedule"><h3>自动复盘</h3><p>每天复盘截至昨日的七天记录。服务运行时执行；重启后补最近一次，不重复生成相同快照。</p><label>运行时间（{state?.timeZone ?? '本机时区'}）<Input type="time" value={scheduleTime} onChange={e => setTime(e.target.value)} /></label>
          <Button className="mt-3 w-full" disabled={!state || busy} variant={state?.schedule.enabled ? 'solid' : 'ghost'} onClick={() => void action(async () => { await growthRequest('/schedule', { revision: state!.revision, enabled: !state!.schedule.enabled, time: scheduleTime }) })}>{state?.schedule.enabled ? '暂停自动复盘' : '启用自动复盘'}</Button>
          {state?.schedule.enabled && time !== null && time !== state.schedule.time && <Button className="mt-2 w-full" disabled={busy} onClick={() => void action(async () => { await growthRequest('/schedule', { revision: state.revision, enabled: true, time: scheduleTime }); setTime(null) })}>保存运行时间</Button>}
          <p className="growth-caption">最近运行：{state?.schedule.lastRunDate ?? '尚未运行'}</p>
          {(state?.schedule.lastError || state?.schedulerError) && <p role="alert" className="growth-alert">{state.schedule.lastError ?? state.schedulerError}</p>}
        </div>
        <Link to="/connections">管理数据连接与交接 →</Link>
      </aside>
    </div>
    <section className="growth-panel growth-history"><div className="growth-section-head"><h2>历史复盘</h2><Button size="sm" disabled={!state || busy} onClick={() => void action(async () => { downloadJson(await growthRequest('/export'), `lifeos-growth-${today}.json`) })}>导出成长记录</Button></div>
      {state?.reports.length ? <ol>{state.reports.map(r => <li key={r.id}><button aria-pressed={r.id === report?.id} onClick={() => setSelected(r.id)}><span>{r.from} — {r.to}</span><span>{r.findings.length} 条建议 · {new Date(r.generatedAt).toLocaleString()}</span></button></li>)}</ol> : <p className="py-10 text-center text-mute">尚无历史记录</p>}
      <p className="growth-caption">成长记录独立保存在本机，侧栏的任务备份不包含本页报告，请使用“导出成长记录”。</p>
    </section>
  </div>
}

function Metric({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail?: string }) {
  return <div className="growth-metric">{icon}<div><p>{label}</p><strong>{value}</strong>{detail && <small>{detail}</small>}</div></div>
}
