'use strict';

const pty = require('node-pty');

class TerminalManager {
    constructor() {
        // Map of WebSocket -> { ptyProcess, target }
        this.terminals = new Map();
    }

    /**
     * Create a new PTY process attached to a tmux pane and bind it to a WebSocket
     */
    attach(ws, target, cols = 80, rows = 24) {
        // If this ws already has a terminal, clean it up first
        this.detach(ws);

        let ptyProcess;
        let isWaitingForPassword = false;
        let sshPassword = '';
        let outputBuffer = '';

        if (target.startsWith('ssh:')) {
            const parts = target.split(':');
            const sshId = parts[1];
            const tmuxTarget = parts.length > 2 ? parts.slice(2).join(':') : '';

            const sshStore = require('./ssh-store');
            const hostInfo = sshStore.getHosts().find(h => h.id === sshId);

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

    /**
     * Handle incoming WebSocket messages
     */
    handleMessage(ws, message) {
        try {
            const msg = JSON.parse(message);

            // 'attach' must be handled BEFORE the terminal guard,
            // because it is the message that CREATES the terminal entry.
            if (msg.type === 'attach') {
                this.attach(ws, msg.target, msg.cols || 80, msg.rows || 24);
                return;
            }

            const terminal = this.terminals.get(ws);
            if (!terminal) return;

            switch (msg.type) {
                case 'input':
                    terminal.ptyProcess.write(msg.data);
                    break;

                case 'resize':
                    if (msg.cols && msg.rows) {
                        terminal.ptyProcess.resize(msg.cols, msg.rows);
                    }
                    break;

                default:
                    break;
            }
        } catch (err) {
            console.error('Terminal message error:', err.message);
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
