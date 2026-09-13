# LifeOS

让清醒时的决定，对软弱时的自己保有结构化约束力。

当前是 **MVP**：本机浏览器里记下今天的 MUST，开始/完成可追踪，数据存在这台设备上。不是 Todo List、习惯打卡或番茄钟。

## 现在能做什么

- 写下今日任务，分成 MUST / SHOULD / OPTIONAL
- 记录可支配时间、开始、完成（没点开始则手填实际分钟）
- 刷新页面数据还在（IndexedDB）
- JSON 导出 / 导入
- 可安装成 PWA（需要 https 或 localhost）

还没做：计划锁定、结构化退出、干预引擎、Desire/Goal/Commitment、日终 Review、云同步。

## 本地运行

需要 Node.js 18+。

```bash
npm install
npm run dev
```

浏览器打开终端里给出的本地地址。数据只存在当前浏览器，清站点数据会丢，请用右上角「导出」备份。

生产构建：

```bash
npm run build
npm run preview
```

## 别人怎么用

1. Clone 本仓库后按上面的命令本地跑
2. 或把 `npm run build` 的 `dist/` 部署到任意静态托管（Vercel / GitHub Pages）

每人一份本机数据。同一个网址 + 同一个浏览器配置 = 同一份库。没有账号，也没有多设备同步。

## 技术

React + Vite + TypeScript + Tailwind + Dexie。产品说明见 [docs/PRD.md](docs/PRD.md)。
