'use strict';

const fs = require('fs');
const path = require('path');

class SshStore {
    constructor() {
        this.dataPath = path.join(__dirname, '..', 'data', 'ssh-hosts.json');
        this.hosts = [];
        this.init();
    }

    init() {
        try {
            if (!fs.existsSync(path.dirname(this.dataPath))) {
                fs.mkdirSync(path.dirname(this.dataPath), { recursive: true });
            }
            if (fs.existsSync(this.dataPath)) {
                const data = fs.readFileSync(this.dataPath, 'utf8');
                this.hosts = JSON.parse(data);
            } else {
                this.save();
            }
        } catch (err) {
            console.error('Failed to load SSH hosts:', err);
            this.hosts = [];
        }
    }

    save() {
        try {
            fs.writeFileSync(this.dataPath, JSON.stringify(this.hosts, null, 2), 'utf8');
        } catch (err) {
            console.error('Failed to save SSH hosts:', err);
        }
    }

    getHosts() {
        return this.hosts;
    }

    addHost(hostData) {
        const id = Date.now().toString();
        const newHost = {
            id,
            name: hostData.name || hostData.host,
            host: hostData.host,
            user: hostData.user || process.env.USER,
            password: hostData.password || '',
            port: hostData.port || 22,
            created: new Date().toISOString()
        };
        this.hosts.push(newHost);
        this.save();
        return newHost;
    }

    updateHost(id, hostData) {
        const index = this.hosts.findIndex(h => h.id === id);
        if (index === -1) throw new Error('Host not found');

        this.hosts[index] = {
            ...this.hosts[index],
            name: hostData.name || hostData.host || this.hosts[index].name,
            host: hostData.host || this.hosts[index].host,
            user: hostData.user || this.hosts[index].user,
            password: hostData.password !== undefined ? hostData.password : this.hosts[index].password,
            port: hostData.port || this.hosts[index].port
        };
        this.save();
        return this.hosts[index];
    }

    deleteHost(id) {
        const index = this.hosts.findIndex(h => h.id === id);
        if (index === -1) throw new Error('Host not found');
        this.hosts.splice(index, 1);
        this.save();
    }
}

module.exports = new SshStore();
