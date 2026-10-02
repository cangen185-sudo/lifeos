import { useState } from 'react'
import { Link } from 'react-router-dom'
import { growthRequest, useGrowth } from '../application/growthClient'
import { Button } from '../components/ui/primitives'

export function ConnectionsPage() {
  const { state, error, busy, action } = useGrowth()
  const [message, setMessage] = useState('')
  async function importFile(file: File, kind: 'external' | 'agent-results') {
    await action(async () => {
      if (file.size > 2 * 1024 * 1024) throw new Error('交接文件超过 2 MB，请分批处理')
      const body = JSON.parse(await file.text())
      await growthRequest(`/${kind}`, { ...body, revision: state!.revision })
      setMessage(kind === 'external' ? '快照已导入；不会修改外部账户或自动完成任务。' : 'Agent 解读已保存，可回到对应复盘查看。')
    })
  }
  return <div className="growth-workspace">
    <header className="growth-header"><div><h1>连接与交接</h1><p>让任务、时间与复盘使用同一份证据。</p></div><Link to="/analytics">返回成长复盘</Link></header>
    {error && <p role="alert" className="growth-alert">{error}</p>}{message && <p role="status" className="growth-notice">{message}</p>}
    <section className="growth-panel"><h2>数据来源</h2><p className="my-4 text-mute">读取 Notion 和日历内容需要单独授权。安装桌面客户端不会自动建立这里的数据连接。</p>
      <div className="growth-source"><h3>Notion 任务</h3><p>来源数据库、任务状态和截止日期由连接器明确映射。</p><strong>{state?.imports.find(i => i.source === 'notion') ? '已有导入快照 · 未建立自动同步' : '等待账户授权与数据库选择'}</strong></div>
      <div className="growth-source"><h3>Google 日历</h3><p>读取 Notion Calendar 中显示的 Google 行程。全天事项与有时间段的会议分别处理。</p><strong>{state?.imports.find(i => i.source === 'google-calendar') ? '已有导入快照 · 未建立自动同步' : '等待账户授权与日历选择'}</strong></div>
      <p className="growth-caption">Notion 数据库日期不等于 Google 日历事件；导入只更新来源记录，不改变 LifeOS 原有任务。</p>
    </section>
    <div className="growth-grid mt-5">
      <section className="growth-panel"><h2>Agent 交接</h2><p className="my-4 text-mute">先在成长复盘导出证据包，交给实际分析者。回传必须引用包中的证据编号；解读保留作者，所有内容都需你核对。</p>
        <FileButton title="导入 Agent 解读 JSON" disabled={!state || busy} onFile={file => void importFile(file, 'agent-results')} />
        <p className="growth-caption mt-4">本机接口：POST /api/growth/agent-results。仅保存观察和问题，不执行外部指令。</p>
      </section>
      <section className="growth-panel"><h2>外部快照</h2><p className="my-4 text-mute">供已授权的连接器或 Agent 提交规范化任务、日程。格式见项目接口文档；不接受未转换的任意备份文件。</p><FileButton title="导入任务 / 日历 JSON" disabled={!state || busy} onFile={file => void importFile(file, 'external')} />
        <p className="growth-caption mt-4">重复 ID 更新，同一时间戳内容冲突会拒绝。缺失项不自动删除。</p>
      </section>
    </div>
    <section className="growth-panel mt-5"><h2>已导入的任务与行程</h2>
      {state?.imports.map(i => <p className="growth-caption" key={i.source}>{i.source} · 最近导入 {new Date(i.importedAt).toLocaleString()} · {i.count} 项</p>)}
      {state?.conflicts.length ? <p className="growth-alert">发现{state.conflicts.length === 200 ? '至少' : ''} {state.conflicts.length} 组有时间段的日程重叠（最多显示 200 组）。请核对下方事项；系统不会替你改期。</p> : null}
      {state?.externalItems.length ? <ul className="growth-external">{state.externalItems.map(i => <li key={`${i.source}:${i.id}`}><div><strong>{i.title}</strong><p>{i.source} · {i.kind === 'task' ? (i.status === 'completed' ? '来源标记完成' : '待处理') : i.allDay ? '全天事项' : '日程'}</p></div><span>{i.kind === 'task' ? i.dueDate ?? '未设截止日期' : i.allDay ? `${i.start} 至 ${i.end}（结束日不含）` : `${new Date(i.start!).toLocaleString()} — ${new Date(i.end!).toLocaleString()}`}</span></li>)}</ul> : <p className="py-10 text-center text-mute">尚未导入账户数据</p>}
    </section>
  </div>
}

function FileButton({ title, disabled, onFile }: { title: string; disabled: boolean; onFile: (file: File) => void }) {
  const [input, setInput] = useState<HTMLInputElement | null>(null)
  return <><Button disabled={disabled} onClick={() => input?.click()}>{title}</Button><input ref={setInput} type="file" accept="application/json,.json" className="sr-only" aria-label={title} disabled={disabled} onChange={e => { const file = e.target.files?.[0]; if (file) onFile(file); e.target.value = '' }} /></>
}
