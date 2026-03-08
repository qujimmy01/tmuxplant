<div align="center">

# 🌿 TmuxPlant

**A beautiful web-based tmux management interface**

[![Node.js](https://img.shields.io/badge/Node.js-16+-green.svg)](https://nodejs.org)
[![tmux](https://img.shields.io/badge/tmux-3.x-blue.svg)](https://github.com/tmux/tmux)
[![License](https://img.shields.io/badge/license-MIT-purple.svg)](LICENSE)

[中文文档](README.zh-CN.md)

</div>

---

### Introduction

TmuxPlant is a web-based management interface for [tmux](https://github.com/tmux/tmux). It connects to the local tmux server and provides a real-time interactive terminal along with comprehensive session, window, and pane management — all from your browser.

### Features

- 🌲 **Session Tree** — Expandable tree view: sessions → windows → panes with live status
- 💻 **Web Terminal** — Real-time interactive terminal powered by [xterm.js](https://xtermjs.org/) + WebSocket + node-pty
- ✏️ **Full CRUD** — Create, rename, kill sessions and windows; split and kill panes
- 📡 **Command Broadcast** — Send commands to multiple panes simultaneously
- 🖱️ **Context Menu** — Right-click any node for quick actions
- 📑 **Multi-Tab** — Open multiple terminal tabs independently
- 🔄 **Auto Refresh** — Session tree syncs with tmux every 5 seconds
- ↔️ **Resizable Sidebar** — Drag to adjust the sidebar width

### Requirements

| Dependency | Version |
|---|---|
| Node.js | ≥ 16 |
| tmux | ≥ 3.x |
| build-essential / Xcode CLT | (for compiling node-pty) |

### Quick Start

```bash
cd tmuxplant
npm install
node server.js
# Open http://localhost:3001
```

### Usage

| Action | How |
|---|---|
| Open terminal | Click any pane in the sidebar tree |
| Create session | Click **New Session** in the header or right-click |
| Rename | Double-click a session or window node |
| Split pane | Right-click window or pane → Split Horizontal / Vertical |
| Kill | Right-click → Kill Session / Window / Pane |
| Broadcast command | Click **Broadcast** in the header |
| Close tab | Click `×` on the terminal tab |

### Deploy on Linux

```bash
# Package on macOS
tar -czf tmuxplant-linux.tar.gz --exclude=node_modules --exclude=.git .

# On Linux server
tar -xzf tmuxplant-linux.tar.gz
npm install    # recompiles node-pty for Linux
node server.js
```

> **Linux prerequisites:** `apt install nodejs tmux build-essential python3`

### Architecture

```
Browser (xterm.js + WebSocket)
      ↕  HTTP + WS
Node.js Server
  ├── Express (REST API)
  ├── ws (WebSocket server)
  └── node-pty (PTY bridge)
      ↕  CLI
tmux
```

### API Reference

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/sessions` | List all sessions with full tree |
| POST | `/api/sessions` | Create a new session |
| DELETE | `/api/sessions/:name` | Kill a session |
| PUT | `/api/sessions/:name` | Rename a session |
| POST | `/api/sessions/:name/windows` | Create a window |
| DELETE | `/api/sessions/:name/windows/:i` | Kill a window |
| PUT | `/api/sessions/:name/windows/:i` | Rename a window |
| POST | `/api/sessions/:name/windows/:i/split` | Split a pane |
| POST | `/api/broadcast` | Broadcast keys to multiple panes |
| WS | `/ws/terminal` | Real-time terminal WebSocket |

### License

MIT
