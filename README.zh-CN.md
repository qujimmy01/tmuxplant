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
- 🧰 **轻量 CLI 子页面** — 访问 `/cli` 使用简洁终端（默认本地命令行，可切 SSH）
- 🔐 **登录认证** — 用户名/密码登录，bcrypt 加密存储，Session 保护，暴力破解自动锁定

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

# （首次运行）设置你自己的登录账号和密码
npm run set-password

node server.js
# 浏览器打开 http://localhost:3002 — 将自动跳转到登录页
```

> 若跳过 `set-password`，默认账号为 **admin**，默认密码为 **tmuxplant**，请尽快修改。

### 登录认证

TmuxPlant 对所有页面、API 接口和 WebSocket 连接均启用了基于 Session 的登录保护。

**随时修改账号密码：**

```bash
npm run set-password
# 或
node scripts/set-password.js
```

该交互工具会：
- 提示输入新用户名和密码（输入时以 `*` 掩码显示）
- 要求二次确认密码，防止误输
- 以 bcrypt（cost=12）哈希加密写入 `data/auth.json`，**从不保存明文密码**
- 保留原有 sessionSecret，不会使现有登录状态失效

**配置文件** `data/auth.json`：

```json
{
  "username": "admin",
  "passwordHash": "$2b$12$...",
  "sessionSecret": "<随机64位十六进制字符串>"
}
```

> `data/auth.json` 已加入 `.gitignore`，不会被提交到代码仓库。

**安全特性一览：**

| 特性 | 说明 |
|---|---|
| 密码存储 | bcrypt 哈希（cost=12），从不保存明文 |
| Session Cookie | HttpOnly、SameSite=lax、有效期 8 小时 |
| 暴力破解防护 | 同一 IP 失败 10 次后锁定 15 分钟 |
| 用户枚举防护 | 用户名比对采用常量时间算法，防止时序攻击 |
| Session 固定攻击防护 | 登录成功后自动更换 Session ID |
| WebSocket 保护 | 升级握手时校验 Session Cookie，未登录返回 401 |
| 前端自动跳转 | API 返回 401 时浏览器自动跳转到 `/login` |

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
      ↕  HTTP + WS（携带 Session Cookie）
Node.js 服务端
  ├── express-session（Cookie 会话管理）
  ├── auth.js（登录、bcrypt 校验、频率限制）
  ├── Express（REST API — 需登录）
  ├── ws（WebSocket 服务器 — 握手时校验 Session）
  └── node-pty（PTY 桥接）
      ↕  CLI 调用
tmux
```

### 项目结构

```
tmuxplant/
├── server.js                    # 入口：Express + Session + WebSocket 服务
├── package.json
├── scripts/
│   └── set-password.js          # 交互式修改账号密码工具
├── data/
│   ├── auth.json                # 登录凭据（用户名 + bcrypt hash + session secret）
│   └── ssh-hosts.json           # SSH 主机配置
├── src/
│   ├── auth.js                  # 认证中间件（登录、登出、会话校验）
│   ├── tmux-service.js          # tmux CLI 封装（CRUD 操作）
│   ├── routes.js                # REST API 路由
│   └── terminal-manager.js      # WebSocket ↔ PTY 桥接管理
└── public/
    ├── index.html               # 主页面（侧边栏 + 终端 + 弹窗）
    ├── login.html               # 登录页面
    ├── css/style.css            # 暗色终端主题样式
    ├── css/login.css            # 登录页样式
    └── js/app.js                # 前端逻辑（含 401 跳转 + 退出按钮）
```

### License

MIT
