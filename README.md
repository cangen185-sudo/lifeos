# LifeOS

让清醒时的决定，对软弱时的自己保有结构化约束力。

这是单人、本地的执行闭环：用户写下欲望与今日行动，目标和承诺按需要补充。Windows 日常入口使用固定的专用浏览器配置，并自动将记录保存到本机 JSON 文件。

## 现在能做什么

- **方向**：欲望可以是结果或感受；目标和承诺都可独立记录，日期、关联、判断方式可选。到期且有关联未完成 MUST 的承诺只标 at-risk，结案由你手动确认
- **今日**：MUST / SHOULD / OPTIONAL；任务可由用户明确关联多个欲望并更正。确认计划保存 MUST 快照；新增、降级、延期、缩小、拆分或取消按规则记录原因与事件。过往未结案任务和未来待办均可查看。
- **事实提示**：打开或聚焦应用时，根据现有记录提示一项未完成 MUST、用户填写的欲望和可核实的计划冲突，同一事实去重。
- **复盘**：未完成 MUST 选择原因和去向，再显式日结；重复日结幂等，原因与去向更正留痕。
- **分析**：近七日已确认 MUST 的分子/分母、计划与实际分钟、最终未完成原因，以及多欲望关联行动。实际时间按唯一闭合计时记录计算。
- Windows 固定入口：专用浏览器配置中的 IndexedDB + 自动本地 JSON 文件；仍可手动导出 / 导入

明确不做：云同步、系统 Push、LLM、账号、Project、任务依赖、图页面。

## 日常打开与保存位置（Windows）

首次使用先在项目目录运行一次 `npm ci`，之后双击项目根目录的 `Open-LifeOS.cmd`。它会构建当前代码、启动只监听 `127.0.0.1` 的本地服务，并用固定的浏览器配置打开 LifeOS。需要 Node.js 及 Chrome 或 Edge。保持项目文件夹在本机；再次双击同一个入口即可打开已有记录。

- 主数据文件：`%LOCALAPPDATA%\LifeOS\data\lifeos-backup.json`
- 上一份自动保存文件：`%LOCALAPPDATA%\LifeOS\data\lifeos-backup.previous.json`
- 专用浏览器配置：`%LOCALAPPDATA%\LifeOS\BrowserProfile`

页面侧栏会显示“本地文件已保存”或具体错误。保存使用本机文件和浏览器 IndexedDB；即使浏览器站点数据意外清空，再从这个入口打开也会从主数据文件恢复。删除这两个位置、磁盘故障或保存报错时无法保证恢复，重要记录仍建议定期用侧栏“导出”另存一份。不要将上述文件加入 Git。

## 开发运行

需要满足 `package.json` 中 Vite 8 的 Node.js 版本要求；本地验收使用 Node.js 24。

```bash
npm ci
npm run dev
```

浏览器打开终端里给出的地址。`npm run dev` 是开发入口，数据只在该网址对应的浏览器 IndexedDB 中；日常持久使用请双击 `Open-LifeOS.cmd`。

生产构建：

```bash
npm run build
npm run preview
```

## 别人怎么用

1. Clone 本仓库后按上面的命令本地跑
2. 本轮交接验收完成前，只在本机运行、测试和保存；不要上传仓库或部署。

每人一份本机数据。没有账号，也没有多设备同步。

## 技术

React + Vite + TypeScript + Tailwind + Dexie。产品说明见 [docs/PRD.md](docs/PRD.md)，已拍板边界见 [docs/V0.1-decisions.md](docs/V0.1-decisions.md)。

备份导出格式为 V5，支持导入 V1–V5。旧备份会先校验并在事务中替换；损坏备份不会清除现有数据。日常入口自动保存 V5 文件，手动导出的 JSON 可作为另一份独立备份。
