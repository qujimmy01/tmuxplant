const pty = require('node-pty');
try {
    const ptyProcess = pty.spawn('tmux', ['new-session', '-t', 'test'], {
        name: 'xterm-256color',
        cols: 80,
        rows: 30,
        cwd: process.env.HOME,
        env: process.env
    });
    console.log("TMUX SPAWNED!");
} catch (e) {
    console.error("SPAWN ERROR: ", e);
}
