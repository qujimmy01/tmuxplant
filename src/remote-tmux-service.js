'use strict';

const { Client } = require('ssh2');
const sshStore = require('./ssh-store');
const fs = require('fs');

class RemoteTmuxService {
    /**
     * Establish SSH connection and run a command, returning stdout
     */
    async exec(sshId, command) {
        return new Promise((resolve, reject) => {
            const hostInfo = sshStore.getHosts().find(h => h.id === sshId);
            if (!hostInfo) {
                return reject(new Error('SSH Host not found'));
            }

            const conn = new Client();

            const connectOptions = {
                host: hostInfo.host,
                port: hostInfo.port || 22,
                username: hostInfo.user || process.env.USER,
                readyTimeout: 15000
            };

            if (hostInfo.password) {
                connectOptions.password = hostInfo.password;
            } else {
                // Try private key auth if no password
                const privateKeyPath = `${process.env.HOME}/.ssh/id_rsa`;
                if (fs.existsSync(privateKeyPath)) {
                    connectOptions.privateKey = fs.readFileSync(privateKeyPath);
                }
            }

            conn.on('ready', () => {
                console.log(`[SSH EXEC] ${hostInfo.name}: ${command}`);
                conn.exec(command, (err, stream) => {
                    if (err) {
                        conn.end();
                        return reject(err);
                    }

                    let output = '';
                    let errorOutput = '';

                    stream.on('close', (code, signal) => {
                        conn.end();
                        console.log(`[SSH DONE] ${hostInfo.name} exit:${code} outputLength:${output.length}`);
                        if (code !== 0) {
                            const errStr = errorOutput || output;
                            if (errStr.includes('no server running') || errStr.includes('no current') || errStr.includes("can't find session")) {
                                return resolve('');
                            }
                            return reject(new Error(`Command failed on ${hostInfo.name}: ${errStr.trim()}`));
                        }
                        resolve(output.trim());
                    }).on('data', (data) => {
                        output += data.toString('utf8');
                    }).stderr.on('data', (data) => {
                        errorOutput += data.toString('utf8');
                    });
                });
            }).on('error', (err) => {
                reject(new Error(`SSH connection to ${hostInfo.name} failed: ${err.message}`));
            }).connect(connectOptions);
        });
    }

    /**
     * Get the full tmux tree from the remote host in a single call to minimize SSH overhead
     */
    async listSessions(sshId) {
        // We get all panes across all sessions/windows in one go
        const raw = await this.exec(sshId, 'tmux list-panes -a -F "#{session_id}||#{session_name}||#{session_attached}||#{window_id}||#{window_index}||#{window_name}||#{window_active}||#{pane_id}||#{pane_index}||#{pane_active}||#{pane_current_command}||#{pane_current_path}"');

        if (!raw) return [];

        const sessionsMap = new Map();

        raw.split('\n').filter(Boolean).forEach(line => {
            const [
                sId, sName, sAttached,
                wId, wIndex, wName, wActive,
                pId, pIndex, pActive, pCommand, pPath
            ] = line.split('||');

            if (!sessionsMap.has(sId)) {
                sessionsMap.set(sId, {
                    id: sId,
                    name: sName,
                    attached: sAttached === '1',
                    windowsMap: new Map()
                });
            }

            const session = sessionsMap.get(sId);

            if (!session.windowsMap.has(wId)) {
                session.windowsMap.set(wId, {
                    id: wId,
                    index: parseInt(wIndex, 10),
                    name: wName,
                    active: wActive === '1',
                    panes: []
                });
            }

            const window = session.windowsMap.get(wId);

            window.panes.push({
                id: pId,
                index: parseInt(pIndex, 10),
                active: pActive === '1',
                currentCommand: pCommand,
                currentPath: pPath
            });
        });

        // Convert Maps to Arrays recursively sorting by index appropriately
        const sessions = Array.from(sessionsMap.values()).map(s => {
            const windows = Array.from(s.windowsMap.values()).sort((a, b) => a.index - b.index);
            windows.forEach(w => w.panes.sort((a, b) => a.index - b.index));

            return {
                id: s.id,
                name: s.name,
                windowCount: windows.length,
                attached: s.attached,
                windows: windows
            };
        }).sort((a, b) => a.name.localeCompare(b.name));

        return sessions;
    }
}

module.exports = new RemoteTmuxService();
