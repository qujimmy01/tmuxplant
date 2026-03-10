/* ============================================================
   TmuxPlant — Main Application Logic
   ============================================================ */

'use strict';

class TmuxPlantApp {
    constructor() {
        this.sessions = [];
        this.sshHosts = [];
        this.terminals = new Map(); // tabId -> { terminal, fitAddon, ws, target }
        this.activeTabId = null;
        this.expandedNodes = new Set();
        this.refreshInterval = null;
        this.selectedTarget = null;
        this.filterActiveOnly = false;

        this.init();
    }

    async init() {
        this.bindEvents();
        await Promise.all([this.refreshSessions(), this.refreshSshHosts()]);
        this.startAutoRefresh();
    }

    // ============================================================
    // API helpers
    // ============================================================

    async api(method, path, body) {
        try {
            const opts = {
                method,
                headers: { 'Content-Type': 'application/json' },
            };
            if (body) opts.body = JSON.stringify(body);
            const res = await fetch(`/api${path}`, opts);
            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'API error');
            return data;
        } catch (err) {
            this.toast(err.message, 'error');
            throw err;
        }
    }

    // ============================================================
    // Session Tree
    // ============================================================

    async refreshSessions() {
        try {
            const { data } = await this.api('GET', '/sessions');
            this.sessions = data || [];
            this.renderSessionTree();
            document.getElementById('sessionCount').textContent = this.getVisibleSessions().length;
        } catch (err) {
            // Silently fail on refresh
        }
    }

    getVisibleSessions() {
        if (!this.filterActiveOnly) return this.sessions;
        return this.sessions.filter((session) => session.attached);
    }

    toggleNode(key) {
        if (this.expandedNodes.has(key)) {
            this.expandedNodes.delete(key);
        } else {
            this.expandedNodes.add(key);
        }
        this.renderSessionTree();
    }

    groupSessions(sessions) {
        if (!sessions || sessions.length === 0) return [];

        const groups = new Map();
        const processed = new Set();

        // Logic: find sessions with common hyphen-delimited prefixes
        sessions.forEach(s => {
            const lastHyphen = s.name.lastIndexOf('-');
            if (lastHyphen > 0) {
                const prefix = s.name.substring(0, lastHyphen);
                if (!groups.has(prefix)) groups.set(prefix, []);
                groups.get(prefix).push(s);
            }
        });

        const finalTree = [];

        // Only group if prefix itself exists or there are multiple siblings
        groups.forEach((members, prefix) => {
            const prefixAsSession = sessions.find(s => s.name === prefix);
            if (members.length > 1 || prefixAsSession) {
                const groupMembers = members.filter(m => m.name !== prefix);
                if (prefixAsSession) groupMembers.push(prefixAsSession);

                const sortedMembers = groupMembers.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

                finalTree.push({
                    type: 'group',
                    name: prefix,
                    sessions: sortedMembers
                });
                groupMembers.forEach(m => processed.add(m.name));
            }
        });

        // Add sessions that weren't grouped
        sessions.forEach(s => {
            if (!processed.has(s.name)) {
                finalTree.push({ type: 'session', ...s });
            }
        });

        return finalTree.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    }

    renderSessionTree() {
        const container = document.getElementById('sessionTree');
                const visibleSessions = this.getVisibleSessions();

                if (visibleSessions.length === 0) {
            container.innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity="0.3">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <line x1="3" y1="9" x2="21" y2="9"/>
            <line x1="9" y1="21" x2="9" y2="9"/>
          </svg>
                    <p>${this.filterActiveOnly ? 'No active sessions found' : 'No tmux sessions found'}</p>
          <button class="btn-small" onclick="app.showNewSessionModal()">Create Session</button>
        </div>
      `;
            return;
        }

                const treeData = this.groupSessions(visibleSessions);
        let html = '';

        const renderSingleSession = (session) => {
            const sessionKey = `s:${session.name}`;
            const isExpanded = this.expandedNodes.has(sessionKey);
            const attachedBadge = session.attached
                ? '<span class="tree-badge attached">attached</span>'
                : '';

            let sHtml = `
                <div class="tree-item" data-type="session" data-name="${this.esc(session.name)}">
                    <div class="tree-item-header session-header ${this.selectedTarget === session.name ? 'active' : ''}"
                         onclick="app.toggleNode('${sessionKey}')"
                         oncontextmenu="app.showContextMenu(event, 'session', '${this.esc(session.name)}')"
                         ondblclick="app.showRenameModal('session', '${this.esc(session.name)}')">
                        <span class="tree-toggle ${isExpanded ? 'expanded' : ''}">
                             <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5l8 7-8 7z"/></svg>
                        </span>
                        <span class="tree-icon session-icon">⬢</span>
                        <span class="tree-label">${this.esc(session.name)}</span>
                        ${attachedBadge}
                    </div>
                    <div class="tree-children ${isExpanded ? '' : 'collapsed'}" style="max-height: ${isExpanded ? '2000px' : '0'}">
            `;
            if (session.windows) {
                for (const win of session.windows) {
                    const winKey = `w:${session.name}:${win.index}`;
                    const isWinExpanded = this.expandedNodes.has(winKey);
                    const hasSinglePane = win.panes && win.panes.length === 1;
                    const firstPane = hasSinglePane ? win.panes[0] : null;
                    const paneLabel = hasSinglePane ? `<span class="tree-pane-inline">${this.esc(firstPane.currentCommand)}</span>` : '';
                    const tabId = hasSinglePane ? `tab-${session.name}-${win.index}-${firstPane.index}` : null;

                    sHtml += `
                        <div class="tree-item ${hasSinglePane ? 'single-pane' : ''}" data-type="window" data-session="${this.esc(session.name)}" data-index="${win.index}">
                            <div class="tree-item-header window-header ${hasSinglePane && this.activeTabId === tabId ? 'active' : ''}"
                                 onclick="${hasSinglePane ? `app.openTerminal('${this.esc(session.name)}', ${win.index}, ${firstPane.index}, '${this.esc(win.name)}')` : `app.toggleNode('${winKey}')`}"
                                 oncontextmenu="app.showContextMenu(event, 'window', '${this.esc(session.name)}', ${win.index})"
                                 ondblclick="app.showRenameModal('window', '${this.esc(session.name)}', ${win.index}, '${this.esc(win.name)}')">
                                <span class="tree-toggle ${isWinExpanded && !hasSinglePane ? 'expanded' : ''}" style="${hasSinglePane ? 'visibility:hidden' : ''}">
                                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5l8 7-8 7z"/></svg>
                                </span>
                                <span class="tree-icon window-icon">◆</span>
                                <span class="tree-label">${win.index}:${this.esc(win.name)} ${paneLabel}</span>
                                ${win.active ? '<span class="tree-badge attached">active</span>' : ''}
                            </div>
                    `;

                    if (!hasSinglePane && win.panes) {
                        sHtml += `<div class="tree-children ${isWinExpanded ? '' : 'collapsed'}" style="max-height: ${isWinExpanded ? '2000px' : '0'}">`;
                        for (const pane of win.panes) {
                            const pTarget = `${session.name}:${win.index}.${pane.index}`;
                            const pTabId = `tab-${session.name}-${win.index}-${pane.index}`;

                            sHtml += `
                                <div class="tree-item" data-type="pane" data-target="${pTarget}">
                                    <div class="tree-item-header pane-header ${this.activeTabId === pTabId ? 'active' : ''}"
                                         onclick="app.openTerminal('${this.esc(session.name)}', ${win.index}, ${pane.index}, '${this.esc(win.name)}')">
                                        <span class="tree-icon pane-icon">▸</span>
                                        <span class="tree-label">${pane.id} ${this.esc(pane.currentCommand)}</span>
                                    </div>
                                </div>
                            `;
                        }
                        sHtml += `</div>`;
                    }
                    sHtml += `</div>`;
                }
            }
            sHtml += `</div></div>`;
            return sHtml;
        };

        for (const item of treeData) {
            if (item.type === 'group') {
                const groupKey = `g:${item.name}`;
                const isExpanded = this.expandedNodes.has(groupKey);
                html += `
                    <div class="tree-item group-item">
                        <div class="tree-item-header session-header" onclick="app.toggleNode('${groupKey}')">
                            <span class="tree-toggle ${isExpanded ? 'expanded' : ''}">
                                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5l8 7-8 7z"/></svg>
                            </span>
                            <span class="tree-icon" style="color:var(--accent-yellow)">📂</span>
                            <span class="tree-label" style="opacity:0.8">${this.esc(item.name)}</span>
                            <span class="tree-badge">${item.sessions.length}</span>
                        </div>
                        <div class="tree-children ${isExpanded ? '' : 'collapsed'}" style="max-height: ${isExpanded ? '4000px' : '0'}">
                `;
                item.sessions.forEach(s => {
                    html += renderSingleSession(s);
                });
                html += `</div></div>`;
            } else {
                html += renderSingleSession(item);
            }
        }

        container.innerHTML = html;
    }

    // ============================================================
    // SSH Hosts
    // ============================================================

    async refreshSshHosts() {
        try {
            const { data } = await this.api('GET', '/ssh');
            this.sshHosts = data || [];
            this.renderSshTree();
        } catch (err) {
            // Silently fail on refresh
        }
    }

    async loadRemoteTmux(hostId) {
        const host = this.sshHosts.find(h => h.id === hostId);
        if (!host) return;

        host.loadingRemote = true;
        this.renderSshTree();

        try {
            const { data } = await this.api('GET', `/ssh/${hostId}/sessions`);
            host.remoteSessions = data;
        } catch (err) {
            this.toast(`Failed to load tmux from ${host.name}`, 'error');
            host.remoteSessions = [];
        } finally {
            host.loadingRemote = false;
            this.expandedNodes.add(`ssh-host:${hostId}`);
            this.renderSshTree();
        }
    }

    toggleSshNode(key, hostId) {
        if (this.expandedNodes.has(key)) {
            this.expandedNodes.delete(key);
        } else {
            if (hostId && !this.expandedNodes.has(key)) {
                const host = this.sshHosts.find(h => h.id === hostId);
                if (host && host.remoteSessions === undefined && !host.loadingRemote) {
                    this.loadRemoteTmux(hostId);
                    return; // loadRemoteTmux will manually expand after loading
                }
            }
            this.expandedNodes.add(key);
        }
        this.renderSshTree();
    }

    renderSshTree() {
        const container = document.getElementById('sshTree');
        if (this.sshHosts.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="padding: 1rem 0; text-align: left; opacity: 0.5; font-size: 0.8rem; margin-left:10px;">
                    No SSH hosts saved
                </div>`;
            return;
        }

        let html = '';
        for (const host of this.sshHosts) {
            const target = `ssh:${host.id}`;
            const tabId = `tab-ssh-${host.id}`;
            const hostKey = `ssh-host:${host.id}`;
            const isExpanded = this.expandedNodes.has(hostKey);
            const isLoading = host.loadingRemote;

            html += `
                <div class="tree-item" data-type="ssh" data-target="${target}">
                    <div class="tree-item-header session-header ${this.activeTabId === tabId ? 'active' : ''}"
                         oncontextmenu="app.showContextMenu(event, 'ssh', '${host.id}')">
                        <span class="tree-toggle ${isExpanded && !isLoading ? 'expanded' : ''}" onclick="app.toggleSshNode('${hostKey}', '${host.id}')">
                            ${isLoading
                    ? '<span style="font-size:10px">⏳</span>'
                    : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5l8 7-8 7z"/></svg>'
                }
                        </span>
                        <div class="tree-label-group" onclick="app.openTerminal('SSH', 0, '${host.id}', '${this.esc(host.name)}', true)" style="display:flex;align-items:center;flex:1;gap:6px; cursor:pointer;">
                            <span class="tree-icon pane-icon" style="font-size:14px">☁</span>
                            <span class="tree-label" style="font-weight:600">${this.esc(host.name)}</span>
                            <span style="font-size: 10px; opacity: 0.5; margin-left: auto;">${this.esc(host.user)}@${this.esc(host.host)}</span>
                        </div>
                    </div>
            `;

            if (isExpanded && host.remoteSessions) {
                html += `<div class="tree-children">`;
                if (host.remoteSessions.length === 0) {
                    html += `<div style="padding: 6px 16px; font-size: 11px; opacity: 0.5;">No tmux sessions running.</div>`;
                }

                const remoteTree = this.groupSessions(host.remoteSessions);

                const renderSingleRemoteSession = (session) => {
                    const sessionKey = `ssh-s:${host.id}:${session.name}`;
                    const isSessionExpanded = this.expandedNodes.has(sessionKey);
                    let sHtml = `
                        <div class="tree-item">
                            <div class="tree-item-header session-header" onclick="app.toggleSshNode('${sessionKey}')">
                                <span class="tree-toggle ${isSessionExpanded ? 'expanded' : ''}">
                                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5l8 7-8 7z"/></svg>
                                </span>
                                <span class="tree-icon session-icon">⬢</span>
                                <span class="tree-label">${this.esc(session.name)}</span>
                            </div>
                            <div class="tree-children ${isSessionExpanded ? '' : 'collapsed'}" style="max-height: ${isSessionExpanded ? '2000px' : '0'}">
                    `;
                    if (session.windows) {
                        for (const win of session.windows) {
                            const winKey = `ssh-w:${host.id}:${session.name}:${win.index}`;
                            const isWinExpanded = this.expandedNodes.has(winKey);

                            const hasSinglePane = win.panes && win.panes.length === 1;
                            const firstPane = hasSinglePane ? win.panes[0] : null;
                            const paneLabel = hasSinglePane ? `<span class="tree-pane-inline">${this.esc(firstPane.currentCommand)}</span>` : '';
                            const rTabId = hasSinglePane ? `tab-remote-${host.id}-${session.name}-${win.index}-${firstPane.index}` : null;

                            sHtml += `
                                <div class="tree-item ${hasSinglePane ? 'single-pane' : ''}">
                                    <div class="tree-item-header window-header ${hasSinglePane && this.activeTabId === rTabId ? 'active' : ''}" 
                                         onclick="${hasSinglePane ? `app.openTerminal('${this.esc(session.name)}', ${win.index}, ${firstPane.index}, '${this.esc(win.name)}', false, '${host.id}')` : `app.toggleSshNode('${winKey}')`}">
                                        <span class="tree-toggle ${isWinExpanded && !hasSinglePane ? 'expanded' : ''}" style="${hasSinglePane ? 'visibility:hidden' : ''}">
                                            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5l8 7-8 7z"/></svg>
                                        </span>
                                        <span class="tree-icon window-icon">◆</span>
                                        <span class="tree-label">${win.index}:${this.esc(win.name)} ${paneLabel}</span>
                                        ${win.active ? '<span class="tree-badge attached">active</span>' : ''}
                                    </div>
                            `;

                            if (!hasSinglePane && win.panes) {
                                sHtml += `<div class="tree-children ${isWinExpanded ? '' : 'collapsed'}" style="max-height: ${isWinExpanded ? '2000px' : '0'}">`;
                                for (const pane of win.panes) {
                                    const prTabId = `tab-remote-${host.id}-${session.name}-${win.index}-${pane.index}`;
                                    sHtml += `
                                        <div class="tree-item">
                                            <div class="tree-item-header pane-header ${this.activeTabId === prTabId ? 'active' : ''}" 
                                                 onclick="app.openTerminal('${this.esc(session.name)}', ${win.index}, ${pane.index}, '${this.esc(win.name)}', false, '${host.id}')">
                                                <span class="tree-icon pane-icon">▸</span>
                                                <span class="tree-label">${pane.id} ${this.esc(pane.currentCommand)}</span>
                                            </div>
                                        </div>
                                    `;
                                }
                                sHtml += `</div>`;
                            }
                            sHtml += `</div>`;
                        }
                    }
                    sHtml += `</div></div>`;
                    return sHtml;
                };

                for (const item of remoteTree) {
                    if (item.type === 'group') {
                        const groupKey = `ssh-g:${host.id}:${item.name}`;
                        const isExpanded = this.expandedNodes.has(groupKey);
                        html += `
                            <div class="tree-item group-item">
                                <div class="tree-item-header session-header" onclick="app.toggleSshNode('${groupKey}')">
                                    <span class="tree-toggle ${isExpanded ? 'expanded' : ''}">
                                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5l8 7-8 7z"/></svg>
                                    </span>
                                    <span class="tree-icon">📂</span>
                                    <span class="tree-label" style="opacity:0.8">${this.esc(item.name)}</span>
                                    <span class="tree-badge">${item.sessions.length}</span>
                                </div>
                                <div class="tree-children ${isExpanded ? '' : 'collapsed'}" style="max-height: ${isExpanded ? '4000px' : '0'}">
                        `;
                        item.sessions.forEach(s => {
                            html += renderSingleRemoteSession(s);
                        });
                        html += `</div></div>`;
                    } else {
                        html += renderSingleRemoteSession(item);
                    }
                }
                html += `</div>`;
            }
            html += `</div>`;
        }
        container.innerHTML = html;
    }

    showAddSshModal() {
        this.showModal('Add SSH Host', `
            <div class="form-group"><label class="form-label">Name (alias)</label><input class="form-input" id="sshName" placeholder="e.g. Prod DB"></div>
            <div class="form-group"><label class="form-label">Host/IP</label><input class="form-input" id="sshHost" placeholder="e.g. 192.168.1.100" autofocus></div>
            <div class="form-group"><label class="form-label">User</label><input class="form-input" id="sshUser" placeholder="e.g. root"></div>
            <div class="form-group"><label class="form-label">Password</label><input class="form-input" id="sshPassword" type="password" placeholder="(Optional) auto-login password"></div>
            <div class="form-group"><label class="form-label">Port</label><input class="form-input" id="sshPort" placeholder="22" value="22" type="number"></div>
        `, async () => {
            const name = document.getElementById('sshName').value.trim();
            const host = document.getElementById('sshHost').value.trim();
            const user = document.getElementById('sshUser').value.trim();
            const password = document.getElementById('sshPassword').value;
            const port = parseInt(document.getElementById('sshPort').value, 10);

            if (!host) { this.toast('Host/IP is required', 'error'); throw new Error(); }

            await this.api('POST', '/ssh', { name, host, user, password, port });
            this.toast('SSH Host added', 'success');
            await this.refreshSshHosts();
        });
        setTimeout(() => document.getElementById('sshHost').focus(), 100);
    }

    async deleteSshHost(id) {
        if (!confirm('Remove this SSH host?')) return;
        const tabId = `tab-ssh-${id}`;
        if (this.terminals.has(tabId)) this.closeTab(tabId);

        await this.api('DELETE', `/ssh/${id}`);
        this.toast('SSH Host removed', 'success');
        await this.refreshSshHosts();
    }

    // ============================================================
    // Terminal Management
    // ============================================================

    openTerminal(session, windowIndex, paneIndex, windowName, isSsh = false, remoteHostId = null) {
        let target, tabId;
        if (remoteHostId) {
            target = `ssh:${remoteHostId}:${session}:${windowIndex}.${paneIndex}`;
            tabId = `tab-remote-${remoteHostId}-${session}-${windowIndex}-${paneIndex}`;
        } else if (isSsh) {
            target = `ssh:${paneIndex}`;
            tabId = `tab-ssh-${paneIndex}`;
        } else {
            target = `${session}:${windowIndex}.${paneIndex}`;
            tabId = `tab-${session}-${windowIndex}-${paneIndex}`;
        }

        // If tab already exists, just activate it
        if (this.terminals.has(tabId)) {
            this.activateTab(tabId);
            return;
        }

        // Show terminal UI
        document.getElementById('welcomeScreen').style.display = 'none';
        document.getElementById('terminalTabs').style.display = 'flex';
        document.getElementById('terminalContainer').style.display = 'block';
        document.getElementById('statusBar').style.display = 'flex';

        // Create tab
        const tabsEl = document.getElementById('terminalTabs');
        const tab = document.createElement('button');
        tab.className = 'terminal-tab';
        tab.id = tabId;

        let tabLabel = '';
        if (remoteHostId) {
            tabLabel = `☁ ${session}:${windowIndex}.${paneIndex}`;
        } else if (isSsh) {
            tabLabel = `SSH: ${windowName}`;
        } else {
            tabLabel = `${session}:${windowIndex}.${paneIndex}`;
        }

        tab.innerHTML = `
      <span>${tabLabel}</span>
      <span class="tab-close" onclick="event.stopPropagation(); app.closeTab('${tabId}')">&times;</span>
    `;
        tab.onclick = () => this.activateTab(tabId);
        tabsEl.appendChild(tab);

        // Create terminal wrapper
        const container = document.getElementById('terminalContainer');
        const wrapper = document.createElement('div');
        wrapper.className = 'terminal-wrapper';
        wrapper.id = `terminal-${tabId}`;
        container.appendChild(wrapper);

        // Create xterm.js terminal
        const terminal = new Terminal({
            fontFamily: "'JetBrains Mono', 'Menlo', 'Monaco', monospace",
            fontSize: 14,
            lineHeight: 1.3,
            cursorBlink: true,
            cursorStyle: 'bar',
            theme: {
                background: '#0a0e14',
                foreground: '#e6edf3',
                cursor: '#22d3ee',
                cursorAccent: '#0a0e14',
                selectionBackground: 'rgba(34, 211, 238, 0.2)',
                selectionForeground: '#e6edf3',
                black: '#0a0e14',
                red: '#f87171',
                green: '#34d399',
                yellow: '#fbbf24',
                blue: '#60a5fa',
                magenta: '#a78bfa',
                cyan: '#22d3ee',
                white: '#e6edf3',
                brightBlack: '#545d68',
                brightRed: '#fca5a5',
                brightGreen: '#6ee7b7',
                brightYellow: '#fde68a',
                brightBlue: '#93c5fd',
                brightMagenta: '#c4b5fd',
                brightCyan: '#67e8f9',
                brightWhite: '#f8fafc',
            },
            allowTransparency: true,
        });

        const fitAddon = new FitAddon.FitAddon();
        terminal.loadAddon(fitAddon);

        try {
            const webLinksAddon = new WebLinksAddon.WebLinksAddon();
            terminal.loadAddon(webLinksAddon);
        } catch (e) {
            // Web links addon is optional
        }

        terminal.open(wrapper);

        // Wait for the terminal to render before fitting
        setTimeout(() => {
            try { fitAddon.fit(); } catch (e) { }
        }, 100);

        // Create WebSocket connection
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${wsProtocol}//${window.location.host}/ws/terminal`);

        ws.onopen = () => {
            // Send attach command with terminal size
            ws.send(JSON.stringify({
                type: 'attach',
                target: target,
                cols: terminal.cols,
                rows: terminal.rows,
            }));

            this.updateConnectionStatus(true);
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'output') {
                    terminal.write(msg.data);
                } else if (msg.type === 'exit') {
                    terminal.write('\r\n\x1b[33m[Session ended]\x1b[0m\r\n');
                }
            } catch (e) {
                // Raw data fallback
                terminal.write(event.data);
            }
        };

        ws.onclose = () => {
            terminal.write('\r\n\x1b[31m[Connection closed]\x1b[0m\r\n');
        };

        ws.onerror = () => {
            this.toast('Terminal connection error', 'error');
        };

        // Terminal input → WebSocket
        terminal.onData((data) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'input', data }));
            }
        });

        // Handle resize
        terminal.onResize(({ cols, rows }) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'resize', cols, rows }));
            }
        });

        // Store terminal info
        this.terminals.set(tabId, {
            terminal,
            fitAddon,
            ws,
            target,
            session,
            windowIndex,
            paneIndex,
            windowName,
            isSsh,
            remoteHostId
        });

        this.activateTab(tabId);

        // Expand session tree nodes
        if (!remoteHostId && !isSsh) {
            this.expandedNodes.add(`s:${session}`);
            this.expandedNodes.add(`w:${session}:${windowIndex}`);
            this.renderSessionTree();
        }
    }

    activateTab(tabId) {
        // Deactivate current
        if (this.activeTabId) {
            const prevTab = document.getElementById(this.activeTabId);
            if (prevTab) prevTab.classList.remove('active');
            const prevWrapper = document.getElementById(`terminal-${this.activeTabId}`);
            if (prevWrapper) prevWrapper.classList.remove('active');
        }

        // Activate new
        this.activeTabId = tabId;
        const tab = document.getElementById(tabId);
        if (tab) tab.classList.add('active');
        const wrapper = document.getElementById(`terminal-${tabId}`);
        if (wrapper) wrapper.classList.add('active');

        // Focus and fit terminal
        const termInfo = this.terminals.get(tabId);
        if (termInfo) {
            setTimeout(() => {
                try { termInfo.fitAddon.fit(); } catch (e) { }
                termInfo.terminal.focus();
            }, 50);

            // Update status bar
            if (termInfo.remoteHostId) {
                document.getElementById('statusSession').textContent = `☁ ${termInfo.session}`;
                document.getElementById('statusWindow').textContent = `◆ ${termInfo.windowIndex}:${termInfo.windowName || ''}`;
                document.getElementById('statusPane').textContent = `▸ pane ${termInfo.paneIndex}`;
            } else if (termInfo.isSsh) {
                document.getElementById('statusSession').textContent = `☁ ${termInfo.windowName}`;
                document.getElementById('statusWindow').textContent = `SSH Connection`;
                document.getElementById('statusPane').textContent = '';
            } else {
                document.getElementById('statusSession').textContent = `⬢ ${termInfo.session}`;
                document.getElementById('statusWindow').textContent = `◆ ${termInfo.windowIndex}:${termInfo.windowName || ''}`;
                document.getElementById('statusPane').textContent = `▸ pane ${termInfo.paneIndex}`;
            }
            document.getElementById('statusSize').textContent = `${termInfo.terminal.cols}×${termInfo.terminal.rows}`;

            this.selectedTarget = termInfo.session;
        }

        this.renderSessionTree();
        this.renderSshTree();
    }

    closeTab(tabId) {
        const termInfo = this.terminals.get(tabId);
        if (termInfo) {
            termInfo.ws.close();
            termInfo.terminal.dispose();
            this.terminals.delete(tabId);
        }

        // Remove DOM elements
        const tab = document.getElementById(tabId);
        if (tab) tab.remove();
        const wrapper = document.getElementById(`terminal-${tabId}`);
        if (wrapper) wrapper.remove();

        // If this was the active tab, switch to another
        if (this.activeTabId === tabId) {
            this.activeTabId = null;
            const remaining = Array.from(this.terminals.keys());
            if (remaining.length > 0) {
                this.activateTab(remaining[remaining.length - 1]);
            } else {
                // No more terminals, show welcome
                document.getElementById('welcomeScreen').style.display = 'flex';
                document.getElementById('terminalTabs').style.display = 'none';
                document.getElementById('terminalContainer').style.display = 'none';
                document.getElementById('statusBar').style.display = 'none';
            }
        }
    }

    // ============================================================
    // Session Operations
    // ============================================================

    showNewSessionModal() {
        this.showModal('New Session', `
      <div class="form-group">
        <label class="form-label">Session Name (optional)</label>
        <input class="form-input" id="newSessionName" placeholder="e.g. dev, server, build" autofocus>
      </div>
    `, async () => {
            const name = document.getElementById('newSessionName').value.trim();
            await this.api('POST', '/sessions', { name: name || undefined });
            this.toast('Session created', 'success');
            await this.refreshSessions();
        });

        setTimeout(() => {
            const input = document.getElementById('newSessionName');
            if (input) input.focus();
        }, 100);
    }

    async killSession(name) {
        if (!confirm(`Kill session "${name}" ? All windows and panes will be destroyed.`)) return;

        // Close any open tabs for this session
        for (const [tabId, info] of this.terminals) {
            if (info.session === name) {
                this.closeTab(tabId);
            }
        }

        await this.api('DELETE', `/sessions/${encodeURIComponent(name)}`);
        this.toast(`Session "${name}" killed`, 'success');
        await this.refreshSessions();
    }

    showRenameModal(type, name, index, currentName) {
        const title = type === 'session' ? `Rename Session "${name}"` : `Rename Window "${currentName || index}"`;
        const defaultValue = type === 'session' ? name : (currentName || '');

        this.showModal(title, `
      <div class="form-group">
        <label class="form-label">New Name</label>
        <input class="form-input" id="renameInput" value="${this.esc(defaultValue)}" autofocus>
      </div>
    `, async () => {
            const newName = document.getElementById('renameInput').value.trim();
            if (!newName) return;

            if (type === 'session') {
                await this.api('PUT', `/sessions/${encodeURIComponent(name)}`, { newName });
                this.toast(`Session renamed to "${newName}"`, 'success');
            } else {
                await this.api('PUT', `/sessions/${encodeURIComponent(name)}/windows/${index}`, { newName });
                this.toast(`Window renamed to "${newName}"`, 'success');
            }
            await this.refreshSessions();
        });

        setTimeout(() => {
            const input = document.getElementById('renameInput');
            if (input) { input.focus(); input.select(); }
        }, 100);
    }

    // ============================================================
    // Window Operations
    // ============================================================

    showNewWindowModal(sessionName) {
        this.showModal(`New Window in "${sessionName}"`, `
      <div class="form-group">
        <label class="form-label">Window Name (optional)</label>
        <input class="form-input" id="newWindowName" placeholder="e.g. editor, logs, server" autofocus>
      </div>
    `, async () => {
            const name = document.getElementById('newWindowName').value.trim();
            await this.api('POST', `/sessions/${encodeURIComponent(sessionName)}/windows`, {
                windowName: name || undefined,
            });
            this.toast('Window created', 'success');
            await this.refreshSessions();
        });
    }

    async killWindow(session, index) {
        // Close affected tabs
        for (const [tabId, info] of this.terminals) {
            if (info.session === session && info.windowIndex === index) {
                this.closeTab(tabId);
            }
        }

        await this.api('DELETE', `/sessions/${encodeURIComponent(session)}/windows/${index}`);
        this.toast('Window killed', 'success');
        await this.refreshSessions();
    }

    // ============================================================
    // Pane Operations
    // ============================================================

    async splitPane(session, windowIndex, paneIndex, direction) {
        await this.api('POST', `/sessions/${encodeURIComponent(session)}/windows/${windowIndex}/split`, {
            paneIndex,
            direction,
        });
        this.toast(`Pane split ${direction}`, 'success');
        await this.refreshSessions();
    }

    async killPane(session, windowIndex, paneIndex) {
        const tabId = `tab-${session}-${windowIndex}-${paneIndex}`;
        if (this.terminals.has(tabId)) {
            this.closeTab(tabId);
        }

        await this.api('DELETE', `/sessions/${encodeURIComponent(session)}/windows/${windowIndex}/panes/${paneIndex}`);
        this.toast('Pane killed', 'success');
        await this.refreshSessions();
    }

    // ============================================================
    // Broadcast
    // ============================================================

    showBroadcastModal() {
        let checkboxes = '';
        for (const session of this.sessions) {
            for (const win of session.windows || []) {
                for (const pane of win.panes || []) {
                    const target = `${session.name}:${win.index}.${pane.index}`;
                    checkboxes += `
            <label style="display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer;font-size:13px;">
              <input type="checkbox" class="broadcast-target" value="${target}" checked>
              <span style="color:var(--accent-cyan)">${target}</span>
              <span style="color:var(--text-muted);font-size:11px;">(${pane.currentCommand})</span>
            </label>
          `;
                }
            }
        }

        this.showModal('Broadcast Command', `
      <div class="form-group">
        <label class="form-label">Command</label>
        <input class="form-input" id="broadcastCommand" placeholder="e.g. ls -la" autofocus>
      </div>
      <div class="form-group">
        <label class="form-label">Target Panes</label>
        <div style="max-height:200px;overflow-y:auto;padding:8px;background:var(--bg-primary);border-radius:6px;border:1px solid var(--border-primary);">
          ${checkboxes || '<span style="color:var(--text-muted)">No panes available</span>'}
        </div>
      </div>
    `, async () => {
            const command = document.getElementById('broadcastCommand').value;
            if (!command) return;

            const targets = Array.from(document.querySelectorAll('.broadcast-target:checked'))
                .map(cb => cb.value);

            if (targets.length === 0) {
                this.toast('No targets selected', 'warning');
                return;
            }

            await this.api('POST', '/broadcast', { targets, keys: command });
            this.toast(`Command sent to ${targets.length} pane(s)`, 'success');
        });
    }

    // ============================================================
    // Context Menu
    // ============================================================

    showContextMenu(event, type, session, windowIndex, paneIndex) {
        event.preventDefault();
        event.stopPropagation();

        const menu = document.getElementById('contextMenu');
        let items = '';

        if (type === 'session') {
            items = `
        <button class="context-menu-item" onclick="app.showNewWindowModal('${this.esc(session)}')">
          <span class="context-menu-icon">+</span> New Window
        </button>
        <button class="context-menu-item" onclick="app.showRenameModal('session', '${this.esc(session)}')">
          <span class="context-menu-icon">✎</span> Rename Session
        </button>
        <div class="context-menu-divider"></div>
        <button class="context-menu-item danger" onclick="app.killSession('${this.esc(session)}')">
          <span class="context-menu-icon">✕</span> Kill Session
        </button>
      `;
        } else if (type === 'window') {
            items = `
        <button class="context-menu-item" onclick="app.splitPane('${this.esc(session)}', ${windowIndex}, 0, 'horizontal')">
          <span class="context-menu-icon">⬌</span> Split Horizontal
        </button>
        <button class="context-menu-item" onclick="app.splitPane('${this.esc(session)}', ${windowIndex}, 0, 'vertical')">
          <span class="context-menu-icon">⬍</span> Split Vertical
        </button>
        <button class="context-menu-item" onclick="app.showRenameModal('window', '${this.esc(session)}', ${windowIndex})">
          <span class="context-menu-icon">✎</span> Rename Window
        </button>
        <div class="context-menu-divider"></div>
        <button class="context-menu-item danger" onclick="app.killWindow('${this.esc(session)}', ${windowIndex})">
          <span class="context-menu-icon">✕</span> Kill Window
        </button>
      `;
        } else if (type === 'pane') {
            items = `
        <button class="context-menu-item" onclick="app.openTerminal('${this.esc(session)}', ${windowIndex}, ${paneIndex}, '')">
          <span class="context-menu-icon">▸</span> Open Terminal
        </button>
        <button class="context-menu-item" onclick="app.splitPane('${this.esc(session)}', ${windowIndex}, ${paneIndex}, 'horizontal')">
          <span class="context-menu-icon">⬌</span> Split Horizontal
        </button>
        <button class="context-menu-item" onclick="app.splitPane('${this.esc(session)}', ${windowIndex}, ${paneIndex}, 'vertical')">
          <span class="context-menu-icon">⬍</span> Split Vertical
        </button>
        <div class="context-menu-divider"></div>
        <button class="context-menu-item danger" onclick="app.killPane('${this.esc(session)}', ${windowIndex}, ${paneIndex})">
          <span class="context-menu-icon">✕</span> Kill Pane
        </button>
      `;
        } else if (type === 'ssh') {
            const sshId = session; // overloaded arg
            items = `
                <button class="context-menu-item" onclick="app.openTerminal('SSH', 0, '${sshId}', '', true)">
                  <span class="context-menu-icon">☁</span> Open Terminal
                </button>
                <div class="context-menu-divider"></div>
                <button class="context-menu-item danger" onclick="app.deleteSshHost('${sshId}')">
                  <span class="context-menu-icon">✕</span> Delete Host
                </button>
            `;
        }

        menu.innerHTML = items;
        menu.style.left = `${event.clientX}px`;
        menu.style.top = `${event.clientY}px`;
        menu.classList.add('visible');

        // Close on next click
        const closeHandler = () => {
            menu.classList.remove('visible');
            document.removeEventListener('click', closeHandler);
        };
        setTimeout(() => document.addEventListener('click', closeHandler), 0);
    }

    // ============================================================
    // Modal
    // ============================================================

    showModal(title, bodyHtml, onConfirm) {
        const overlay = document.getElementById('modalOverlay');
        document.getElementById('modalTitle').textContent = title;
        document.getElementById('modalBody').innerHTML = bodyHtml;

        overlay.classList.add('visible');

        // Bind confirm
        const confirmBtn = document.getElementById('modalConfirm');
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
        newConfirmBtn.id = 'modalConfirm';
        newConfirmBtn.onclick = async () => {
            try {
                await onConfirm();
                this.hideModal();
            } catch (err) {
                // Error already toasted by API
            }
        };

        // Handle Enter key
        const handleKeydown = (e) => {
            if (e.key === 'Enter') {
                newConfirmBtn.click();
            } else if (e.key === 'Escape') {
                this.hideModal();
            }
        };
        overlay.addEventListener('keydown', handleKeydown);
        overlay._keydownHandler = handleKeydown;
    }

    hideModal() {
        const overlay = document.getElementById('modalOverlay');
        overlay.classList.remove('visible');
        if (overlay._keydownHandler) {
            overlay.removeEventListener('keydown', overlay._keydownHandler);
        }
    }

    // ============================================================
    // Toast Notifications
    // ============================================================

    toast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const icons = {
            success: '✓',
            error: '✕',
            info: 'ℹ',
            warning: '⚠',
        };

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
      <span class="toast-icon">${icons[type] || 'ℹ'}</span>
      <span>${this.esc(message)}</span>
    `;

        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('fadeOut');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // ============================================================
    // Events
    // ============================================================

    bindEvents() {
        // Header buttons
        document.getElementById('btnNewSession').onclick = () => this.showNewSessionModal();
        document.getElementById('btnBroadcast').onclick = () => this.showBroadcastModal();
        document.getElementById('btnRefresh').onclick = () => {
            this.refreshSessions();
            this.toast('Sessions refreshed', 'info');
        };

        const activeOnlyCheckbox = document.getElementById('filterActiveOnly');
        if (activeOnlyCheckbox) {
            activeOnlyCheckbox.checked = this.filterActiveOnly;
            activeOnlyCheckbox.onchange = () => {
                this.filterActiveOnly = activeOnlyCheckbox.checked;
                this.renderSessionTree();
                document.getElementById('sessionCount').textContent = this.getVisibleSessions().length;
            };
        }

        // Modal close
        document.getElementById('modalClose').onclick = () => this.hideModal();
        document.getElementById('modalCancel').onclick = () => this.hideModal();
        document.getElementById('modalOverlay').onclick = (e) => {
            if (e.target === document.getElementById('modalOverlay')) this.hideModal();
        };

        // Window resize → fit terminals
        window.addEventListener('resize', () => {
            if (this.activeTabId) {
                const termInfo = this.terminals.get(this.activeTabId);
                if (termInfo) {
                    try { termInfo.fitAddon.fit(); } catch (e) { }
                    document.getElementById('statusSize').textContent =
                        `${termInfo.terminal.cols}×${termInfo.terminal.rows}`;
                }
            }
        });

        // Sidebar resize
        this.initSidebarResize();

        // Close context menu on scroll
        document.addEventListener('scroll', () => {
            document.getElementById('contextMenu').classList.remove('visible');
        }, true);
    }

    initSidebarResize() {
        const handle = document.getElementById('sidebarResizeHandle');
        const sidebar = document.getElementById('sidebar');
        let isResizing = false;

        handle.addEventListener('mousedown', (e) => {
            isResizing = true;
            handle.classList.add('active');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const width = Math.min(Math.max(e.clientX, 200), 450);
            sidebar.style.width = `${width}px`;

            // Refit active terminal
            if (this.activeTabId) {
                const termInfo = this.terminals.get(this.activeTabId);
                if (termInfo) {
                    try { termInfo.fitAddon.fit(); } catch (e2) { }
                }
            }
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                handle.classList.remove('active');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            }
        });
    }

    // ============================================================
    // Auto Refresh
    // ============================================================

    startAutoRefresh() {
        this.refreshInterval = setInterval(() => {
            this.refreshSessions();
        }, 5000);
    }

    updateConnectionStatus(connected) {
        const indicator = document.getElementById('connectionStatus');
        const text = indicator.querySelector('.status-text');
        if (connected) {
            indicator.classList.remove('disconnected');
            text.textContent = 'Connected';
        } else {
            indicator.classList.add('disconnected');
            text.textContent = 'Disconnected';
        }
    }

    // ============================================================
    // Utilities
    // ============================================================

    esc(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

// Initialize app
const app = new TmuxPlantApp();
