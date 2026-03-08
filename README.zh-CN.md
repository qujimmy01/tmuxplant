<div align="center">

# 🌿 TmuxPlant

**美观的 tmux Web 管理界面**

[![Node.js](https://img.shields.io/badge/Node.js-16+-green.svg)](https://nodejs.org)
[![tmux](https://img.shields.io/badge/tmux-3.x-blue.svg)](https://github.com/tmux/tmux)
[![License](https://img.shields.io/badge/license-MIT-purple.svg)](LICENSE)

[English](README.md)

</div>

---

### 项目简介

TmuxPlant 是一个基于 Web 的 [tmux](https://github.com/tmux/tmux) 管理界面，直接连接本机的 tmux 服务器，在浏览器中提供实时交互式终端和完整的 session、window、pane 管理能力。

### 功能特性

- 🌲 **会话树** — 展开式树形结构，实时显示 session → window → pane 状态
- 💻 **Web 终端** — 基于 [xterm.js](https://xtermjs.org/) + WebSocket + node-pty 的实时交互终端
- ✏️ **完整管理** — 创建/重命名/删除 session 和 window；分割/删除 pane
- 📡 **命令广播** — 同时向多个 pane 发送命令
- 🖱️ **右键菜单** — 对任意树节点右键触发快捷操作
- 📑 **多标签页** — 独立打开多个终端标签
- 🔄 **自动刷新** — 每 5 秒自动同步 tmux 状态
- ↔️ **可调侧边栏** — 拖拽调整侧边栏宽度

### 环境要求

| 依赖 | 版本 |
|---|---|
| Node.js | ≥ 16 |
| tmux | ≥ 3.x |
| build-essential / Xcode CLT | （编译 node-pty 原生模块用） |

### 快速启动

```bash
cd tmuxplant
npm install
node server.js
# 浏览器打开 http://localhost:3001
```

### 使用说明

| 操作 | 方式 |
|---|---|
| 打开终端 | 点击侧边栏树中任意 pane |
| 创建 session | 点击顶部 **New Session** 按钮或右键 |
| 重命名 | 双击 session 或 window 节点 |
| 分割 pane | 右键 window/pane → 水平分割 / 垂直分割 |
| 删除 | 右键 → Kill Session / Window / Pane |
| 广播命令 | 点击顶部 **Broadcast** 按钮 |
| 关闭终端标签 | 点击标签上的 `×` |

### 部署到 Linux

```bash
# 在 macOS/源机器上打包
tar -czf tmuxplant-linux.tar.gz --exclude=node_modules --exclude=.git .

# 在 Linux 服务器上
tar -xzf tmuxplant-linux.tar.gz
npm install    # 自动为 Linux 重新编译 node-pty
node server.js
```

> **Linux 前置依赖：** `apt install nodejs tmux build-essential python3`

### 技术架构

```
浏览器（xterm.js + WebSocket）
      ↕  HTTP + WS
Node.js 服务端
  ├── Express（REST API）
  ├── ws（WebSocket 服务器）
  └── node-pty（PTY 桥接）
      ↕  CLI 调用
tmux
```

### 项目结构

```
tmuxplant/
├── server.js                    # 入口：Express + WebSocket 服务
├── package.json
├── src/
│   ├── tmux-service.js          # tmux CLI 封装（CRUD 操作）
│   ├── routes.js                # REST API 路由
│   └── terminal-manager.js      # WebSocket ↔ PTY 桥接管理
└── public/
    ├── index.html               # 主页面（侧边栏 + 终端 + 弹窗）
    ├── css/style.css            # 暗色终端主题样式
    └── js/app.js                # 前端逻辑
```

### License

MIT
