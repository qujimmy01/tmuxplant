'use strict';

class CliPage {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.sshHosts = [];
    this.focusMode = false;

    this.terminal = new Terminal({
      fontFamily: "'JetBrains Mono', 'Menlo', monospace",
      fontSize: 14,
      cursorBlink: true,
      cursorStyle: 'bar',
      lineHeight: 1.25,
      theme: {
        background: '#0a0e14',
        foreground: '#e5edf7',
        cursor: '#38bdf8'
      }
    });

    this.fitAddon = new FitAddon.FitAddon();
    this.terminal.loadAddon(this.fitAddon);

    this.init();
  }

  async init() {
    this.cacheDom();
    this.bindEvents();

    this.terminal.open(this.el.terminalHost);
    setTimeout(() => this.fit(), 60);

    await this.loadSshHosts();
    this.connect();
  }

  cacheDom() {
    this.el = {
      mode: document.getElementById('targetMode'),
      savedWrap: document.getElementById('savedSshWrap'),
      savedSelect: document.getElementById('savedSshSelect'),
      directWrap: document.getElementById('directSshWrap'),
      directHost: document.getElementById('directHost'),
      directUser: document.getElementById('directUser'),
      directPassword: document.getElementById('directPassword'),
      directPort: document.getElementById('directPort'),
      connectBtn: document.getElementById('connectBtn'),
      disconnectBtn: document.getElementById('disconnectBtn'),
      clearBtn: document.getElementById('clearBtn'),
      focusBtn: document.getElementById('focusBtn'),
      statusText: document.getElementById('statusText'),
      terminalHost: document.getElementById('terminal')
    };
  }

  bindEvents() {
    this.el.mode.addEventListener('change', () => this.updateModeUI());
    this.el.connectBtn.addEventListener('click', () => this.connect());
    this.el.disconnectBtn.addEventListener('click', () => this.disconnect());
    this.el.clearBtn.addEventListener('click', () => this.terminal.clear());
    this.el.focusBtn.addEventListener('click', () => this.toggleFocusMode());

    this.terminal.onData((data) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'input', data }));
      }
    });

    this.terminal.onResize(({ cols, rows }) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    });

    window.addEventListener('resize', () => this.fit());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.focusMode) {
        this.toggleFocusMode(false);
      }
    });
  }

  fit() {
    try {
      this.fitAddon.fit();
    } catch (e) {
      // Ignore fit errors during early layout.
    }
  }

  updateModeUI() {
    const mode = this.el.mode.value;
    this.el.savedWrap.classList.toggle('hidden', mode !== 'saved-ssh');
    this.el.directWrap.classList.toggle('hidden', mode !== 'direct-ssh');
  }

  async loadSshHosts() {
    try {
      const res = await fetch('/api/ssh');
      const payload = await res.json();
      this.sshHosts = payload.success ? (payload.data || []) : [];
    } catch (err) {
      this.sshHosts = [];
    }

    if (!this.sshHosts.length) {
      this.el.savedSelect.innerHTML = '<option value="">No saved hosts</option>';
      return;
    }

    this.el.savedSelect.innerHTML = this.sshHosts
      .map((h) => `<option value="${this.esc(h.id)}">${this.esc(h.name)} (${this.esc(h.user)}@${this.esc(h.host)})</option>`)
      .join('');
  }

  getAttachPayload() {
    const mode = this.el.mode.value;
    const base = {
      type: 'attach',
      cols: this.terminal.cols,
      rows: this.terminal.rows
    };

    if (mode === 'local') {
      return { ...base, target: 'local', label: 'Local Shell' };
    }

    if (mode === 'saved-ssh') {
      const hostId = this.el.savedSelect.value;
      if (!hostId) throw new Error('Please select a saved SSH host.');
      const host = this.sshHosts.find((h) => h.id === hostId);
      return {
        ...base,
        target: `ssh:${hostId}`,
        label: host ? `${host.user}@${host.host}:${host.port}` : 'Saved SSH'
      };
    }

    const host = this.el.directHost.value.trim();
    const user = this.el.directUser.value.trim() || 'root';
    const password = this.el.directPassword.value;
    const port = parseInt(this.el.directPort.value, 10) || 22;

    if (!host) throw new Error('Host is required for direct SSH.');

    return {
      ...base,
      target: 'ssh:direct',
      ssh: { host, user, password, port, name: host },
      label: `${user}@${host}:${port}`
    };
  }

  connect() {
    let payload;
    try {
      payload = this.getAttachPayload();
    } catch (err) {
      this.writeStatus(err.message);
      return;
    }

    this.disconnect(false);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${protocol}//${window.location.host}/ws/terminal`);

    this.ws.onopen = () => {
      this.connected = true;
      this.ws.send(JSON.stringify(payload));
      this.writeStatus(`Connected: ${payload.label}`);
      this.terminal.focus();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'output') this.terminal.write(msg.data);
        if (msg.type === 'exit') {
          this.terminal.write('\r\n\x1b[33m[Session ended]\x1b[0m\r\n');
        }
      } catch (e) {
        this.terminal.write(event.data);
      }
    };

    this.ws.onerror = () => {
      this.writeStatus('Connection error');
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.writeStatus('Disconnected');
    };
  }

  disconnect(showMessage = true) {
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {
        // Ignore close errors.
      }
      this.ws = null;
    }

    this.connected = false;
    if (showMessage) this.writeStatus('Disconnected');
  }

  writeStatus(text) {
    this.el.statusText.textContent = text;
  }

  toggleFocusMode(forceState) {
    const next = typeof forceState === 'boolean' ? forceState : !this.focusMode;
    this.focusMode = next;
    document.body.classList.toggle('focus-mode', next);
    this.el.focusBtn.textContent = next ? 'Exit Focus' : 'Focus';

    setTimeout(() => {
      this.fit();
      this.terminal.focus();
    }, 50);
  }

  esc(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }
}

new CliPage();
