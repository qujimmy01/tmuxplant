'use strict';

const pty = require('node-pty');
const fs = require('fs');

class TerminalManager {
    constructor() {
        // Map of WebSocket -> { ptyProcess, target }
        this.terminals = new Map();
    }

    /**
     * Create a new PTY process attached to a tmux pane and bind it to a WebSocket
     */
    attach(ws, target, cols = 80, rows = 24, sshOptions = null) {
        // If this ws already has a terminal, clean it up first
        this.detach(ws);

        let ptyProcess;
        let isWaitingForPassword = false;
        let sshPassword = '';
        let outputBuffer = '';

        if (target === 'local') {
            const shell = this.resolveLocalShell();

            try {
                ws.send(JSON.stringify({ type: 'output', data: `\r\n\x1b[36mStarting local shell: ${shell}\x1b[0m\r\n` }));
            } catch (e) { }

            ptyProcess = pty.spawn(shell, [], {
                name: 'xterm-256color',
                cols,
                rows,
                cwd: process.env.HOME || process.cwd(),
                env: { ...process.env, TERM: 'xterm-256color' },
            });
        } else if (target.startsWith('ssh:')) {
            const parts = target.split(':');
            const sshId = parts[1];
            const tmuxTarget = parts.length > 2 ? parts.slice(2).join(':') : '';

            let hostInfo;
            if (sshId === 'direct' && sshOptions && sshOptions.host) {
                hostInfo = {
                    id: 'direct',
                    name: sshOptions.name || sshOptions.host,
                    host: sshOptions.host,
                    user: sshOptions.user || process.env.USER,
                    password: sshOptions.password || '',
                    port: parseInt(sshOptions.port, 10) || 22,
                };
            } else {
                const sshStore = require('./ssh-store');
                hostInfo = sshStore.getHosts().find(h => h.id === sshId);
            }

            if (!hostInfo) {
                try {
                    ws.send(JSON.stringify({ type: 'output', data: '\r\n\x1b[31mError: SSH host not found.\x1b[0m\r\n' }));
                } catch (e) { }
                return null;
            }

            if (hostInfo.password) {
                isWaitingForPassword = true;
                sshPassword = hostInfo.password;
            }

            try {
                ws.send(JSON.stringify({ type: 'output', data: `\r\n\x1b[36mConnecting to ${hostInfo.name} (${hostInfo.user}@${hostInfo.host}:${hostInfo.port})...\x1b[0m\r\n` }));
            } catch (e) { }

            const sshArgs = [
                '-o', 'StrictHostKeyChecking=accept-new',
                '-p', hostInfo.port.toString()
            ];

            if (tmuxTarget) {
                sshArgs.push('-t'); // force pty
            }

            sshArgs.push(`${hostInfo.user}@${hostInfo.host}`);

            if (tmuxTarget) {
                sshArgs.push(`tmux attach-session -t "${tmuxTarget}"`);
            }

            console.log("SPAWNING SSH:", JSON.stringify(sshArgs));

            try {
                ptyProcess = pty.spawn('/usr/bin/ssh', sshArgs, {
                    name: 'xterm-256color',
                    cols,
                    rows,
                    cwd: process.env.HOME || process.cwd(),
                    env: { ...process.env, TERM: 'xterm-256color' },
                });
            } catch (err) {
                console.error("SSH SPAWN ERRORED:", err);
                throw err;
            }
        } else {
            // Extract session name from target (format: "session:window.pane")
            const sessionName = target.split(':')[0];

            // Spawn tmux new-session -t <session>
            ptyProcess = pty.spawn('tmux', ['new-session', '-t', sessionName], {
                name: 'xterm-256color',
                cols,
                rows,
                cwd: process.env.HOME,
                env: { ...process.env, TERM: 'xterm-256color' },
            });
        }

        // Pipe PTY output to WebSocket
        ptyProcess.onData((data) => {
            if (isWaitingForPassword) {
                outputBuffer += data;
                // keep buffer small
                if (outputBuffer.length > 4096) outputBuffer = outputBuffer.slice(-4096);

                const lowerData = outputBuffer.toLowerCase();
                // Match common password prompts
                if (lowerData.includes('password:') || lowerData.includes('密码:')) {
                    ptyProcess.write(sshPassword + '\n');
                    isWaitingForPassword = false;
                    outputBuffer = ''; // clean up
                }
            }

            try {
                if (ws.readyState === 1) { // WebSocket.OPEN
                    ws.send(JSON.stringify({ type: 'output', data }));
                }
            } catch (err) {
                // Ignore send errors
            }
        });

        // Handle PTY exit
        ptyProcess.onExit(({ exitCode }) => {
            try {
                if (ws.readyState === 1) {
                    ws.send(JSON.stringify({ type: 'exit', exitCode }));
                }
            } catch (err) {
                // Ignore
            }
            this.terminals.delete(ws);
        });

        this.terminals.set(ws, { ptyProcess, target });
        return ptyProcess;
    }

    resolveLocalShell() {
        const candidates = [process.env.SHELL, '/bin/zsh', '/bin/bash', '/bin/sh'].filter(Boolean);
        for (const shell of candidates) {
            if (fs.existsSync(shell)) return shell;
        }
        return '/bin/sh';
    }

    /**
     * Handle incoming WebSocket messages
     */
    handleMessage(ws, message) {
        // Support both JSON control messages and raw string input from clients.
        // If message is JSON, handle control actions (attach/resize/input).
        // If message is plain text (non-JSON) and a terminal exists, treat it as raw input.
        let msg = null;
        try {
            msg = JSON.parse(message);
        } catch (err) {
            // Not JSON — will be treated as raw input below if terminal is attached
        }

        // Handle attach messages first (they create the terminal entry)
        if (msg && msg.type === 'attach') {
            try {
                this.attach(ws, msg.target, msg.cols || 80, msg.rows || 24, msg.ssh || null);
            } catch (e) {
                console.error('Attach error:', e && e.message ? e.message : e);
            }
            return;
        }

        const terminal = this.terminals.get(ws);
        if (!terminal) {
            // If there's no terminal and message isn't JSON attach, ignore silently
            return;
        }

        if (msg) {
            // JSON control message
            switch (msg.type) {
                case 'input':
                    try { terminal.ptyProcess.write(msg.data); } catch (e) { }
                    break;

                case 'resize':
                    if (msg.cols && msg.rows) {
                        try { terminal.ptyProcess.resize(msg.cols, msg.rows); } catch (e) { }
                    }
                    break;

                default:
                    break;
            }
        } else {
            // Non-JSON: treat as raw input to the terminal
            try {
                terminal.ptyProcess.write(message);
            } catch (e) {
                // ignore write errors
            }
        }
    }

    /**
     * Detach and clean up a terminal connection
     */
    detach(ws) {
        const terminal = this.terminals.get(ws);
        if (terminal) {
            try {
                terminal.ptyProcess.kill();
            } catch (err) {
                // Ignore kill errors
            }
            this.terminals.delete(ws);
        }
    }

    /**
     * Clean up all terminals
     */
    cleanup() {
        for (const [ws, terminal] of this.terminals) {
            try {
                terminal.ptyProcess.kill();
            } catch (err) {
                // Ignore
            }
        }
        this.terminals.clear();
    }
}

module.exports = new TerminalManager();
