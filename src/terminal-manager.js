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

        // Extract session name from target (format: "session:window.pane")
        const sessionName = target.split(':')[0];

        // Spawn tmux new-session -t <session> — creates a grouped/linked session
        // that shares windows with the original session without detaching it.
        const ptyProcess = pty.spawn('tmux', ['new-session', '-t', sessionName], {
            name: 'xterm-256color',
            cols,
            rows,
            cwd: process.env.HOME,
            env: {
                ...process.env,
                TERM: 'xterm-256color',
            },
        });

        // Pipe PTY output to WebSocket
        ptyProcess.onData((data) => {
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
