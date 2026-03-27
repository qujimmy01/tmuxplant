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
- 🧰 **Lightweight CLI Page** — Open `/cli` for a minimal terminal (local shell by default, optional SSH)
- 🔐 **Login Authentication** — Username/password login with bcrypt hashing, session protection, and brute-force lockout

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

# (First run) Set your own login credentials
npm run set-password

node server.js
# Open http://localhost:3002 — you will be redirected to the login page
```

> Default credentials (if `set-password` is skipped): **admin** / **tmuxplant**

### Authentication

TmuxPlant protects all pages, API endpoints, and WebSocket connections with a session-based login system.

**Change credentials at any time:**

```bash
npm run set-password
# or
node scripts/set-password.js
```

This interactive tool:
- Prompts for a new username and password (input is masked)
- Requires password confirmation
- Stores a bcrypt hash (cost=12) in `data/auth.json` — **never plain text**
- Restores the same session secret so existing sessions are not interrupted

**Configuration file** `data/auth.json`:

```json
{
  "username": "admin",
  "passwordHash": "$2b$12$...",
  "sessionSecret": "<random 64-char hex>"
}
```

> `data/auth.json` is listed in `.gitignore` and will not be committed to version control.

**Security features:**

| Feature | Detail |
|---|---|
| Password storage | bcrypt hash (cost=12), never plain text |
| Session cookie | HttpOnly, SameSite=lax, 8-hour expiry |
| Brute-force protection | IP locked out for 15 min after 10 failed attempts |
| User enumeration prevention | Constant-time username comparison |
| Session fixation prevention | Session ID regenerated on successful login |
| WebSocket protection | Upgrade handshake validates session cookie |
| Auto redirect | 401 responses redirect browser to `/login` automatically |

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
      ↕  HTTP + WS (session cookie)
Node.js Server
  ├── express-session (cookie-based auth)
  ├── auth.js (login, bcrypt, rate-limiting)
  ├── Express (REST API — requires auth)
  ├── ws (WebSocket server — verifyClient checks session)
  └── node-pty (PTY bridge)
      ↕  CLI
tmux
```

### API Reference

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/login` | — | Login page |
| POST | `/auth/login` | — | Submit credentials, start session |
| POST | `/auth/logout` | ✅ | Destroy session |
| GET | `/auth/status` | — | Check session status |
| GET | `/api/sessions` | ✅ | List all sessions with full tree |
| POST | `/api/sessions` | ✅ | Create a new session |
| DELETE | `/api/sessions/:name` | ✅ | Kill a session |
| PUT | `/api/sessions/:name` | ✅ | Rename a session |
| POST | `/api/sessions/:name/windows` | ✅ | Create a window |
| DELETE | `/api/sessions/:name/windows/:i` | ✅ | Kill a window |
| PUT | `/api/sessions/:name/windows/:i` | ✅ | Rename a window |
| POST | `/api/sessions/:name/windows/:i/split` | ✅ | Split a pane |
| POST | `/api/broadcast` | ✅ | Broadcast keys to multiple panes |
| WS | `/ws/terminal` | ✅ | Real-time terminal WebSocket |

### License

MIT
