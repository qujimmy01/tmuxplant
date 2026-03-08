const pty = require('node-pty');
try {
    const ptyProcess = pty.spawn('sh', ['-c', 'ssh -o StrictHostKeyChecking=accept-new root@192.168.2.202'], {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: process.env.HOME,
        env: process.env
    });
    ptyProcess.onData((data) => {
        console.log("DATA RECEIVED: ", JSON.stringify(data));
        if (data.toLowerCase().includes('password:')) {
            ptyProcess.write('shiyu314\n');
        }
    });
} catch (e) {
    console.error("SPAWN ERROR: ", e);
}
